import { useEffect, useMemo, useState } from 'react';
import { Card, Stat } from '../ui';
import './MortgageView.css';

/**
 * MortgageView — Progress + What If tabs for the user's mortgage.
 *
 * Reads /api/mortgage which returns the Mortgage tab from Finances.xlsx
 * (or the demo template). Renders an amortization Progress view and a
 * What If simulator that compares "extra payment" scenarios against the
 * current trajectory.
 *
 * Modeled after the wireframes in the issue: a stacked balance bar,
 * 4-line projected payoff chart on Progress; dashed-vs-solid scenario
 * comparison on What If. The Payments tab from the wireframes is shown
 * as a disabled stub — out of scope for this view.
 */

const MONTHS_IN_YEAR = 12;

function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}

function fmtUSDK(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1_000_000) return s + '$' + (a / 1_000_000).toFixed(2) + 'M';
  if (a >= 1_000) return s + '$' + Math.round(a / 1_000) + 'K';
  return s + '$' + Math.round(a);
}

function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v * 100).toFixed(v < 0.001 ? 3 : 2) + '%';
}

function fmtPayoffDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Add `n` months to an ISO `YYYY-MM-DD` date and return a new Date.
function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d;
}

function dateToIso(d) {
  return d.toISOString().slice(0, 10);
}

// Simulate fixed-rate amortization until paid off (or maxMonths cap).
// Returns [{ date, balance, cumulativeInterest, cumulativePrincipal }, ...]
function amortize({ balance, monthlyRate, monthlyPayment, extra = 0, startDate, maxMonths = 720 }) {
  const out = [{
    date: startDate,
    balance,
    cumulativeInterest: 0,
    cumulativePrincipal: 0,
  }];
  let bal = balance;
  let cumI = 0;
  let cumP = 0;
  for (let m = 1; m <= maxMonths && bal > 0.01; m++) {
    const interest = bal * monthlyRate;
    let principal = monthlyPayment - interest + extra;
    if (principal <= 0) break; // payment doesn't even cover interest — bail to avoid infinite loop
    if (principal > bal) principal = bal;
    bal -= principal;
    cumI += interest;
    cumP += principal;
    out.push({
      date: dateToIso(addMonths(startDate, m)),
      balance: bal,
      cumulativeInterest: cumI,
      cumulativePrincipal: cumP,
    });
  }
  return out;
}

// Build the "expected" trajectory: linearly interpolate the past from
// origination_date to as_of_date (where extra payments have already
// happened — we don't have the transaction log), then amortize forward
// from current_balance.
function buildExpectedTrajectory(m) {
  const past = [];
  const startD = new Date(m.origination_date + 'T00:00:00');
  const asOfD  = new Date(m.as_of_date + 'T00:00:00');
  const months = Math.max(1, Math.round((asOfD - startD) / (1000 * 60 * 60 * 24 * 30.4375)));
  for (let i = 0; i <= months; i++) {
    const t = i / months;
    past.push({
      date: dateToIso(addMonths(m.origination_date, i)),
      balance: m.original_principal + (m.current_balance - m.original_principal) * t,
      cumulativeInterest: m.interest_paid * t,
      cumulativePrincipal: m.principal_paid * t,
    });
  }
  const future = amortize({
    balance: m.current_balance,
    monthlyRate: m.interest_rate / MONTHS_IN_YEAR,
    monthlyPayment: m.monthly_payment,
    extra: 0,
    startDate: m.as_of_date,
  });
  // Splice future on top of past — drop duplicate first point, and
  // continue cumulatives from where the past left off.
  const baseI = m.interest_paid;
  const baseP = m.principal_paid;
  const merged = past.slice();
  for (let i = 1; i < future.length; i++) {
    const p = future[i];
    merged.push({
      date: p.date,
      balance: p.balance,
      cumulativeInterest: baseI + p.cumulativeInterest,
      cumulativePrincipal: baseP + p.cumulativePrincipal,
    });
  }
  return merged;
}

// Original trajectory — no extra payments, from origination forward.
function buildOriginalTrajectory(m) {
  return amortize({
    balance: m.original_principal,
    monthlyRate: m.interest_rate / MONTHS_IN_YEAR,
    monthlyPayment: m.monthly_payment,
    extra: 0,
    startDate: m.origination_date,
  });
}

// What-If trajectory — from as_of_date forward, with extra applied. The
// "extra" semantics depend on the scenario type. Returns the same merged
// past + future shape as the expected trajectory.
function buildWhatIfTrajectory(m, scenario) {
  // Past portion is identical to the expected trajectory — the user can't
  // change history. We re-use the linear-interpolated past.
  const expected = buildExpectedTrajectory(m);
  const cutoff = expected.findIndex(p => p.date >= m.as_of_date);
  const past = cutoff >= 0 ? expected.slice(0, cutoff + 1) : expected;
  const baseI = past[past.length - 1].cumulativeInterest;
  const baseP = past[past.length - 1].cumulativePrincipal;

  let future;
  if (scenario.type === 'extra-each') {
    future = amortize({
      balance: m.current_balance,
      monthlyRate: m.interest_rate / MONTHS_IN_YEAR,
      monthlyPayment: m.monthly_payment,
      extra: scenario.amount || 0,
      startDate: m.as_of_date,
    });
  } else if (scenario.type === 'lump-sum') {
    const remainingBalance = Math.max(0, m.current_balance - (scenario.amount || 0));
    future = amortize({
      balance: remainingBalance,
      monthlyRate: m.interest_rate / MONTHS_IN_YEAR,
      monthlyPayment: m.monthly_payment,
      extra: 0,
      startDate: m.as_of_date,
    });
    // Fold the lump sum into the cumulative principal at the start of the future series
    // so the first plotted point reflects the principal jump.
    if (future.length) future[0].cumulativePrincipal += (scenario.amount || 0);
  } else {
    future = amortize({
      balance: m.current_balance,
      monthlyRate: m.interest_rate / MONTHS_IN_YEAR,
      monthlyPayment: m.monthly_payment,
      extra: 0,
      startDate: m.as_of_date,
    });
  }

  const merged = past.slice();
  for (let i = 1; i < future.length; i++) {
    const p = future[i];
    merged.push({
      date: p.date,
      balance: p.balance,
      cumulativeInterest: baseI + p.cumulativeInterest,
      cumulativePrincipal: baseP + p.cumulativePrincipal,
    });
  }
  return merged;
}

// ── Multi-line SVG chart ─────────────────────────────────────────────

function ProjectionChart({ series, todayDate, payoffDate, height = 380 }) {
  const width = 1000;
  const pad = { t: 24, r: 24, b: 36, l: 64 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const glowId = 'mv-chart-glow';

  const allPoints = series.flatMap(s => s.data);
  if (!allPoints.length) return null;
  const xMin = Math.min(...allPoints.map(p => +new Date(p.date)));
  const xMax = Math.max(...allPoints.map(p => +new Date(p.date)));
  const yValues = allPoints.flatMap(p => [p.y].filter(v => Number.isFinite(v)));
  const yMin = 0;
  const yMax = Math.max(...yValues) * 1.05;

  const x = (iso) => pad.l + ((+new Date(iso) - xMin) / Math.max(1, xMax - xMin)) * plotW;
  const y = (v) => pad.t + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * plotH;

  function linePath(data) {
    return data
      .filter(p => Number.isFinite(p.y))
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date).toFixed(2)} ${y(p.y).toFixed(2)}`)
      .join(' ');
  }

  // Y-axis ticks
  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * (i / 4);
    yTicks.push({ v, y: y(v) });
  }

  // X-axis ticks — yearly
  const startYear = new Date(xMin).getFullYear();
  const endYear   = new Date(xMax).getFullYear();
  const xTicks = [];
  const yearStep = Math.max(1, Math.ceil((endYear - startYear) / 7));
  for (let yr = startYear; yr <= endYear; yr += yearStep) {
    const iso = `${yr}-01-01`;
    xTicks.push({ year: yr, x: x(iso) });
  }

  return (
    <svg className="mv__svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Y-axis grid + labels */}
      <g className="mv__svg-grid">
        {yTicks.map((t, i) => (
          <line key={i} x1={pad.l} y1={t.y} x2={width - pad.r} y2={t.y} />
        ))}
      </g>
      {yTicks.map((t, i) => (
        <text key={`yl${i}`} className="mv__svg-axis" x={pad.l - 10} y={t.y + 4} textAnchor="end">
          {fmtUSDK(t.v)}
        </text>
      ))}

      {/* X-axis labels */}
      {xTicks.map((t) => (
        <text key={`x${t.year}`} className="mv__svg-axis" x={t.x} y={height - pad.b + 18} textAnchor="middle">
          {t.year}
        </text>
      ))}

      {/* Today + Payoff markers */}
      {todayDate && (
        <g>
          <line className="mv__svg-marker" x1={x(todayDate)} y1={pad.t} x2={x(todayDate)} y2={pad.t + plotH} />
          <text className="mv__svg-marker-text" x={x(todayDate) + 6} y={pad.t + 12}>Today</text>
        </g>
      )}
      {payoffDate && (
        <g>
          <line className="mv__svg-marker" x1={x(payoffDate)} y1={pad.t} x2={x(payoffDate)} y2={pad.t + plotH} />
          <text className="mv__svg-marker-text" x={x(payoffDate) + 6} y={pad.t + 12}>Payoff</text>
        </g>
      )}

      {/* Series — each line gets a soft blur underlay (matches NetWorth).
          `muted` series skip the glow and ride at lower opacity so the
          bold "expected" line reads as primary. */}
      {series.map((s, i) => {
        const dash = s.dashed ? '6 5' : undefined;
        return (
          <g key={i} opacity={s.muted ? 0.35 : 1}>
            {!s.muted && (
              <path
                d={linePath(s.data)}
                fill="none"
                stroke={s.color}
                strokeWidth="5"
                strokeDasharray={dash}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.35"
                filter={`url(#${glowId})`}
              />
            )}
            <path
              d={linePath(s.data)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeDasharray={dash}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

// ── Stacked balance bar (Principal Paid · Interest Paid · Remaining) ─

function BalanceBar({ principalPaid, interestPaid, remaining }) {
  const total = principalPaid + interestPaid + remaining;
  if (!total) return null;
  const pPct = (principalPaid / total) * 100;
  const iPct = (interestPaid / total) * 100;
  const rPct = 100 - pPct - iPct;

  // Position the labels at the centerline of their respective segments.
  const principalCenter = pPct / 2;
  const interestCenter  = pPct + iPct / 2;

  return (
    <div className="mv__balance-bar-wrap">
      <div className="mv__balance-tag mv__balance-tag-top" style={{ left: `${principalCenter}%` }}>
        Principal Paid: <span className="mv__balance-tag-strong">{fmtUSD(principalPaid)}</span>
      </div>
      <div className="mv__balance-bar">
        <div className="mv__balance-bar-principal" style={{ width: `${pPct}%` }} />
        <div className="mv__balance-bar-interest"  style={{ width: `${iPct}%` }} />
        <div className="mv__balance-bar-rest"      style={{ width: `${rPct}%` }} />
      </div>
      <div className="mv__balance-tag mv__balance-tag-bottom" style={{ left: `${interestCenter}%` }}>
        Interest Paid (estimate): <span className="mv__balance-tag-strong">{fmtUSD(interestPaid)}</span>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

const SCENARIO_OPTIONS = [
  { value: 'extra-each', label: 'Pay Extra Each Payment' },
  { value: 'lump-sum',   label: 'Pay Extra One Time' },
];

export default function MortgageView() {
  const [data, setData] = useState(null);
  const [errorBody, setErrorBody] = useState(null);

  const [scenarioType, setScenarioType] = useState('extra-each');
  const [scenarioAmount, setScenarioAmount] = useState(0);
  // Derived — the chart and the What If row read from this every render.
  const scenario = useMemo(
    () => ({ type: scenarioType, amount: scenarioAmount }),
    [scenarioType, scenarioAmount],
  );

  useEffect(() => {
    fetch('/api/mortgage')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErrorBody({ status: r.status, ...body });
          return null;
        }
        return body;
      })
      .then((body) => { if (body) setData(body); })
      .catch((e) => setErrorBody({ status: 0, error: e.message }));
  }, []);

  const expected = useMemo(() => data && buildExpectedTrajectory(data), [data]);
  const original = useMemo(() => data && buildOriginalTrajectory(data), [data]);
  const whatIf   = useMemo(
    () => data && buildWhatIfTrajectory(data, scenario),
    [data, scenario]
  );

  if (errorBody) return <MortgageEmpty body={errorBody} />;
  if (!data || !expected || !original) return <div className="mv__loading">Loading mortgage…</div>;

  // Top-line numbers
  const expectedPayoffIso = expected[expected.length - 1].date;
  const originalPayoffIso = original[original.length - 1].date;
  const expectedTotalInterest = expected[expected.length - 1].cumulativeInterest;
  const originalTotalInterest = original[original.length - 1].cumulativeInterest;
  const remaining = data.current_balance;

  const todayDate = data.as_of_date;

  // What-if specific
  const wiPayoffIso = whatIf?.[whatIf.length - 1]?.date;
  const wiTotalInterest = whatIf?.[whatIf.length - 1]?.cumulativeInterest;

  function resetScenario() {
    setScenarioType('extra-each');
    setScenarioAmount(0);
  }

  // Whether to draw the dashed What If lines on the chart. When amount is 0
  // they would exactly overlap the solid Expected pair, so skip them to keep
  // the chart clean.
  const whatIfActive = scenarioAmount > 0;

  const chartSeries = [
    // Muted "Original" pair — paints first so the brighter lines sit on top.
    { name: 'Original Interest Cost',    color: 'var(--accent-2)', muted: true,
      data: original.map(p => ({ date: p.date, y: p.cumulativeInterest })) },
    { name: 'Original Principal Payoff', color: 'var(--accent)',   muted: true,
      data: original.map(p => ({ date: p.date, y: p.balance })) },
    { name: 'Expected Interest Cost',    color: 'var(--accent-2)',
      data: expected.map(p => ({ date: p.date, y: p.cumulativeInterest })) },
    { name: 'Expected Principal Payoff', color: 'var(--accent)',
      data: expected.map(p => ({ date: p.date, y: p.balance })) },
  ];
  if (whatIfActive && whatIf) {
    chartSeries.push(
      { name: 'What If Interest Cost',     color: 'var(--accent-2)', dashed: true,
        data: whatIf.map(p => ({ date: p.date, y: p.cumulativeInterest })) },
      { name: 'What If Principal Payoff',  color: 'var(--accent)',   dashed: true,
        data: whatIf.map(p => ({ date: p.date, y: p.balance })) },
    );
  }

  const interestSavedFromExtras = Math.max(0, originalTotalInterest - expectedTotalInterest);
  const whatIfInterestSaved     = Math.max(0, expectedTotalInterest - (wiTotalInterest ?? expectedTotalInterest));

  // Slider range depends on scenario type. Extra-per-payment caps at 1× the
  // monthly payment (already a meaningful prepayment); lump-sum caps at the
  // current balance so the user can simulate paying it off entirely.
  const sliderMax = scenarioType === 'extra-each'
    ? Math.max(500, Math.round(data.monthly_payment))
    : Math.max(1000, Math.round(data.current_balance));
  const sliderStep = scenarioType === 'extra-each' ? 25 : 1000;

  return (
    <div className="mv">
      {/* Page header — property name only */}
      <div className="mv__page-header">{data.property || 'Mortgage'}</div>

      {/* Scoreboard — three rows of four cards */}
      <div className="mv__stat-grid">
        {/* Row 1 — Original loan terms */}
        <Card><Stat label="Original Principal" value={fmtUSD(data.original_principal)} /></Card>
        <Card><Stat label="Payment"            value={fmtUSD(data.monthly_payment)} /></Card>
        <Card><Stat label="Interest Rate"      value={fmtPct(data.interest_rate)} /></Card>
        <Card><Stat label="Original Payoff"    value={fmtPayoffDate(originalPayoffIso)} /></Card>

        {/* Row 2 — Current trajectory (expected) */}
        <Card><Stat label="Current Balance"    value={fmtUSD(remaining)} /></Card>
        <Card><Stat label="Interest Cost"      value={fmtUSD(expectedTotalInterest)} /></Card>
        <Card><Stat label="Interest Saved"     value={fmtUSD(interestSavedFromExtras)} tone={interestSavedFromExtras > 0 ? 'pos' : 'neutral'} /></Card>
        <Card><Stat label="Expected Payoff"    value={fmtPayoffDate(expectedPayoffIso)} /></Card>

        {/* Row 3 — What If scenario. The first cell holds the entire What If
            form so the inputs sit directly above the metrics they drive. */}
        <Card className="mv__whatif-cell">
          <div className="mv__section-title">What If Scenario</div>
          <div className="mv__whatif-form">
            <div className="mv__whatif-controls">
              <button className="mv__whatif-btn mv__whatif-btn--ghost" onClick={resetScenario}>
                Reset
              </button>
              <div className="mv__whatif-radios">
                {SCENARIO_OPTIONS.map(o => (
                  <label key={o.value} className="mv__whatif-radio">
                    <input
                      type="radio"
                      name="mv-whatif-type"
                      value={o.value}
                      checked={scenarioType === o.value}
                      onChange={() => setScenarioType(o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mv__whatif-amount">
              <input
                type="range"
                className="mv__whatif-slider"
                min={0}
                max={sliderMax}
                step={sliderStep}
                value={Math.min(scenarioAmount, sliderMax)}
                onChange={(e) => setScenarioAmount(parseFloat(e.target.value) || 0)}
                style={{ '--mv-slider-fill': `${(Math.min(scenarioAmount, sliderMax) / sliderMax) * 100}%` }}
                aria-label="Extra payment amount"
              />
              <input
                type="number"
                className="mv__whatif-number"
                min={0}
                step={sliderStep}
                value={scenarioAmount}
                onChange={(e) => setScenarioAmount(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </Card>
        <Card><Stat label="What If Interest Cost"  value={fmtUSD(wiTotalInterest)} /></Card>
        <Card><Stat label="What If Interest Saved" value={fmtUSD(whatIfInterestSaved)} tone={whatIfInterestSaved > 0 ? 'pos' : 'neutral'} /></Card>
        <Card><Stat label="What If Payoff"         value={fmtPayoffDate(wiPayoffIso)} /></Card>
      </div>

      {/* Progress — full width */}
      <Card>
        <div className="mv__section-title">Progress</div>
        <BalanceBar
          principalPaid={data.principal_paid}
          interestPaid={data.interest_paid}
          remaining={remaining}
        />
      </Card>

      {/* Projected Payoff chart — full width */}
      <Card>
        <div className="mv__section-title">Projected Payoff</div>
        <ProjectionChart
          series={chartSeries}
          todayDate={todayDate}
          payoffDate={whatIfActive ? wiPayoffIso : expectedPayoffIso}
        />
      </Card>
    </div>
  );
}


function MortgageEmpty({ body }) {
  const isMissingTab = body?.error && /No Mortgage tab/i.test(body.error);
  return (
    <div className="mv__empty">
      <div style={{ marginBottom: 12, fontSize: 14 }}>
        {body.error || `Mortgage data unavailable (HTTP ${body.status}).`}
      </div>
      {isMissingTab && (
        <>
          {body.spreadsheetPath && (
            <div style={{ fontSize: 12, marginBottom: 12 }}>
              Spreadsheet: <code>{body.spreadsheetPath}</code>
            </div>
          )}
          {Array.isArray(body.availableTabs) && body.availableTabs.length > 0 && (
            <div style={{ fontSize: 12, marginBottom: 12 }}>
              Tabs found: {body.availableTabs.map(t => <code key={t} style={{ marginRight: 6 }}>{t}</code>)}
            </div>
          )}
          {body.hint && <div style={{ fontSize: 12 }}>{body.hint}</div>}
        </>
      )}
    </div>
  );
}
