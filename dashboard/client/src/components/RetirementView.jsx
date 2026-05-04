import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Card, Stat, Button, ProgressBar } from '../ui';
import { useRetirementScenarios, useRetirementInputs } from '../hooks/useRetirementScenarios';
import { runSimulation, aggregatePercentiles } from '../utils/monteCarlo';
import { prepareScenarioForSim } from '../utils/prepareSim';
import RetirementScenarioEditor, { withDefaults } from './RetirementScenarioEditor';
import './RetirementView.css';

/**
 * RetirementView — Bento "Am I on track?" overview.
 *
 * Drives every number from the active scenario + spreadsheet inputs:
 *   useRetirementInputs() supplies DOBs, current balances, etc.
 *   useRetirementScenarios() supplies the saved scenario list.
 *   runSimulation() produces the Monte Carlo paths the chart and verdict use.
 *
 * The whole right rail (scenario picker + Edit assumptions) toggles into the
 * full RetirementScenarioEditor for editable form fields, the SS optimiser,
 * and CRUD. When the editor unmounts, we re-fetch so any saved edits flow
 * back into the overview.
 */

// Mapping of spreadsheet account keys to display label + tax treatment.
// The four bands match the design spec's tax-treatment pill (with one extra
// band — "Taxable" — for ordinary brokerage accounts that didn't appear in
// the static spec).
const ACCOUNT_DISPLAY_NAME = {
  '401k': 'Pre-tax 401(k)',
  'BrokerageLink': 'BrokerageLink',
  'Traditional IRA': 'Traditional IRA',
  'Roth IRA': 'Roth IRA',
  'Brokerage': 'Taxable brokerage',
  'HSA': 'HSA (invested)',
  'ESA': 'Education savings',
  'RSU': 'RSUs (vested)',
};
const TAX_TREATMENT = {
  '401k': 'Tax-deferred',
  'BrokerageLink': 'Tax-deferred',
  'Traditional IRA': 'Tax-deferred',
  'Roth IRA': 'Tax-free',
  'Brokerage': 'Taxable',
  'HSA': 'Triple-tax',
  'ESA': 'Tax-free',
  'RSU': 'Taxable',
};
const TAX_TONE = {
  'Tax-free': 'var(--pos)',
  'Triple-tax': 'var(--accent-2)',
  'Tax-deferred': 'var(--ink-2)',
  'Taxable': 'var(--warn)',
};

// Display order for the accounts table — retirement-purpose buckets first,
// non-retirement (current-employment / earmarked for kids / taxable) after.
// HSA sits at the bottom of the retirement group because it's tax-advantaged
// for retirement saving despite the healthcare wrapper. Keys not in this
// list sort alphabetically at the end.
const ACCOUNT_ORDER = [
  '401k',
  'BrokerageLink',
  'Traditional IRA',
  'Roth IRA',
  'HSA',
  // Non-retirement boundary ↑ / ↓
  'RSU',
  'Brokerage',
  'ESA',
];
function accountRank(key) {
  const i = ACCOUNT_ORDER.indexOf(key);
  return i === -1 ? ACCOUNT_ORDER.length : i;
}

const SEQUENCE = [
  { phase: '62–67', label: 'Bridge years',    pull: 'Taxable + Roth conversions', why: "Live off taxable; convert pre-tax → Roth at low brackets." },
  { phase: '67–73', label: 'Social Security', pull: 'SS + Roth + small pre-tax',  why: "SS covers ~40% of spend; keep RMD runway low." },
  { phase: '73+',   label: 'RMDs begin',      pull: 'Required pre-tax draws',     why: "IRS forces minimums; layer Roth on top to smooth taxes." },
];

// Map per-account annual contribution from the scenario's flat contribution
// fields. The scenario stores totals (not per-account), so we approximate.
// Returns null when there's no obvious mapping.
function annualInForKey(key, scenario) {
  const c = scenario?.contributions;
  if (!c) return null;
  if (key === '401k') return (c.annual401k || 0) + (c.annualEmployerMatch || 0);
  if (key === 'Roth IRA') return c.annualRothIRA || 0;
  if (key === 'Brokerage') return c.annualTaxableSavings || 0;
  return null;
}

function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}
function fmtUSDCompact(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1_000_000) return s + '$' + (a / 1_000_000).toFixed(2) + 'M';
  if (a >= 1_000) return s + '$' + Math.round(a / 1_000) + 'k';
  return s + '$' + Math.round(a);
}
function fmtPct1(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v * 100).toFixed(1) + '%';
}
function yearFromIso(iso) {
  if (!iso) return null;
  const y = new Date(iso).getFullYear();
  return Number.isFinite(y) ? y : null;
}

// Age in completed years at a reference date — month/day matter. Mirrors the
// server's `ageFromDob` so "born November 1975, retiring March 2031" reports
// 55 (you don't turn 56 until November of that year), not 56.
function ageAtDate(dobIso, refIso) {
  if (!dobIso || !refIso) return null;
  const dob = new Date(dobIso + 'T00:00:00Z');
  const ref = new Date(refIso + 'T00:00:00Z');
  if (Number.isNaN(dob.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = ref.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

// Bento-styled tooltip for the recharts MC fan.
function MCTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const byKey = Object.fromEntries(payload.map(p => [p.dataKey, p.value]));
  return (
    <div className="ret__chart-tip">
      <div className="ret__chart-tip-label">Year {label}</div>
      <div className="ret__chart-tip-row">
        <span className="ret__chart-tip-swatch ret__chart-tip-swatch--p70" />
        <span>70th</span><span className="ret__chart-tip-val">{fmtUSDCompact(byKey.p70)}</span>
      </div>
      <div className="ret__chart-tip-row">
        <span className="ret__chart-tip-swatch ret__chart-tip-swatch--p50" />
        <span>Median</span><span className="ret__chart-tip-val">{fmtUSDCompact(byKey.p50)}</span>
      </div>
      <div className="ret__chart-tip-row">
        <span className="ret__chart-tip-swatch ret__chart-tip-swatch--p10" />
        <span>10th</span><span className="ret__chart-tip-val">{fmtUSDCompact(byKey.p10)}</span>
      </div>
    </div>
  );
}

export default function RetirementView({ onNavigate } = {}) {
  const [showEditor, setShowEditor] = useState(false);

  const {
    list, loading: listLoading, error: listError, emptyState: listEmpty,
    load, loadDefault, update,
  } = useRetirementScenarios();
  const {
    inputs, loading: inputsLoading, error: inputsError, emptyState: inputsEmpty,
  } = useRetirementInputs();

  const [activeId, setActiveId] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [simRunning, setSimRunning] = useState(false);

  // Pick most-recent saved scenario; if none, fall back to server default.
  useEffect(() => {
    if (listLoading || activeId || scenario) return;
    if (list.length > 0) {
      setActiveId(list[0].id);
    } else if (inputs && !inputsLoading) {
      loadDefault().then(s => { if (s) setScenario(withDefaults(s)); });
    }
  }, [list, listLoading, inputs, inputsLoading, activeId, scenario, loadDefault]);

  // Hydrate the active scenario whenever the id changes.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    load(activeId).then(s => {
      if (!cancelled && s) setScenario(withDefaults(s));
    });
    return () => { cancelled = true; };
  }, [activeId, load]);

  // Per-account balance after applying ownerInclusion. Owner inclusion is
  // explicit opt-in: only owners with `ownerInclusion[owner] === true` flow in.
  // This avoids the hardcoded assumption that every detected owner counts —
  // the user picks their household members in the editor's setup section.
  // Account inclusion is honoured downstream by runSimulation, so we don't
  // pre-zero those here. Falls back to inputs.currentBalances only when the
  // server doesn't return balancesByOwner at all (older API shape).
  const effectiveBalances = useMemo(() => {
    if (!inputs) return null;
    const byOwner = inputs.balancesByOwner;
    if (!byOwner) return inputs.currentBalances || {};
    const ownerIncl = scenario?.ownerInclusion || {};
    const ownerRoles = scenario?.ownerRoles || {};
    const out = {};
    for (const [owner, byAcct] of Object.entries(byOwner)) {
      if (ownerIncl[owner] !== true) continue;
      // Defensive: if the user designated this owner as 'child', their
      // accounts (529, custodial brokerage) are earmarked for the kid and
      // shouldn't feed the retirement projection — even if the inclusion
      // toggle slipped through.
      if (ownerRoles[owner] === 'child') continue;
      for (const [acct, val] of Object.entries(byAcct)) {
        out[acct] = (out[acct] || 0) + (Number(val) || 0);
      }
    }
    return out;
  }, [inputs, scenario]);

  // True iff at least one owner is explicitly opted in. When false, the page
  // shows a setup banner instead of a $0 simulation.
  const noOwnersIncluded = useMemo(() => {
    const ownerIncl = scenario?.ownerInclusion || {};
    const owners = inputs?.owners || [];
    if (!owners.length) return false; // server hasn't returned owners yet
    return !owners.some(o => ownerIncl[o] === true);
  }, [scenario, inputs]);

  // Find the owner names mapped to each role. The editor stores roles in
  // scenario.ownerRoles ({ [name]: 'self' | 'spouse' }); fall back to the
  // server's selfOwner heuristic only when no role has been explicitly set.
  const roleOwners = useMemo(() => {
    const roles = scenario?.ownerRoles || {};
    let selfName = null, spouseName = null;
    for (const [name, role] of Object.entries(roles)) {
      if (role === 'self') selfName = name;
      else if (role === 'spouse') spouseName = name;
    }
    if (!selfName) selfName = inputs?.selfOwner || null;
    return { selfName, spouseName };
  }, [scenario, inputs]);

  // Inputs as the simulator should see them — owner-filtered balances, plus
  // an overlay of any user-edited DOBs from scenario.ownerProfile onto
  // inputs.people.{self,spouse}. That way the sim picks up Spouse data the
  // user enters in the editor (the spreadsheet may have placeholder names).
  const simInputs = useMemo(() => {
    if (!inputs) return null;
    const balances = effectiveBalances || inputs.currentBalances || {};
    const profile = scenario?.ownerProfile || {};

    const overlayPerson = (basePerson, ownerName) => {
      if (!ownerName) return basePerson;
      const p = profile[ownerName];
      if (!p || !p.dob) return basePerson;
      // Recompute currentAge from the overlaid DOB.
      const dob = new Date(p.dob + 'T00:00:00Z');
      let age = null;
      if (!Number.isNaN(dob.getTime())) {
        const now = new Date();
        age = now.getUTCFullYear() - dob.getUTCFullYear();
        const m = now.getUTCMonth() - dob.getUTCMonth();
        if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
      }
      return { ...basePerson, dob: p.dob, currentAge: age };
    };

    const people = {
      ...(inputs.people || {}),
      self:   overlayPerson(inputs.people?.self,   roleOwners.selfName),
      spouse: overlayPerson(inputs.people?.spouse, roleOwners.spouseName),
    };
    return { ...inputs, currentBalances: balances, people };
  }, [inputs, effectiveBalances, scenario, roleOwners]);

  // Scenario as the simulator should see it. Shared with the editor's
  // SimulationPane via utils/prepareSim.js so both charts agree.
  const simScenario = useMemo(
    () => prepareScenarioForSim(scenario, inputs),
    [scenario, inputs],
  );

  // Auto-run Monte Carlo when scenario+inputs are ready or change. Defer to
  // the next tick so the loading skeleton paints before the sync sim blocks.
  useEffect(() => {
    if (!simScenario || !simInputs) return;
    setSimRunning(true);
    setSimResult(null);
    const t = setTimeout(() => {
      try {
        setSimResult(runSimulation(simScenario, simInputs));
      } catch (e) {
        // Surface in the console — the chart loading state stays visible.
        // eslint-disable-next-line no-console
        console.error('Monte Carlo simulation failed:', e);
      } finally {
        setSimRunning(false);
      }
    }, 10);
    return () => clearTimeout(t);
  }, [simScenario, simInputs]);

  // Toggle a single account's inclusion. Updates local scenario immediately
  // (so the row dims and the MC re-runs without a round-trip), then fires
  // a PUT in the background for saved scenarios. Default (unsaved) scenarios
  // only persist their toggle state when the user later hits Save in the
  // editor — same contract as every other field on this page.
  const handleToggleInclusion = useCallback((key, checked) => {
    setScenario(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        accountInclusion: { ...(prev.accountInclusion || {}), [key]: checked },
      };
      if (activeId) {
        update(activeId, next).catch((e) => {
          // eslint-disable-next-line no-console
          console.error('Failed to persist inclusion toggle:', e);
        });
      }
      return next;
    });
  }, [activeId, update]);

  const aggregated = useMemo(() => {
    if (!simResult) return null;
    return aggregatePercentiles(simResult.paths, [10, 50, 70]);
  }, [simResult]);

  const chartData = useMemo(() => {
    if (!aggregated) return [];
    return aggregated.years.map((y, i) => ({
      year: y,
      p10: aggregated.bands['10'][i],
      p50: aggregated.bands['50'][i],
      p70: aggregated.bands['70'][i],
    }));
  }, [aggregated]);

  // ── Empty / loading / error guards ───────────────────────────────────
  const empty = listEmpty || inputsEmpty;
  if (empty) {
    return (
      <div className="ret">
        <Card className="ret__empty">
          <div className="ret__empty-title">Retirement</div>
          <div className="ret__empty-body">{empty.error || 'No profile configured.'}</div>
          {empty.hint && <div className="ret__empty-hint">{empty.hint}</div>}
        </Card>
      </div>
    );
  }
  if (listError || inputsError) {
    return (
      <div className="ret">
        <Card className="ret__empty">
          <div className="ret__empty-title">Retirement</div>
          <div className="ret__empty-body ret__empty-body--err">{listError || inputsError}</div>
        </Card>
      </div>
    );
  }
  if ((listLoading || inputsLoading) && !scenario) {
    return <div className="ret__loading">Loading retirement…</div>;
  }
  if (!scenario) {
    return <div className="ret__loading">Preparing scenario…</div>;
  }

  if (showEditor) {
    return <RetirementScenarioEditor
      onNavigate={onNavigate}
      onClose={() => {
        setShowEditor(false);
        // Force a re-fetch so any save / save-as / delete inside the editor
        // is reflected when we land back on the overview.
        setActiveId(null);
        setScenario(null);
      }}
    />;
  }

  // ── Derived numbers ──────────────────────────────────────────────────
  const dobIso = inputs?.people?.self?.dob || null;
  const dobYear = yearFromIso(dobIso);
  const retirementYear = yearFromIso(scenario.retirementDates?.selfStopWorkingDate);
  const targetAge = ageAtDate(dobIso, scenario.retirementDates?.selfStopWorkingDate);
  const currentAge = inputs?.people?.self?.currentAge
    ?? ageAtDate(dobIso, new Date().toISOString().slice(0, 10));
  const yearsToTarget = (targetAge != null && currentAge != null)
    ? Math.max(0, targetAge - currentAge) : null;

  const inclusion = scenario.accountInclusion || {};
  // Drive every per-account UI bit off the owner-filtered effective balances
  // so excluded owners disappear from the totals and the per-row numbers.
  const balances = effectiveBalances || {};
  const balanceEntries = Object.entries(balances)
    .filter(([, v]) => Number(v) > 0)
    .sort(([a], [b]) => {
      const ra = accountRank(a);
      const rb = accountRank(b);
      return ra !== rb ? ra - rb : a.localeCompare(b);
    });
  const includedTotal = balanceEntries.reduce(
    (sum, [k, v]) => sum + (inclusion[k] !== false ? (Number(v) || 0) : 0),
    0,
  );
  const includedCount = balanceEntries.filter(([k]) => inclusion[k] !== false).length;

  const annualContrib = (scenario.contributions.annual401k || 0)
    + (scenario.contributions.annualEmployerMatch || 0)
    + (scenario.contributions.annualRothIRA || 0)
    + (scenario.contributions.annualTaxableSavings || 0);
  const monthlyContrib = annualContrib / 12;

  const targetSpend = scenario.spending.goGoAnnual || 0;
  const number = targetSpend * 25;

  // Median path balance at retirement year (the projection at "target").
  let balAtTarget = null;
  if (aggregated && retirementYear) {
    const idx = aggregated.years.indexOf(retirementYear);
    if (idx >= 0) balAtTarget = aggregated.bands['50'][idx];
  }

  // Verdict: drive on/off-track from probability of success — that's the
  // Monte Carlo's "am I on track" answer. We treat 85%+ as on-track to mirror
  // the threshold the simulation pane already uses for its tile coloring.
  const probSuccess = simResult?.summary?.probabilityOfSuccess ?? null;
  const onTrack = probSuccess == null ? null : probSuccess >= 0.85;
  const onTrackPct = (balAtTarget != null && number > 0)
    ? Math.min(1.5, balAtTarget / number) : null;

  // Crossing age (median path first reaches the 25× number).
  let crossingAge = null;
  if (aggregated && number && dobYear) {
    for (let i = 0; i < aggregated.years.length; i++) {
      if (aggregated.bands['50'][i] >= number) {
        crossingAge = aggregated.years[i] - dobYear;
        break;
      }
    }
  }

  // Real return — weighted asset return minus inflation mean.
  const r = scenario.returns;
  const a = scenario.allocation;
  const realReturn = (r && a) ? (
    (r.equity?.mean || 0) * (a.equity || 0)
    + (r.bond?.mean || 0)   * (a.bond || 0)
    + (r.cash?.mean || 0)   * (a.cash || 0)
    - (r.inflation?.mean || 0)
  ) : null;

  const ssClaimAge = scenario.income?.socialSecurity?.selfClaimAge ?? null;
  const ssAnnual = scenario.income?.socialSecurity
    ? ((scenario.income.socialSecurity.selfMonthlyAtFRA || 0)
       + (scenario.income.socialSecurity.spouseMonthlyAtFRA || 0)) * 12
    : 0;
  const wsOrder = (scenario.withdrawalSequence || ['taxable', 'traditional', 'roth']).join(' → ');

  const verdictText = onTrack === null ? '● Computing…'
    : onTrack ? '● On track'
    : '● Behind pace';

  let crossingText;
  if (crossingAge) {
    crossingText = `at age ${crossingAge}`;
  } else if (probSuccess != null) {
    crossingText = 'after age 92 in the median path';
  } else {
    crossingText = '— still computing';
  }

  // Subtitle: target age summary + scenario name + as-of + template badge.
  const subtitleParts = [];
  if (targetAge != null && yearsToTarget != null) {
    subtitleParts.push(`Target age ${targetAge} · ${yearsToTarget} years out`);
  } else if (retirementYear) {
    subtitleParts.push(`Retire ${retirementYear}`);
  }
  if (scenario.name) subtitleParts.push(`Scenario "${scenario.name}"`);
  if (inputs?.asOfDate) subtitleParts.push(`as of ${inputs.asOfDate}`);

  return (
    <div className="ret">
      <div className="ret__head">
        <div>
          <div className="ret__title">
            Retirement
            {inputs?.isTemplate && <span className="ret__template-badge">DEMO TEMPLATE</span>}
          </div>
          <div className="ret__subtitle">{subtitleParts.join(' · ')}</div>
        </div>
        <div className="ret__head-right">
          {list.length > 0 && (
            <select
              className="ret__select"
              value={activeId || ''}
              onChange={(e) => {
                const id = e.target.value || null;
                setActiveId(id);
                setScenario(null);
              }}
              title="Active scenario"
            >
              {!activeId && <option value="">Default scenario</option>}
              {list.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={() => setShowEditor(true)}>Edit assumptions</Button>
        </div>
      </div>

      {noOwnersIncluded && (
        <Card variant="grad" className="ret__owner-empty">
          <div className="ret__owner-empty-text">
            <div className="ret__owner-empty-title">Pick whose accounts to include</div>
            <div className="ret__owner-empty-body">
              The simulator doesn't assume which household members count.
              Open Edit assumptions and select the owners whose accounts should
              feed your retirement projection.
            </div>
          </div>
          <Button variant="primary" onClick={() => setShowEditor(true)}>
            Configure in setup →
          </Button>
        </Card>
      )}

      <div className="ret__grid">
        {/* Hero verdict */}
        <Card variant="grad" className="ret__hero">
          <div className={`ret__hero-blob ${onTrack === false ? 'ret__hero-blob--neg' : 'ret__hero-blob--pos'}`} />
          <div className={`ret__pill ${onTrack === false ? 'ret__pill--neg' : 'ret__pill--pos'}`}>
            {verdictText}
          </div>
          <div className="ret__hero-stats">
            <div>
              <div className="ret__hero-label">Projected at {targetAge ?? '—'} (median)</div>
              <div className="ret__hero-big">{fmtUSDCompact(balAtTarget)}</div>
            </div>
          </div>
          <div className="ret__hero-progress">
            <div className="ret__progress-track">
              <div
                className={`ret__progress-fill ${onTrack === false ? 'ret__progress-fill--bad' : 'ret__progress-fill--ok'}`}
                style={{ width: onTrackPct ? `${Math.min(100, (onTrackPct / 1.5) * 100)}%` : '0%' }}
              />
              <div className="ret__progress-marker" style={{ left: `${(1 / 1.5) * 100}%` }} />
            </div>
            <div className="ret__progress-labels">
              <span>0</span>
              <span className="ret__progress-mid">Rule of 4% ({fmtUSDCompact(number)})</span>
              <span>1.5×</span>
            </div>
          </div>
          <p className="ret__hero-explainer">
            At {fmtPct1(realReturn)} real and ${monthlyContrib > 0 ? Math.round(monthlyContrib).toLocaleString() : '0'}/mo,
            the median path crosses the 4% threshold{' '}
            <span className="ret__hero-emphasis">{crossingText}</span>.
            Then drawing {fmtUSDCompact(targetSpend)}/yr in today's dollars
            {ssAnnual > 0 && ssClaimAge ? `, with Social Security at ${ssClaimAge}` : ''}.
          </p>
        </Card>

        {/* Quick stats */}
        <div className="ret__quickstats">
          <Card>
            <Stat label="Today's balance" value={fmtUSDCompact(includedTotal)}
              sub={`${includedCount} accounts included`} />
          </Card>
          <Card>
            <Stat label="Monthly in" value={fmtUSDCompact(monthlyContrib)}
              sub={`${fmtUSDCompact(annualContrib)}/yr`} />
          </Card>
          <Card>
            <div className="ret__split-stat">
              <Stat label="Target spend" value={fmtUSDCompact(targetSpend)} sub="real, today's $" />
              <Stat label="Rule of 4%" value={fmtUSDCompact(number)} sub="25× target spend" />
            </div>
          </Card>
          <Card>
            <Stat
              label="P(success)"
              value={probSuccess != null ? `${(probSuccess * 100).toFixed(1)}%` : '—'}
              sub={probSuccess == null
                ? (simRunning ? 'simulating…' : 'no result')
                : `${simResult?.paths?.length || 0} paths`}
              tone={probSuccess == null ? 'neutral'
                : probSuccess >= 0.85 ? 'pos'
                : probSuccess >= 0.7 ? 'neutral'
                : 'neg'}
            />
          </Card>
        </div>

        {/* Monte Carlo projection */}
        <Card className="ret__chart-card">
          <div className="ret__section-head">
            <div>
              <div className="ret__section-title">Balance over time</div>
              <div className="ret__section-sub">
                {scenario.monteCarlo?.paths || 1000} Monte Carlo paths · today's dollars
              </div>
            </div>
            <div className="ret__legend">
              <span><span className="ret__legend-swatch ret__legend-swatch--p70" />70TH</span>
              <span><span className="ret__legend-swatch ret__legend-swatch--p50" />MEDIAN</span>
              <span><span className="ret__legend-swatch ret__legend-swatch--p10" />10TH</span>
            </div>
          </div>
          <div className="ret__chart-area">
            {simRunning || !chartData.length ? (
              <div className="ret__chart-loading">
                Simulating {scenario.monteCarlo?.paths || 1000} paths…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 10, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: 'var(--ink-2)', fontSize: 11 }} stroke="var(--rule)" />
                  <YAxis tickFormatter={fmtUSDCompact} tick={{ fill: 'var(--ink-2)', fontSize: 11 }} stroke="var(--rule)" />
                  <Tooltip content={<MCTooltip />} />
                  <Area type="monotone" dataKey="p70" stroke="var(--accent)" strokeWidth={1}   fill="var(--accent)" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="p50" stroke="var(--accent)" strokeWidth={1.5} fill="var(--accent)" fillOpacity={0.30} />
                  <Area type="monotone" dataKey="p10" stroke="var(--accent)" strokeWidth={1.5} fill="var(--accent)" fillOpacity={0.55} />
                  {retirementYear && (
                    <ReferenceLine
                      x={retirementYear}
                      stroke="var(--ink-2)"
                      strokeDasharray="4 4"
                      label={{ value: 'Retirement', position: 'insideTop', fill: 'var(--ink-2)', fontSize: 10 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Account breakdown — driven by inputs.currentBalances */}
        <Card className="ret__accounts-card">
          <div className="ret__accounts-row ret__accounts-head">
            <div className="ret__center">Use</div>
            <div>Account</div>
            <div>Tax treatment</div>
            <div className="ret__num">Balance</div>
            <div className="ret__num">Annual in</div>
            <div className="ret__num">Allocation</div>
          </div>
          {balanceEntries.length === 0 && (
            <div className="ret__accounts-empty">
              No account balances detected in the spreadsheet yet.
            </div>
          )}
          {balanceEntries.map(([key, raw], idx) => {
            const balance = Number(raw) || 0;
            const included = inclusion[key] !== false;
            const tax = TAX_TREATMENT[key] || 'Tax-deferred';
            const tone = TAX_TONE[tax];
            const annualIn = annualInForKey(key, scenario);
            const pct = (includedTotal > 0 && included) ? balance / includedTotal : 0;
            return (
              <div
                key={key}
                className={`ret__accounts-row ${idx === balanceEntries.length - 1 ? 'ret__accounts-row--last' : ''} ${included ? '' : 'ret__accounts-row--off'}`}
              >
                <div className="ret__center ret__acct-toggle">
                  <label className="ret__switch" title={included ? 'Excluding removes this account from the simulation' : 'Include in the simulation'}>
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={(e) => handleToggleInclusion(key, e.target.checked)}
                    />
                    <span className="ret__switch-slider" aria-hidden="true" />
                  </label>
                </div>
                <div>
                  <div className="ret__acct-name">{ACCOUNT_DISPLAY_NAME[key] || key}</div>
                  <div className="ret__acct-inst">{key}</div>
                </div>
                <div>
                  <span
                    className="ret__pill-tax"
                    style={{
                      background: `color-mix(in srgb, ${tone} 13%, transparent)`,
                      color: tone,
                    }}
                  >
                    {tax}
                  </span>
                </div>
                <div className="ret__num ret__acct-balance">{fmtUSD(balance)}</div>
                <div className="ret__num ret__acct-contrib">{annualIn != null ? fmtUSDCompact(annualIn) : '—'}</div>
                <div className="ret__alloc">
                  <div className="ret__alloc-bar">
                    <ProgressBar value={pct * 100} tone={tone} height={6} />
                  </div>
                  <div className="ret__alloc-pct">{(pct * 100).toFixed(0)}%</div>
                </div>
              </div>
            );
          })}
        </Card>

        {/* Withdrawal sequence — narrative + scenario draw order */}
        <Card className="ret__seq-card">
          <div className="ret__section-head">
            <div>
              <div className="ret__section-title">Withdrawal sequence</div>
              <div className="ret__section-sub">
                Tax-aware order from age {targetAge ?? '—'} onward · scenario draws {wsOrder}
              </div>
            </div>
            <Button size="sm" onClick={() => setShowEditor(true)}>Edit assumptions</Button>
          </div>
          <div className="ret__seq-grid">
            {SEQUENCE.map((s, i) => (
              <div key={s.phase} className="ret__seq-card-inner">
                <div className="ret__seq-row">
                  <div className="ret__seq-num">{String(i + 1).padStart(2, '0')}</div>
                  <div className="ret__seq-phase">{s.phase}</div>
                </div>
                <div className="ret__seq-label">{s.label}</div>
                <div className="ret__seq-pull">{s.pull}</div>
                <div className="ret__seq-why">{s.why}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
