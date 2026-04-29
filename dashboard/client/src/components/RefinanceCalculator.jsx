import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Stat, Button, Segment } from '../ui';
import './RefinanceCalculator.css';

const MONTHS_IN_YEAR = 12;

function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}

function fmtUSD0(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v * 100).toFixed(v < 0.001 ? 3 : 3) + '%';
}

function fmtMonths(n) {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  const yrs = Math.floor(n / 12);
  const mos = Math.round(n - yrs * 12);
  if (yrs && mos) return `${yrs} yr ${mos} mo`;
  if (yrs) return `${yrs} yr`;
  return `${mos} mo`;
}

// Signed dollar delta — "+$1,200" / "−$1,200" / "$0".
function fmtUSDDelta(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) < 0.5) return '$0';
  const sign = v > 0 ? '+' : '−';
  const abs = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(v));
  return sign + abs;
}

// Signed month delta — "+24 mo", "−6 mo", "0 mo".
function fmtMonthsDelta(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Math.round(n);
  if (r === 0) return '0 mo';
  const sign = r > 0 ? '+' : '−';
  const absN = Math.abs(r);
  const yrs = Math.floor(absN / 12);
  const mos = absN - yrs * 12;
  if (yrs && mos) return `${sign}${yrs} yr ${mos} mo`;
  if (yrs) return `${sign}${yrs} yr`;
  return `${sign}${mos} mo`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// Standard fixed-rate P&I payment formula.
function pAndI(principal, annualRate, termMonths) {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(termMonths) || termMonths <= 0) {
    return null;
  }
  if (principal <= 0) return 0;
  const r = annualRate / MONTHS_IN_YEAR;
  if (r === 0) return principal / termMonths;
  const factor = Math.pow(1 + r, termMonths);
  return principal * (r * factor) / (factor - 1);
}

// Months remaining on a loan given current balance, rate, and current monthly P&I.
function monthsRemaining(balance, annualRate, monthlyPayment) {
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  const r = annualRate / MONTHS_IN_YEAR;
  if (r === 0) return balance / monthlyPayment;
  const denom = Math.log(1 + r);
  const inside = monthlyPayment / (monthlyPayment - balance * r);
  if (!Number.isFinite(inside) || inside <= 0) return Infinity;
  return Math.log(inside) / denom;
}

// Total interest paid over the life of a fully amortized loan.
function totalInterest(principal, annualRate, termMonths) {
  const pmt = pAndI(principal, annualRate, termMonths);
  if (pmt == null) return null;
  return pmt * termMonths - principal;
}

// Month-by-month amortization. Returns parallel arrays where index `m` is the
// state at the END of month m. Index 0 is t=0 (no payments yet). Once the
// balance hits zero we stop accruing interest but pad the arrays out to
// `maxMonths` so callers can compare two schedules of equal length.
function amortizeSchedule(balance, annualRate, monthlyPayment, maxMonths) {
  const r = annualRate / MONTHS_IN_YEAR;
  const cumI = [0];
  const bals = [balance];
  let bal = balance;
  let ci = 0;
  for (let m = 1; m <= maxMonths; m++) {
    if (bal <= 0.01 || monthlyPayment <= 0) {
      cumI.push(ci); bals.push(0);
      continue;
    }
    const interest = bal * r;
    let principal = monthlyPayment - interest;
    if (principal <= 0) { cumI.push(ci); bals.push(bal); continue; }
    if (principal > bal) principal = bal;
    bal -= principal;
    ci += interest;
    cumI.push(ci); bals.push(bal);
  }
  return { cumI, bals };
}

// Number input that renders a $/% chrome and parses on blur/change.
function NumberField({ label, value, onChange, prefix, suffix, step = 1, min, hint }) {
  return (
    <label className="rc__field">
      <span className="rc__field-label">{label}</span>
      <span className="rc__field-input">
        {prefix && <span className="rc__field-prefix">{prefix}</span>}
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? null : parseFloat(v));
          }}
          step={step}
          min={min}
        />
        {suffix && <span className="rc__field-suffix">{suffix}</span>}
      </span>
      {hint && <span className="rc__field-hint">{hint}</span>}
    </label>
  );
}

const TERM_OPTIONS = [
  { value: 10, label: '10 yr' },
  { value: 15, label: '15 yr' },
  { value: 20, label: '20 yr' },
  { value: 25, label: '25 yr' },
  { value: 30, label: '30 yr' },
];

export default function RefinanceCalculator() {
  const [data, setData] = useState(null);
  const [errorBody, setErrorBody] = useState(null);

  const reload = useCallback(() => {
    setErrorBody(null);
    fetch('/api/mortgage')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) { setErrorBody({ status: r.status, ...body }); return null; }
        return body;
      })
      .then((body) => { if (body) setData(body); })
      .catch((e) => setErrorBody({ status: 0, error: e.message }));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // ── Refi inputs ──────────────────────────────────────────────────
  const [newPrincipal, setNewPrincipal] = useState(null);    // dollars
  const [newRatePct, setNewRatePct] = useState(null);        // percent (e.g. 6.25)
  const [newTermYears, setNewTermYears] = useState(30);
  const [closingCosts, setClosingCosts] = useState(5000);
  const [rollIntoLoan, setRollIntoLoan] = useState(false);
  const [cashOut, setCashOut] = useState(0);
  const [pointsPct, setPointsPct] = useState(0);
  const [discountRatePct, setDiscountRatePct] = useState(5);

  // Seed defaults from the mortgage data once it loads.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (data && !seeded) {
      setNewPrincipal(Math.round(data.current_balance || 0));
      // Suggest a starting rate 1pp below current as a sane default.
      const cur = (data.interest_rate || 0) * 100;
      setNewRatePct(Math.max(1, +(cur - 1).toFixed(3)));
      setSeeded(true);
    }
  }, [data, seeded]);

  // ── Derived ──────────────────────────────────────────────────────
  const calc = useMemo(() => {
    if (!data) return null;
    const curBalance = data.current_balance || 0;
    const curRate = data.interest_rate || 0;
    const curPmt = data.monthly_payment || 0;

    const curMonthsLeft = monthsRemaining(curBalance, curRate, curPmt);
    const curRemainingInterest = Number.isFinite(curMonthsLeft)
      ? curPmt * curMonthsLeft - curBalance
      : null;
    const curPayoffIso = Number.isFinite(curMonthsLeft)
      ? addMonths(data.as_of_date, Math.ceil(curMonthsLeft))
      : null;

    const baseP = Number.isFinite(newPrincipal) ? newPrincipal : 0;
    const cash  = Number.isFinite(cashOut) ? Math.max(0, cashOut) : 0;
    const cc    = Number.isFinite(closingCosts) ? Math.max(0, closingCosts) : 0;
    const pts   = Number.isFinite(pointsPct) ? Math.max(0, pointsPct) : 0;

    // Discount points: percent of new loan amount paid up front; modeled as
    // additional cash-out-of-pocket cost rather than rolled in.
    const principalPlusCash = baseP + cash;
    const newLoanAmount = rollIntoLoan ? principalPlusCash + cc : principalPlusCash;
    const pointsCost = newLoanAmount * (pts / 100);
    const upfrontCost = (rollIntoLoan ? 0 : cc) + pointsCost;

    const newRate = (Number.isFinite(newRatePct) ? newRatePct : 0) / 100;
    const newTerm = (Number.isFinite(newTermYears) ? newTermYears : 0) * MONTHS_IN_YEAR;
    const newPmt = pAndI(newLoanAmount, newRate, newTerm);
    const newTotalInterest = totalInterest(newLoanAmount, newRate, newTerm);
    const newPayoffIso = newTerm > 0 ? addMonths(data.as_of_date, newTerm) : null;

    const monthlySavings = (curPmt && newPmt != null) ? curPmt - newPmt : null;

    // Break-even: months of savings needed to recoup the upfront cost. If the
    // refi costs got rolled in, the user's out-of-pocket is just points;
    // total cost-of-refi for break-even is still cc + points (the rolled-in
    // closing costs accrue interest, so they aren't free).
    const totalRefiCost = cc + pointsCost;
    const breakEvenMonths = (monthlySavings && monthlySavings > 0)
      ? totalRefiCost / monthlySavings
      : null;
    const breakEvenIso = breakEvenMonths
      ? addMonths(data.as_of_date, Math.ceil(breakEvenMonths))
      : null;

    // Lifetime interest savings: interest left on current loan vs total
    // interest on the new loan, minus the cost of refinancing.
    const lifetimeInterestDelta = (curRemainingInterest != null && newTotalInterest != null)
      ? curRemainingInterest - newTotalInterest
      : null;
    const lifetimeNetSavings = (lifetimeInterestDelta != null)
      ? lifetimeInterestDelta - totalRefiCost
      : null;

    // Effective APR-ish: amortize the new loan including closing costs in the
    // numerator but not the principal — gives the user a sense of what the
    // refi "really" costs vs. the headline rate. Uses Newton's method on the
    // relationship principal_minus_costs = pmt × (1 - (1+r)^-n) / r.
    const effectiveAPR = (() => {
      if (!newPmt || !newTerm || newLoanAmount <= 0) return null;
      const netProceeds = newLoanAmount - totalRefiCost;
      if (netProceeds <= 0) return null;
      let r = newRate / MONTHS_IN_YEAR || 0.005;
      for (let i = 0; i < 80; i++) {
        const factor = Math.pow(1 + r, newTerm);
        const pv = newPmt * (1 - 1 / factor) / r;
        const dpv = (newPmt / r) * ((1 / factor - 1) / r + (newTerm / factor) / (1 + r));
        const f = pv - netProceeds;
        const fPrime = dpv;
        const next = r - f / fPrime;
        if (!Number.isFinite(next) || next <= 0) break;
        if (Math.abs(next - r) < 1e-9) { r = next; break; }
        r = next;
      }
      return r * MONTHS_IN_YEAR;
    })();

    // Schedules over a horizon long enough to cover both loans. Used for
    // True Break-Even (interest-cost crossover) and NPV.
    const horizonMonths = Math.max(
      Number.isFinite(curMonthsLeft) ? Math.ceil(curMonthsLeft) : 0,
      newTerm,
    );

    const oldSched = amortizeSchedule(curBalance, curRate, curPmt, horizonMonths);
    const newSched = (newPmt != null && newTerm > 0)
      ? amortizeSchedule(newLoanAmount, newRate, newPmt, horizonMonths)
      : null;

    // True Break-Even: smallest m where (oldCumI − newCumI − refiCost) ≥ 0.
    // Captures interest cost on both sides and the term-reset penalty;
    // returns null ("Never") when the new loan never overtakes.
    let trueBreakEvenMonths = null;
    if (newSched && monthlySavings != null && monthlySavings > 0) {
      for (let mi = 1; mi <= horizonMonths; mi++) {
        if (oldSched.cumI[mi] - newSched.cumI[mi] - totalRefiCost >= 0) {
          trueBreakEvenMonths = mi;
          break;
        }
      }
    }
    const trueBreakEvenIso = trueBreakEvenMonths
      ? addMonths(data.as_of_date, trueBreakEvenMonths)
      : null;

    // NPV of the refi: discount the monthly cash-flow advantage stream and
    // subtract upfront costs. Cash flow at month mi:
    //   + oldPmt (if mi ≤ curMonthsLeft, you'd have been paying it)
    //   − newPmt (if mi ≤ newTerm, you actually pay it)
    // t=0 cash flow: cashOut received − upfrontCost paid.
    // Discount rate is the user's opportunity cost of capital (default 5%).
    let npv = null;
    if (newPmt != null) {
      const dMonthly = (Number.isFinite(discountRatePct) ? discountRatePct : 0) / 100 / MONTHS_IN_YEAR;
      let pv = cash - upfrontCost;
      for (let mi = 1; mi <= horizonMonths; mi++) {
        const oldOut = (mi <= curMonthsLeft) ? curPmt : 0;
        const newOut = (mi <= newTerm) ? newPmt : 0;
        const cf = oldOut - newOut;
        pv += cf / Math.pow(1 + dMonthly, mi);
      }
      npv = pv;
    }

    return {
      curBalance, curRate, curPmt, curMonthsLeft, curRemainingInterest, curPayoffIso,
      newLoanAmount, newRate, newTerm, newPmt, newTotalInterest, newPayoffIso,
      monthlySavings, totalRefiCost, upfrontCost, pointsCost,
      breakEvenMonths, breakEvenIso,
      trueBreakEvenMonths, trueBreakEvenIso,
      lifetimeInterestDelta, lifetimeNetSavings,
      npv, effectiveAPR,
      oldSched, newSched, horizonMonths,
    };
  }, [data, newPrincipal, newRatePct, newTermYears, closingCosts, rollIntoLoan, cashOut, pointsPct, discountRatePct]);

  // ── Break-even chart series ──────────────────────────────────────
  // Two lines:
  //   • Cumulative cash-flow savings (pmt × m) — crosses RefiCost at the
  //     cash-flow break-even.
  //   • Net interest benefit = (oldCumI − newCumI) − refiCost — crosses
  //     ZERO at the true break-even and goes negative when term reset
  //     wipes out the interest savings.
  const beChart = useMemo(() => {
    if (!calc || !calc.monthlySavings || calc.monthlySavings <= 0) return null;
    if (!calc.oldSched || !calc.newSched) return null;
    const cashFlowEnd = calc.breakEvenMonths || 0;
    const trueEnd = calc.trueBreakEvenMonths || calc.horizonMonths;
    const horizon = Math.min(
      360,
      Math.max(36, Math.ceil(Math.max(cashFlowEnd, trueEnd) * 1.4)),
    );
    const cap = Math.min(horizon, calc.horizonMonths);
    const pts = [];
    for (let mi = 0; mi <= cap; mi++) {
      const cumSavings = mi * calc.monthlySavings;
      const netInterest = calc.oldSched.cumI[mi] - calc.newSched.cumI[mi] - calc.totalRefiCost;
      pts.push({ m: mi, cumSavings, netInterest });
    }
    return {
      pts,
      horizon: cap,
      cost: calc.totalRefiCost,
      cashFlowBE: calc.breakEvenMonths,
      trueBE: calc.trueBreakEvenMonths,
    };
  }, [calc]);

  if (errorBody) return <RefiEmpty body={errorBody} />;
  if (!data || !calc) return <div className="rc__loading">Loading mortgage…</div>;

  const m = calc;

  // Row-2 / row-4 deltas. Sign convention: positive = "new is bigger";
  // tone is assigned at the call site so deltas in the borrower's favor
  // (smaller loan, shorter payoff, less interest) read green.
  const loanDelta = m.newLoanAmount - m.curBalance;
  const payoffDeltaMonths = (m.newTerm || 0) - (Number.isFinite(m.curMonthsLeft) ? m.curMonthsLeft : 0);
  const lifetimeInterestRowDelta = (m.newTotalInterest != null && m.curRemainingInterest != null)
    ? m.newTotalInterest - m.curRemainingInterest
    : null;

  // Verdict — anchored on NPV (the most honest single number) with break-even
  // recency and true break-even existence as supporting signals.
  let verdictLabel = 'Refinance unlikely to save money';
  let verdictTone = 'neg';
  if (m.npv != null && m.monthlySavings > 0) {
    if (m.npv > 0 && m.trueBreakEvenMonths && m.trueBreakEvenMonths <= 60) {
      verdictLabel = 'Refi looks favorable (positive NPV)';
      verdictTone = 'pos';
    } else if (m.npv > 0) {
      verdictLabel = 'Refi is borderline — positive NPV but slow true break-even';
      verdictTone = 'neutral';
    } else {
      verdictLabel = 'Refi has negative NPV — term reset wipes out the savings';
      verdictTone = 'neg';
    }
  }

  return (
    <div className="rc">
      <div className="rc__head">
        <div className="rc__page-header">Refinance Calculator</div>
        <Button variant="ghost" onClick={reload}>Reload from sheet</Button>
      </div>

      {/* Current loan summary — read-only, sourced from Mortgage tab */}
      <Card>
        <div className="rc__section-title">Current Loan · {data.property || 'Mortgage'}</div>
        <div className="rc__current-grid">
          <Stat label="Current Balance"        value={fmtUSD(m.curBalance)} />
          <Stat label="Interest Rate"          value={fmtPct(m.curRate)} />
          <Stat label="Monthly P&I"            value={fmtUSD(m.curPmt)} />
          <Stat label="Months Remaining"       value={fmtMonths(m.curMonthsLeft)} />
          <Stat label="Remaining Interest"     value={fmtUSD(m.curRemainingInterest)} />
          <Stat label="Current Payoff"         value={fmtDate(m.curPayoffIso)} />
        </div>
      </Card>

      {/* Inputs + new loan summary side by side */}
      <div className="rc__split">
        <Card>
          <div className="rc__section-title">New Loan Terms</div>
          <div className="rc__form">
            <NumberField
              label="New Principal"
              value={newPrincipal}
              onChange={setNewPrincipal}
              prefix="$"
              step={1000}
              hint={`Default is current balance: ${fmtUSD0(m.curBalance)}`}
            />
            <NumberField
              label="New Interest Rate"
              value={newRatePct}
              onChange={setNewRatePct}
              suffix="%"
              step={0.125}
            />
            <div className="rc__field">
              <span className="rc__field-label">New Term</span>
              <Segment
                options={TERM_OPTIONS}
                value={newTermYears}
                onChange={setNewTermYears}
              />
            </div>
            <NumberField
              label="Closing Costs"
              value={closingCosts}
              onChange={setClosingCosts}
              prefix="$"
              step={250}
            />
            <label className="rc__checkbox">
              <input
                type="checkbox"
                checked={rollIntoLoan}
                onChange={(e) => setRollIntoLoan(e.target.checked)}
              />
              <span>Roll closing costs into new loan</span>
            </label>
            <NumberField
              label="Cash-Out"
              value={cashOut}
              onChange={setCashOut}
              prefix="$"
              step={1000}
              hint="Extra cash pulled out at closing (added to new principal)"
            />
            <NumberField
              label="Discount Points"
              value={pointsPct}
              onChange={setPointsPct}
              suffix="%"
              step={0.125}
              hint={`1 point = 1% of new loan = ${fmtUSD0(m.newLoanAmount * 0.01)} per point`}
            />
            <NumberField
              label="Discount Rate (for NPV)"
              value={discountRatePct}
              onChange={setDiscountRatePct}
              suffix="%"
              step={0.25}
              hint="Your opportunity cost of capital — what saved cash could earn elsewhere"
            />
          </div>
        </Card>

        <Card>
          <div className="rc__section-title">New Loan Summary</div>
          <div className="rc__summary-grid">
            {/* Row 1 — headline new-loan terms */}
            <Stat label="New Loan Amount"  value={fmtUSD(m.newLoanAmount)} />
            <Stat label="New Monthly P&I"  value={fmtUSD(m.newPmt)} />
            <Stat label="New Payoff"       value={fmtDate(m.newPayoffIso)} />

            {/* Row 2 — parenthetical deltas vs current loan */}
            <Stat
              value={`(${fmtUSDDelta(loanDelta)})`}
              tone={loanDelta > 0 ? 'neg' : loanDelta < 0 ? 'pos' : 'neutral'}
            />
            <Stat
              value={`(${fmtUSDDelta(m.monthlySavings)})`}
              tone={m.monthlySavings > 0 ? 'pos' : m.monthlySavings < 0 ? 'neg' : 'neutral'}
            />
            <Stat
              value={`(${fmtMonthsDelta(payoffDeltaMonths)})`}
              tone={payoffDeltaMonths > 0 ? 'neg' : payoffDeltaMonths < 0 ? 'pos' : 'neutral'}
            />

            {/* Row 3 — lifetime totals */}
            <Stat label="New Total Interest" value={fmtUSD(m.newTotalInterest)} />
            <Stat label="Total Refi Cost"    value={fmtUSD(m.totalRefiCost)} sub={m.pointsCost > 0 ? `incl. ${fmtUSD0(m.pointsCost)} in points` : null} />
            <Stat
              label="Lifetime Net Savings"
              value={fmtUSD(m.lifetimeNetSavings)}
              tone={m.lifetimeNetSavings > 0 ? 'pos' : 'neg'}
            />

            {/* Row 4 — Δ Lifetime Interest as parenthetical, NPV + True BE as full stats */}
            <Stat
              value={`(${fmtUSDDelta(lifetimeInterestRowDelta)})`}
              tone={lifetimeInterestRowDelta < 0 ? 'pos' : lifetimeInterestRowDelta > 0 ? 'neg' : 'neutral'}
            />
            <Stat
              label={`NPV @ ${Number.isFinite(discountRatePct) ? discountRatePct : 0}%`}
              value={fmtUSD(m.npv)}
              tone={m.npv > 0 ? 'pos' : 'neg'}
            />
            <Stat
              label="True Break-Even"
              value={m.trueBreakEvenMonths ? fmtMonths(m.trueBreakEvenMonths) : 'Never'}
              tone={m.trueBreakEvenMonths && m.trueBreakEvenMonths < 60 ? 'pos' : 'neg'}
            />
          </div>

          <div className={`rc__verdict rc__verdict--${verdictTone}`}>{verdictLabel}</div>
        </Card>
      </div>

      {/* Break-even chart — full width below the side-by-side */}
      {beChart && (
        <Card>
          <div className="rc__section-title">Break-Even Chart</div>
          <BreakEvenChart {...beChart} />
        </Card>
      )}
    </div>
  );
}

// ── Break-even SVG chart: cumulative savings + net interest benefit ───
function BreakEvenChart({ pts, horizon, cost, cashFlowBE, trueBE }) {
  const width = 1000;
  const height = 280;
  const pad = { t: 16, r: 16, b: 56, l: 72 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const xMax = horizon;
  const allY = pts.flatMap(p => [p.cumSavings, p.netInterest]).concat([cost, 0]);
  const rawMin = Math.min(...allY);
  const rawMax = Math.max(...allY);
  const yMin = rawMin < 0 ? rawMin * 1.1 : 0;
  const yMax = rawMax * 1.1;
  const x = (mi) => pad.l + (mi / xMax) * plotW;
  const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const linePath = (key) => pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.m).toFixed(2)} ${y(p[key]).toFixed(2)}`)
    .join(' ');

  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const v = yMin + ((yMax - yMin) * i) / 4;
    yTicks.push({ v, y: y(v) });
  }
  const xTicks = [];
  const step = Math.max(6, Math.round(xMax / 8));
  for (let mi = 0; mi <= xMax; mi += step) {
    xTicks.push({ m: mi, x: x(mi) });
  }

  return (
    <svg className="rc__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <g className="rc__svg-grid">
        {yTicks.map((t, i) => (
          <line key={i} x1={pad.l} y1={t.y} x2={width - pad.r} y2={t.y} />
        ))}
      </g>
      {yTicks.map((t, i) => (
        <text key={`yl${i}`} className="rc__svg-axis" x={pad.l - 8} y={t.y + 4} textAnchor="end">
          {fmtUSD0(t.v)}
        </text>
      ))}
      {xTicks.map((t) => (
        <text key={`xl${t.m}`} className="rc__svg-axis" x={t.x} y={height - pad.b + 18} textAnchor="middle">
          {t.m}m
        </text>
      ))}

      {/* Zero baseline (only meaningful when net-interest line goes negative) */}
      {yMin < 0 && (
        <line className="rc__svg-zero" x1={pad.l} y1={y(0)} x2={width - pad.r} y2={y(0)} />
      )}

      {/* Sunk-cost horizontal line — anchor for cash-flow break-even */}
      <line className="rc__svg-cost" x1={pad.l} y1={y(cost)} x2={width - pad.r} y2={y(cost)} />
      <text className="rc__svg-cost-label" x={width - pad.r - 8} y={y(cost) - 6} textAnchor="end">
        Refi cost: {fmtUSD0(cost)}
      </text>

      {/* Break-even markers */}
      {cashFlowBE && (
        <g>
          <line className="rc__svg-marker" x1={x(cashFlowBE)} y1={pad.t} x2={x(cashFlowBE)} y2={pad.t + plotH} />
          <text className="rc__svg-marker-text" x={x(cashFlowBE) + 6} y={pad.t + 12}>
            Cash-flow BE · m{Math.ceil(cashFlowBE)}
          </text>
        </g>
      )}
      {trueBE && (
        <g>
          <line className="rc__svg-marker rc__svg-marker--true" x1={x(trueBE)} y1={pad.t} x2={x(trueBE)} y2={pad.t + plotH} />
          <text className="rc__svg-marker-text" x={x(trueBE) + 6} y={pad.t + 28}>
            True BE · m{trueBE}
          </text>
        </g>
      )}

      {/* Series */}
      <path d={linePath('cumSavings')}  className="rc__svg-savings" />
      <path d={linePath('netInterest')} className="rc__svg-net" />

      {/* Legend */}
      <g transform={`translate(${pad.l}, ${height - 18})`}>
        <line x1="0"   y1="0" x2="20" y2="0" className="rc__svg-savings" />
        <text x="26"  y="4" className="rc__svg-axis">Cumulative cash-flow savings</text>
        <line x1="260" y1="0" x2="280" y2="0" className="rc__svg-net" />
        <text x="286" y="4" className="rc__svg-axis">Net interest benefit (true)</text>
      </g>
    </svg>
  );
}

function RefiEmpty({ body }) {
  return (
    <div className="rc__empty">
      <div style={{ marginBottom: 12, fontSize: 14 }}>
        {body.error || `Mortgage data unavailable (HTTP ${body.status}).`}
      </div>
      <div style={{ fontSize: 12 }}>
        The Refinance Calculator pulls Current Loan values from the Mortgage tab. Add or fix that tab and reload.
      </div>
    </div>
  );
}
