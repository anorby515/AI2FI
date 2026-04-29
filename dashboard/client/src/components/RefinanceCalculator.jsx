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

    return {
      curBalance, curRate, curPmt, curMonthsLeft, curRemainingInterest, curPayoffIso,
      newLoanAmount, newRate, newTerm, newPmt, newTotalInterest, newPayoffIso,
      monthlySavings, totalRefiCost, upfrontCost, pointsCost,
      breakEvenMonths, breakEvenIso,
      lifetimeInterestDelta, lifetimeNetSavings,
      effectiveAPR,
    };
  }, [data, newPrincipal, newRatePct, newTermYears, closingCosts, rollIntoLoan, cashOut, pointsPct]);

  // ── Break-even chart series ──────────────────────────────────────
  const beChart = useMemo(() => {
    if (!calc || !calc.breakEvenMonths || !calc.monthlySavings) return null;
    const horizon = Math.min(360, Math.max(36, Math.ceil(calc.breakEvenMonths * 2)));
    const pts = [];
    for (let m = 0; m <= horizon; m++) {
      pts.push({ m, cumSavings: m * calc.monthlySavings });
    }
    return { pts, horizon, cost: calc.totalRefiCost, breakEvenMonths: calc.breakEvenMonths };
  }, [calc]);

  if (errorBody) return <RefiEmpty body={errorBody} />;
  if (!data || !calc) return <div className="rc__loading">Loading mortgage…</div>;

  const m = calc;

  // Recommendation chip
  let verdictLabel = 'Refinance unlikely to save money';
  let verdictTone = 'neg';
  if (m.monthlySavings != null && m.monthlySavings > 0 && m.breakEvenMonths != null) {
    if (m.breakEvenMonths < 36 && m.lifetimeNetSavings > 0) {
      verdictLabel = 'Refi looks favorable';
      verdictTone = 'pos';
    } else if (m.lifetimeNetSavings > 0) {
      verdictLabel = 'Refi is borderline';
      verdictTone = 'neutral';
    } else {
      verdictLabel = 'Refi costs exceed lifetime interest savings';
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
          </div>
        </Card>

        <Card>
          <div className="rc__section-title">New Loan Summary</div>
          <div className="rc__current-grid">
            <Stat label="New Loan Amount"   value={fmtUSD(m.newLoanAmount)} />
            <Stat label="New Monthly P&I"   value={fmtUSD(m.newPmt)} />
            <Stat label="New Term"          value={fmtMonths(m.newTerm)} />
            <Stat label="New Total Interest" value={fmtUSD(m.newTotalInterest)} />
            <Stat label="Effective APR"     value={fmtPct(m.effectiveAPR)} sub="rate + closing costs" />
            <Stat label="New Payoff"        value={fmtDate(m.newPayoffIso)} />
          </div>
        </Card>
      </div>

      {/* Break-even analysis */}
      <Card>
        <div className="rc__section-title">Break-Even Analysis</div>
        <div className="rc__be-grid">
          <Stat
            label="Monthly Savings"
            value={fmtUSD(m.monthlySavings)}
            tone={m.monthlySavings > 0 ? 'pos' : m.monthlySavings < 0 ? 'neg' : 'neutral'}
          />
          <Stat label="Total Refi Cost"   value={fmtUSD(m.totalRefiCost)} sub={m.pointsCost > 0 ? `incl. ${fmtUSD0(m.pointsCost)} in points` : null} />
          <Stat label="Out of Pocket"     value={fmtUSD(m.upfrontCost)} sub={rollIntoLoan ? 'closing costs rolled in' : 'paid at closing'} />
          <Stat
            label="Break-Even"
            value={m.breakEvenMonths ? fmtMonths(m.breakEvenMonths) : 'Never'}
            sub={m.breakEvenIso ? fmtDate(m.breakEvenIso) : null}
            tone={m.breakEvenMonths && m.breakEvenMonths < 36 ? 'pos' : 'neutral'}
          />
          <Stat
            label="Lifetime Interest Δ"
            value={fmtUSD(m.lifetimeInterestDelta)}
            tone={m.lifetimeInterestDelta > 0 ? 'pos' : 'neg'}
            sub="current interest left − new interest"
          />
          <Stat
            label="Lifetime Net Savings"
            value={fmtUSD(m.lifetimeNetSavings)}
            tone={m.lifetimeNetSavings > 0 ? 'pos' : 'neg'}
            sub="after refi costs"
          />
        </div>

        <div className={`rc__verdict rc__verdict--${verdictTone}`}>{verdictLabel}</div>

        {beChart && <BreakEvenChart {...beChart} />}
      </Card>
    </div>
  );
}

// ── Break-even SVG chart: cumulative savings vs sunk cost line ───────
function BreakEvenChart({ pts, horizon, cost, breakEvenMonths }) {
  const width = 1000;
  const height = 240;
  const pad = { t: 16, r: 16, b: 32, l: 64 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const xMax = horizon;
  const yMax = Math.max(cost * 1.15, pts[pts.length - 1].cumSavings * 1.05);
  const x = (m) => pad.l + (m / xMax) * plotW;
  const y = (v) => pad.t + (1 - v / yMax) * plotH;

  const savingsPath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.m).toFixed(2)} ${y(p.cumSavings).toFixed(2)}`)
    .join(' ');

  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const v = (yMax * i) / 4;
    yTicks.push({ v, y: y(v) });
  }
  const xTicks = [];
  const step = Math.max(6, Math.round(xMax / 8));
  for (let m = 0; m <= xMax; m += step) {
    xTicks.push({ m, x: x(m) });
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

      {/* Sunk-cost horizontal line */}
      <line className="rc__svg-cost" x1={pad.l} y1={y(cost)} x2={width - pad.r} y2={y(cost)} />
      <text className="rc__svg-cost-label" x={width - pad.r - 8} y={y(cost) - 6} textAnchor="end">
        Refi cost: {fmtUSD0(cost)}
      </text>

      {/* Break-even marker */}
      <line className="rc__svg-marker" x1={x(breakEvenMonths)} y1={pad.t} x2={x(breakEvenMonths)} y2={pad.t + plotH} />
      <text className="rc__svg-marker-text" x={x(breakEvenMonths) + 6} y={pad.t + 12}>
        Break-even · month {Math.ceil(breakEvenMonths)}
      </text>

      {/* Cumulative savings line */}
      <path d={savingsPath} className="rc__svg-savings" />
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
