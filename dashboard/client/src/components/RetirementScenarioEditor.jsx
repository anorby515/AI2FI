import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import { Card, Button } from '../ui';
import { useRetirementScenarios, useRetirementInputs } from '../hooks/useRetirementScenarios';
import { runSimulation, aggregatePercentiles, optimizeSSClaimAge } from '../utils/monteCarlo';
import { prepareScenarioForSim } from '../utils/prepareSim';
import './RetirementScenarioEditor.css';

/**
 * RetirementScenarioEditor — Phase 1 scenario UI.
 *
 * Composes the scenario editor on the left and a chart placeholder on the
 * right. The Monte Carlo engine (built by a parallel agent) plugs into
 * `runSim()` below. The chart slot stays empty until that lands.
 *
 * Data flow:
 *   useRetirementInputs()    → balances, DOBs, pension options, salary hints
 *   useRetirementScenarios() → CRUD + the on-the-fly default builder
 *
 * Local state holds the "draft" scenario the user is editing. Save persists it
 * via PUT (or POST for new ones).
 */

// ── Stub: where the Monte Carlo engine plugs in ──────────────────────────
//
// Wired to the Monte Carlo engine in dashboard/client/src/utils/monteCarlo.js.
export function runSim(scenario, inputs) {
  return runSimulation(scenario, inputs);
}

// ── Format helpers ────────────────────────────────────────────────────────
function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}

function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v * 100).toFixed(1) + '%';
}

// ── Default skeleton applied when reading older scenarios ─────────────────
// Schema-tolerant: fields fall back to defaults so old saved scenarios load
// cleanly when new fields are added in future phases.
const SCENARIO_DEFAULTS = {
  horizon: { mortalityAgeSelf: 95, mortalityAgeSpouse: 95 },
  retirementDates: { selfStopWorkingDate: null, spouseStopWorkingDate: null },
  income: {
    preRetirementSalary: null,
    annualSalaryIncreasePct: 0.04,
    stipPct: 0.10,
    socialSecurity: {
      selfMonthlyAtFRA: 4000,
      spouseMonthlyAtFRA: 2500,
      selfClaimAge: 67,
      spouseClaimAge: 67,
    },
    pension: { optionId: null, kind: null, annualAmount: 0, startDate: null, endDate: null },
    otherIncome: [],
  },
  spending: {
    goGoAnnual: 180000, goGoEndAge: 75,
    slowGoAnnual: 144000, slowGoEndAge: 85,
    noGoAnnual: 100000,
    healthcareAnnual: 0,
    healthcareGrowthPctOverInflation: 0.02,
  },
  contributions: {
    // 401(k) inputs are stored as % of (Base Salary + Variable Compensation).
    // RetirementView derives the dollar amounts before passing to runSimulation
    // so the simulator's interface is unchanged.
    annual401kPct: 0,
    annualEmployerMatchPct: 0,
    // Legacy dollar fields kept for backwards compatibility on saved scenarios
    // that pre-date the percentage migration. RetirementView ignores these
    // when the corresponding *Pct fields are non-zero.
    annual401k: 0,
    annualEmployerMatch: 0,
    annualRothIRA: 0,
    annualTaxableSavings: 0,
    stopAtRetirement: true,
  },
  accountInclusion: {
    '401k': true, 'BrokerageLink': true,
    'Traditional IRA': true, 'Roth IRA': true,
    'Brokerage': true, 'HSA': false, 'ESA': false,
    'RSU': true,  // Vested RSUs only — unvested lots are dropped server-side.
  },
  // Per-owner inclusion. Keys are owner names from inputs.owners. Defaults to
  // an empty object — the UI treats missing entries as "include" so a fresh
  // scenario starts by counting every owner's accounts.
  ownerInclusion: {},
  // User-controlled display order for owners in the Account Owners section.
  // Owners not present in the array fall back to the server's default
  // ordering (selfOwner first, then alphabetical) at the tail of the list.
  ownerOrder: [],
  // User-controlled display order for accounts in the overview's accounts
  // table. Accounts missing from this array fall back to the static
  // retirement-first ordering (see ACCOUNT_ORDER in RetirementView).
  accountOrder: [],
  // Per-owner collapsed state in the editor's Account Owners section.
  // { [ownerName]: true } means "fields hidden". Persisted with the scenario
  // so the editor's open/closed cards survive a reload.
  ownerCollapsed: {},
  // Per-owner profile: birthday + mortality age + (for self/spouse) retirement
  // date. Birthday is stored even for non-self/non-spouse owners so the user
  // can capture the data, but the simulator only consumes self/spouse values
  // (overlaid into inputs.people downstream).
  ownerProfile: {},
  // User-designated role for each owner: 'self' | 'spouse' | undefined.
  // The simulator pulls self/spouse data from horizon + retirementDates; we
  // overlay ownerProfile[selfOwnerName].dob onto inputs.people.self.dob (and
  // same for spouse) inside RetirementView so user edits flow through.
  ownerRoles: {},
  withdrawalSequence: ['taxable', 'traditional', 'roth'],
  tax: { effectiveRateOrdinary: 0.22, effectiveRateLTCG: 0.15 },
  // Tuned to Fidelity-style long-term US historical averages.
  returns: {
    equity:    { mean: 0.10, stdev: 0.16 },
    bond:      { mean: 0.04, stdev: 0.05 },
    cash:      { mean: 0.025, stdev: 0.01 },
    inflation: { mean: 0.025, stdev: 0.01 },
  },
  allocation: { equity: 0.75, bond: 0.20, cash: 0.05 },
  monteCarlo: { paths: 1000, seed: null },
};

// Deep-merge a saved scenario over the defaults so missing fields don't crash
// the editor. New fields automatically pick up their default value.
// Exported so the Bento overview screen can normalise scenarios it loads
// without re-implementing the same merge tree.
export function withDefaults(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    ...s,
    horizon:           { ...SCENARIO_DEFAULTS.horizon,           ...(s.horizon || {}) },
    retirementDates:   { ...SCENARIO_DEFAULTS.retirementDates,   ...(s.retirementDates || {}) },
    income: {
      ...SCENARIO_DEFAULTS.income,
      ...(s.income || {}),
      socialSecurity: { ...SCENARIO_DEFAULTS.income.socialSecurity, ...((s.income && s.income.socialSecurity) || {}) },
      pension:        { ...SCENARIO_DEFAULTS.income.pension,        ...((s.income && s.income.pension) || {}) },
      otherIncome:    Array.isArray(s.income && s.income.otherIncome) ? s.income.otherIncome : [],
    },
    spending:          { ...SCENARIO_DEFAULTS.spending,          ...(s.spending || {}) },
    contributions:     { ...SCENARIO_DEFAULTS.contributions,     ...(s.contributions || {}) },
    accountInclusion:  { ...SCENARIO_DEFAULTS.accountInclusion,  ...(s.accountInclusion || {}) },
    ownerInclusion:    { ...SCENARIO_DEFAULTS.ownerInclusion,    ...(s.ownerInclusion || {}) },
    ownerOrder:        Array.isArray(s.ownerOrder) ? [...s.ownerOrder] : [],
    ownerProfile:      { ...SCENARIO_DEFAULTS.ownerProfile,      ...(s.ownerProfile || {}) },
    ownerRoles:        { ...SCENARIO_DEFAULTS.ownerRoles,        ...(s.ownerRoles || {}) },
    ownerCollapsed:    { ...SCENARIO_DEFAULTS.ownerCollapsed,    ...(s.ownerCollapsed || {}) },
    accountOrder:      Array.isArray(s.accountOrder) ? [...s.accountOrder] : [],
    withdrawalSequence: Array.isArray(s.withdrawalSequence) && s.withdrawalSequence.length
      ? [...s.withdrawalSequence]
      : [...SCENARIO_DEFAULTS.withdrawalSequence],
    tax:               { ...SCENARIO_DEFAULTS.tax,               ...(s.tax || {}) },
    returns: {
      equity:    { ...SCENARIO_DEFAULTS.returns.equity,    ...((s.returns && s.returns.equity) || {}) },
      bond:      { ...SCENARIO_DEFAULTS.returns.bond,      ...((s.returns && s.returns.bond) || {}) },
      cash:      { ...SCENARIO_DEFAULTS.returns.cash,      ...((s.returns && s.returns.cash) || {}) },
      inflation: { ...SCENARIO_DEFAULTS.returns.inflation, ...((s.returns && s.returns.inflation) || {}) },
    },
    allocation:        { ...SCENARIO_DEFAULTS.allocation,        ...(s.allocation || {}) },
    monteCarlo:        { ...SCENARIO_DEFAULTS.monteCarlo,        ...(s.monteCarlo || {}) },
  };
}

// Small number-input control: keeps the raw string in local state so users
// can type freely (including empty / partial values) without React clobbering
// their cursor on every render. Sync from `value` only when the input is NOT
// focused, so external changes (scenario load / cross-field write-through)
// update the display but mid-edit typing is preserved.
function NumInput({ value, onChange, step = 1, suffix, placeholder, min }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const inputRef = useRef(null);
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setText(value == null ? '' : String(value));
  }, [value]);
  return (
    <div className="rv__num-wrap">
      <input
        ref={inputRef}
        className="rv__input"
        type="number"
        step={step}
        min={min}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value === '') return onChange(null);
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {suffix && <span className="rv__suffix">{suffix}</span>}
    </div>
  );
}

function PctInput({ value, onChange, step = 1, decimals = 0 }) {
  // Stored as decimal (0.04). Displayed as integer % by default ("4"); pass
  // `decimals` for fields that need fractional points. Same focus-aware sync
  // pattern as NumInput so the cursor doesn't jump on every external write.
  const fmt = (v) => v == null ? '' : (v * 100).toFixed(decimals);
  const [text, setText] = useState(fmt(value));
  const inputRef = useRef(null);
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="rv__num-wrap">
      <input
        ref={inputRef}
        className="rv__input"
        type="number"
        step={step}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value === '') return onChange(null);
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n / 100);
        }}
      />
      <span className="rv__suffix">%</span>
    </div>
  );
}

function DateInput({ value, onChange }) {
  return (
    <input
      className="rv__input"
      type="date"
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      className="rv__input"
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="rv__toggle">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function Field({ label, hint, children, className = '' }) {
  return (
    <div className={`rv__field ${className}`}>
      <div className="rv__field-text">
        <div className="rv__field-label">{label}</div>
        {hint && <div className="rv__field-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────
function Section({ title, subtitle, children, collapsible = false, defaultOpen = true, action = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="rv__section">
      <div className="rv__section-head">
        <div>
          <div className="rv__section-title">{title}</div>
          {subtitle && <div className="rv__section-subtitle">{subtitle}</div>}
        </div>
        {action}
        {collapsible && (
          <Button variant="subtle" size="sm" onClick={() => setOpen(o => !o)}>
            {open ? 'Hide' : 'Show'}
          </Button>
        )}
      </div>
      {(open || !collapsible) && <div className="rv__section-body">{children}</div>}
    </Card>
  );
}

// ── Withdrawal sequence reorder controls ──────────────────────────────────
const WITHDRAWAL_LABELS = {
  taxable: 'Taxable / brokerage',
  traditional: 'Traditional (pre-tax)',
  roth: 'Roth (tax-free)',
};

function WithdrawalSequence({ sequence, onChange }) {
  const move = (idx, dir) => {
    const next = [...sequence];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  };
  return (
    <div className="rv__seq">
      {sequence.map((key, idx) => (
        <div key={key} className="rv__seq-row">
          <span className="rv__seq-num">{idx + 1}</span>
          <span className="rv__seq-label">{WITHDRAWAL_LABELS[key] || key}</span>
          <div className="rv__seq-btns">
            <Button variant="subtle" size="sm" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</Button>
            <Button variant="subtle" size="sm" onClick={() => move(idx, +1)} disabled={idx === sequence.length - 1}>↓</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────
export default function RetirementScenarioEditor({ onClose, onNavigate }) {
  const {
    list, loading: listLoading, error: listError, emptyState: listEmpty,
    load, loadDefault, create, update, remove,
  } = useRetirementScenarios();

  const {
    inputs, loading: inputsLoading, error: inputsError, emptyState: inputsEmpty,
  } = useRetirementInputs();

  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState(null);    // current edited scenario object
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null); // { kind: 'ok'|'err', msg }

  // First-load rule: if there is at least one saved scenario, auto-select the
  // most recently updated. If there is none, fall back to the on-the-fly
  // default so the editor always shows something.
  useEffect(() => {
    if (listLoading) return;
    if (activeId) return;
    if (list.length > 0) {
      setActiveId(list[0].id);
    } else if (inputs && !inputsLoading) {
      // No scenarios on disk — load the generated default into the editor.
      // This is NOT persisted yet; user must hit Save to commit it.
      loadDefault().then(s => {
        if (s) {
          setDraft(withDefaults(s));
          setDirty(true);
          setActiveId(null);
        }
      });
    }
  }, [list, listLoading, inputs, inputsLoading, activeId, loadDefault]);

  // When activeId changes (and is not a "new"), fetch the full scenario.
  useEffect(() => {
    if (!activeId) return;
    load(activeId).then(s => {
      if (s) {
        setDraft(withDefaults(s));
        setDirty(false);
      }
    });
  }, [activeId, load]);

  // Helper: produce a setter for a deeply-nested path on the draft.
  const setPath = useCallback((path, value) => {
    setDraft(prev => {
      if (!prev) return prev;
      // Shallow path implementation — we know our paths are 1-3 segments deep.
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        if (!(path[i] in cur)) cur[path[i]] = {};
        cur = cur[path[i]];
      }
      cur[path[path.length - 1]] = value;
      return next;
    });
    setDirty(true);
    setFeedback(null);
  }, []);

  const onSelectScenario = (id) => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setActiveId(id);
    setFeedback(null);
  };

  const onNewScenario = async () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    const s = await loadDefault();
    if (!s) {
      setFeedback({ kind: 'err', msg: 'Could not load defaults' });
      return;
    }
    // Suggest a fresh name so the user doesn't accidentally clobber 'Base case'.
    const name = window.prompt('Name this scenario:', list.length === 0 ? 'Base case' : 'New scenario');
    if (!name) return;
    setDraft(withDefaults({ ...s, name, id: null }));
    setActiveId(null);
    setDirty(true);
  };

  const onSaveAs = async () => {
    if (!draft) return;
    const name = window.prompt('Save as:', draft.name + ' (copy)');
    if (!name) return;
    setBusy(true);
    try {
      const saved = await create({ ...draft, id: null, name });
      setActiveId(saved.id);
      setDraft(withDefaults(saved));
      setDirty(false);
      setFeedback({ kind: 'ok', msg: `Saved as "${saved.name}"` });
    } catch (e) {
      setFeedback({ kind: 'err', msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      let saved;
      if (activeId) {
        saved = await update(activeId, draft);
      } else {
        saved = await create({ ...draft, id: null });
        setActiveId(saved.id);
      }
      setDraft(withDefaults(saved));
      setDirty(false);
      setFeedback({ kind: 'ok', msg: 'Saved' });
    } catch (e) {
      setFeedback({ kind: 'err', msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!activeId) return;
    if (!window.confirm(`Delete scenario "${draft?.name || activeId}"?`)) return;
    setBusy(true);
    try {
      await remove(activeId);
      setActiveId(null);
      setDraft(null);
      setDirty(false);
      setFeedback({ kind: 'ok', msg: 'Deleted' });
    } catch (e) {
      setFeedback({ kind: 'err', msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  // ── Empty / loading states ────────────────────────────────────────────
  if (listEmpty || inputsEmpty) {
    const e = listEmpty || inputsEmpty;
    return (
      <div className="rv">
        <Card className="rv__empty">
          <div className="rv__empty-title">Retirement forecast</div>
          <div className="rv__empty-body">
            {e?.error || 'No profile configured.'}
            {e?.hint && <div className="rv__empty-hint">{e.hint}</div>}
          </div>
        </Card>
      </div>
    );
  }

  if ((listLoading || inputsLoading) && !draft) {
    return <div className="rv__loading">Loading retirement scenarios…</div>;
  }

  if (listError || inputsError) {
    return (
      <div className="rv">
        <Card className="rv__empty">
          <div className="rv__empty-title">Retirement forecast</div>
          <div className="rv__empty-body tone-neg">{listError || inputsError}</div>
        </Card>
      </div>
    );
  }

  if (!draft) {
    return <div className="rv__loading">Preparing scenario editor…</div>;
  }

  // ── Render ───────────────────────────────────────────────────────────
  const pensionOptions = (inputs?.pensionOptions || []).map(o => ({
    label: `${o.label} · ${o.kind}`,
    value: o.id,
    raw: o,
  }));

  const scenarioOptions = list.map(s => ({ label: s.name, value: s.id }));

  return (
    <div className="rv">
      <div className="rv__head">
        <div>
          <div className="rv__title">Retirement Forecast</div>
          <div className="rv__subtitle">
            {inputs?.asOfDate ? `As of ${inputs.asOfDate}` : 'Scenario editor'}
            {inputs?.isTemplate && <span className="rv__badge"> · template</span>}
          </div>
        </div>
        <div className="rv__head-right">
          {onClose && (
            <Button variant="ghost" onClick={onClose}>← Back to overview</Button>
          )}
          {scenarioOptions.length > 0 && (
            <select
              className="rv__select"
              value={activeId || ''}
              onChange={(e) => onSelectScenario(e.target.value || null)}
            >
              {!activeId && <option value="">Unsaved draft</option>}
              {scenarioOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          <Button variant="ghost" onClick={onNewScenario} disabled={busy}>+ New</Button>
          <Button variant="ghost" onClick={onSaveAs} disabled={busy || !draft}>Save as…</Button>
          <Button variant="primary" onClick={onSave} disabled={busy || !dirty}>
            {dirty ? 'Save' : 'Saved'}
          </Button>
          {activeId && (
            <Button variant="ghost" onClick={onDelete} disabled={busy}>Delete</Button>
          )}
        </div>
      </div>

      {feedback && (
        <div className={`rv__feedback rv__feedback--${feedback.kind}`}>{feedback.msg}</div>
      )}

      <div className="rv__cols">
        {/* ── Left: editor ─────────────────────────────────────────── */}
        <div className="rv__editor">
          {/* Scenario name + id are surfaced via the page header's picker
              and the Save-as flow; no separate identity card here. */}

          {/* Simulation pane — first card on the page */}
          <div className="rv__sim">
            <SimulationPane scenario={draft} inputs={inputs} setFeedback={setFeedback} />
          </div>

          {/* Starting position — read-only DOB / age / total + owner picker.
              Account inclusion toggles live on the Retirement overview now
              (under each account row) so we don't duplicate them here. */}
          <InputsSummary
            inputs={inputs}
            draft={draft}
            setPath={setPath}
            ownerInclusion={draft.ownerInclusion}
            selfOwner={inputs?.selfOwner}
            onToggleOwner={(o, v) => setPath(['ownerInclusion', o], v)}
          />

          {/* Contributions (left) + Income (right) — paired side-by-side.
              401k contributions live with Income because they come out of
              salary; what's in Contributions is post-tax savings + the
              "stop contributions at retirement" toggle. */}
          <div className="rv__pair">
            <Section title="Contributions" subtitle="Annual post-tax savings while working">
              <Field label="Roth IRA">
                <NumInput
                  value={draft.contributions.annualRothIRA}
                  onChange={(v) => setPath(['contributions', 'annualRothIRA'], v)}
                  step={500}
                  suffix="$"
                />
              </Field>
              <Field label="Taxable savings">
                <NumInput
                  value={draft.contributions.annualTaxableSavings}
                  onChange={(v) => setPath(['contributions', 'annualTaxableSavings'], v)}
                  step={1000}
                  suffix="$"
                />
              </Field>
              <Field label="Stop contributions at retirement">
                <label className="rv__switch">
                  <input
                    type="checkbox"
                    checked={!!draft.contributions.stopAtRetirement}
                    onChange={(e) => setPath(['contributions', 'stopAtRetirement'], e.target.checked)}
                  />
                  <span className="rv__switch-slider" aria-hidden="true" />
                </label>
              </Field>
            </Section>

            {/* Income — salary + STIP + 401k contributions (paid out of salary). */}
            <Section title="Income" subtitle="Salary, bonus, and 401(k) contributions">
              <Field label="Base salary">
                <NumInput
                  value={draft.income.preRetirementSalary}
                  onChange={(v) => setPath(['income', 'preRetirementSalary'], v)}
                  step={1000}
                  suffix="$"
                />
              </Field>
              <Field label="Annual salary increase" className="rv__field--compact">
                <PctInput
                  value={draft.income.annualSalaryIncreasePct}
                  onChange={(v) => setPath(['income', 'annualSalaryIncreasePct'], v)}
                />
              </Field>
              <Field
                label="Variable compensation"
                hint="Annual bonus / STIP as a % of base salary"
                className="rv__field--compact"
              >
                <PctInput
                  value={draft.income.stipPct}
                  onChange={(v) => setPath(['income', 'stipPct'], v)}
                />
              </Field>
              {(() => {
                // Comp base = Base salary × (1 + Variable comp pct). 401(k)
                // contributions are entered as % of this combined comp; the
                // calculated dollar amount sits below the label as a hint.
                const base = Number(draft.income.preRetirementSalary || 0);
                const stip = Number(draft.income.stipPct || 0);
                const comp = base * (1 + stip);
                const empPct  = Number(draft.contributions.annual401kPct || 0);
                const matchPct = Number(draft.contributions.annualEmployerMatchPct || 0);
                const empAmt   = comp * empPct;
                const matchAmt = comp * matchPct;
                return (
                  <>
                    <Field
                      className="rv__field--compact"
                      label={
                        <>
                          401(k) — employee
                          {comp > 0 && (
                            <span className="rv__field-amount">{fmtUSD(empAmt)}</span>
                          )}
                        </>
                      }
                    >
                      <PctInput
                        value={draft.contributions.annual401kPct}
                        onChange={(v) => setPath(['contributions', 'annual401kPct'], v)}
                      />
                    </Field>
                    <Field
                      className="rv__field--compact"
                      label={
                        <>
                          401(k) — employer match
                          {comp > 0 && (
                            <span className="rv__field-amount">{fmtUSD(matchAmt)}</span>
                          )}
                        </>
                      }
                    >
                      <PctInput
                        value={draft.contributions.annualEmployerMatchPct}
                        onChange={(v) => setPath(['contributions', 'annualEmployerMatchPct'], v)}
                      />
                    </Field>
                  </>
                );
              })()}
            </Section>
          </div>

          {/* Pension (left) + Social Security (right) — paired side-by-side. */}
          <div className="rv__pair">
            <Section
              title="Pension"
              subtitle="Defined-benefit annuity from employer"
              action={onNavigate && (
                <Button size="sm" onClick={() => onNavigate('pension')}>
                  Go to Pension →
                </Button>
              )}
            >
              <Field label="Pension option">
                <select
                  className="rv__input"
                  value={draft.income.pension.optionId || ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const picked = pensionOptions.find(p => p.value === id);
                    if (!picked) {
                      setPath(['income', 'pension'], {
                        optionId: null, kind: null, annualAmount: 0, startDate: null, endDate: null,
                      });
                      return;
                    }
                    // The pension sheet stores monthly amounts for annuity
                    // options and a one-time total for lump-sum. Convert
                    // annuities × 12; lump-sum is bounded to a single year
                    // via simScenario in RetirementView (it forces
                    // endDate=startDate based on `kind`, so the user can
                    // edit startDate without breaking the bounding).
                    const r = picked.raw;
                    const kind = r.kind;
                    let annualAmount = 0;
                    let startDate = r.start_date || r.date || null;
                    let endDate = null;
                    if (kind === 'lump_sum') {
                      annualAmount = Number(r.you_amount || 0);
                      endDate = startDate;
                    } else if (kind === 'ss_offset_annuity') {
                      annualAmount = Number(r.you_starting || 0) * 12;
                    } else {
                      annualAmount = Number(r.you_amount || 0) * 12;
                    }
                    setPath(['income', 'pension'], {
                      optionId: id, kind, annualAmount, startDate, endDate,
                    });
                  }}
                >
                  <option value="">— None —</option>
                  {pensionOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              {(() => {
                const pickedRaw = pensionOptions.find(p => p.value === draft.income.pension.optionId)?.raw;
                const isLumpSum = pickedRaw?.kind === 'lump_sum';
                return (
                  <Field
                    label={isLumpSum ? 'Lump sum amount' : 'Annual amount'}
                    hint={isLumpSum ? 'Paid once on start date' : null}
                  >
                    <NumInput
                      value={draft.income.pension.annualAmount}
                      onChange={(v) => setPath(['income', 'pension', 'annualAmount'], v)}
                      step={100}
                      suffix="$"
                    />
                  </Field>
                );
              })()}
              <Field label="Start date">
                <DateInput
                  value={draft.income.pension.startDate}
                  onChange={(v) => setPath(['income', 'pension', 'startDate'], v)}
                />
              </Field>
            </Section>

            <Section title="Social Security" subtitle="Monthly amount at full retirement age + when each person claims">
              <Field label="Self · monthly @ FRA">
                <NumInput
                  value={draft.income.socialSecurity.selfMonthlyAtFRA}
                  onChange={(v) => setPath(['income', 'socialSecurity', 'selfMonthlyAtFRA'], v)}
                  step={50}
                  suffix="$"
                />
              </Field>
              <Field label="Self claim age">
                <NumInput
                  value={draft.income.socialSecurity.selfClaimAge}
                  onChange={(v) => setPath(['income', 'socialSecurity', 'selfClaimAge'], v)}
                  min={62}
                />
              </Field>
              <Field label="Spouse · monthly @ FRA">
                <NumInput
                  value={draft.income.socialSecurity.spouseMonthlyAtFRA}
                  onChange={(v) => setPath(['income', 'socialSecurity', 'spouseMonthlyAtFRA'], v)}
                  step={50}
                  suffix="$"
                />
              </Field>
              <Field label="Spouse claim age">
                <NumInput
                  value={draft.income.socialSecurity.spouseClaimAge}
                  onChange={(v) => setPath(['income', 'socialSecurity', 'spouseClaimAge'], v)}
                  min={62}
                />
              </Field>
            </Section>
          </div>

          {/* Spending (left) + Withdrawal sequence (right) — paired side-by-side. */}
          <div className="rv__pair">
            <Section title="Spending" subtitle="Three life-stage bands and healthcare">
              <Field label="Go-go annual" hint="Active retirement">
                <NumInput
                  value={draft.spending.goGoAnnual}
                  onChange={(v) => setPath(['spending', 'goGoAnnual'], v)}
                  step={1000}
                  suffix="$"
                />
              </Field>
              <Field label="Go-go end age">
                <NumInput
                  value={draft.spending.goGoEndAge}
                  onChange={(v) => setPath(['spending', 'goGoEndAge'], v)}
                  min={50}
                />
              </Field>
              <Field label="Slow-go annual" hint="Quieter years">
                <NumInput
                  value={draft.spending.slowGoAnnual}
                  onChange={(v) => setPath(['spending', 'slowGoAnnual'], v)}
                  step={1000}
                  suffix="$"
                />
              </Field>
              <Field label="Slow-go end age">
                <NumInput
                  value={draft.spending.slowGoEndAge}
                  onChange={(v) => setPath(['spending', 'slowGoEndAge'], v)}
                  min={60}
                />
              </Field>
              <Field label="No-go annual" hint="Late life">
                <NumInput
                  value={draft.spending.noGoAnnual}
                  onChange={(v) => setPath(['spending', 'noGoAnnual'], v)}
                  step={1000}
                  suffix="$"
                />
              </Field>
              <Field label="Healthcare annual">
                <NumInput
                  value={draft.spending.healthcareAnnual}
                  onChange={(v) => setPath(['spending', 'healthcareAnnual'], v)}
                  step={500}
                  suffix="$"
                />
              </Field>
              <Field label="Healthcare growth over inflation" className="rv__field--compact">
                <PctInput
                  value={draft.spending.healthcareGrowthPctOverInflation}
                  onChange={(v) => setPath(['spending', 'healthcareGrowthPctOverInflation'], v)}
                />
              </Field>
            </Section>

            <Section title="Withdrawal sequence" subtitle="Order of accounts drawn down">
              <WithdrawalSequence
                sequence={draft.withdrawalSequence}
                onChange={(seq) => setPath(['withdrawalSequence'], seq)}
              />
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SimulationPane: runs Monte Carlo + SS optimizer, renders the asset
// projection chart, end-of-plan tiles, probability of success, and an
// on-demand SS claim-age optimizer panel.
// ─────────────────────────────────────────────────────────────────────────

function fmtUSDcompact(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'K';
  return sign + '$' + abs.toFixed(0);
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const byKey = Object.fromEntries(payload.map(p => [p.dataKey, p.value]));
  return (
    <div className="rv__tooltip">
      <div className="rv__tooltip-year">{label}</div>
      <div className="rv__tooltip-row"><span className="rv__tooltip-swatch rv__tooltip-swatch--p70" /> 70th pct (favorable){fmtUSDcompact(byKey.p70)}</div>
      <div className="rv__tooltip-row"><span className="rv__tooltip-swatch rv__tooltip-swatch--p50" /> Median{fmtUSDcompact(byKey.p50)}</div>
      <div className="rv__tooltip-row"><span className="rv__tooltip-swatch rv__tooltip-swatch--p10" /> 10th pct (worst){fmtUSDcompact(byKey.p10)}</div>
    </div>
  );
}

function SimulationPane({ scenario, inputs, setFeedback }) {
  const [simResult, setSimResult] = useState(null);
  const [simRunning, setSimRunning] = useState(false);
  const [ssOpt, setSsOpt] = useState(null);
  const [ssOptRunning, setSsOptRunning] = useState(false);
  const [ssOptOpen, setSsOptOpen] = useState(false);

  const runMC = useCallback(() => {
    if (!inputs) {
      setFeedback({ kind: 'err', msg: 'No inputs loaded yet' });
      return;
    }
    setSimRunning(true);
    setSsOpt(null); // clear stale SS optimizer if scenario changed
    // Defer to next tick so the spinner renders before the blocking sim.
    setTimeout(() => {
      try {
        const prepared = prepareScenarioForSim(scenario, inputs);
        const result = runSimulation(prepared, inputs);
        setSimResult(result);
      } catch (e) {
        setFeedback({ kind: 'err', msg: 'Simulation failed: ' + e.message });
      } finally {
        setSimRunning(false);
      }
    }, 10);
  }, [scenario, inputs, setFeedback]);

  const runSSOpt = useCallback(() => {
    if (!inputs) return;
    setSsOptRunning(true);
    setTimeout(() => {
      try {
        const prepared = prepareScenarioForSim(scenario, inputs);
        const result = optimizeSSClaimAge(prepared, inputs);
        setSsOpt(result);
      } catch (e) {
        setFeedback({ kind: 'err', msg: 'SS optimizer failed: ' + e.message });
      } finally {
        setSsOptRunning(false);
      }
    }, 10);
  }, [scenario, inputs, setFeedback]);

  // Auto-run a first sim once inputs hydrate.
  useEffect(() => {
    if (inputs && !simResult && !simRunning) runMC();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs]);

  // Aggregate percentiles for the chart. 10/50/70 — 70th instead of 90th
  // because the 90th band is decorative and skews the y-axis; the 70th
  // captures "favorable but not best-case" outcomes that are still useful
  // planning information.
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

  // Retirement-year reference line position.
  const retirementYear = useMemo(() => {
    if (!scenario?.retirementDates?.selfStopWorkingDate) return null;
    return new Date(scenario.retirementDates.selfStopWorkingDate).getFullYear();
  }, [scenario]);

  const summary = simResult?.summary;
  const lastIndex = aggregated ? aggregated.years.length - 1 : -1;
  const endP10 = lastIndex >= 0 ? aggregated.bands['10'][lastIndex] : null;
  const endP50 = lastIndex >= 0 ? aggregated.bands['50'][lastIndex] : null;
  const endP70 = lastIndex >= 0 ? aggregated.bands['70'][lastIndex] : null;

  return (
    <Card variant="grad" className="rv__sim-card">
      <div className="rv__sim-head">
        <div>
          <div className="rv__sim-title">Asset projection</div>
          <div className="rv__sim-subtitle">
            {scenario?.monteCarlo?.paths || 1000} Monte Carlo paths · today's dollars
          </div>
        </div>
        <Button onClick={runMC} disabled={simRunning}>
          {simRunning ? 'Running…' : (simResult ? 'Re-run' : 'Run simulation')}
        </Button>
      </div>

      {/* End-of-plan + probability tiles */}
      {summary && (
        <div className="rv__sim-tiles">
          <div className="rv__sim-tile">
            <div className="rv__sim-tile-label">Probability of success</div>
            <div className={`rv__sim-tile-value ${summary.probabilityOfSuccess >= 0.85 ? 'rv__pos' : summary.probabilityOfSuccess >= 0.70 ? '' : 'rv__neg'}`}>
              {(summary.probabilityOfSuccess * 100).toFixed(1)}%
            </div>
            <div className="rv__sim-tile-sub">paths that don't deplete</div>
          </div>
          <div className="rv__sim-tile">
            <div className="rv__sim-tile-label">Assets at end (10th pct)</div>
            <div className="rv__sim-tile-value">{fmtUSDcompact(endP10)}</div>
            <div className="rv__sim-tile-sub">significantly-below scenario</div>
          </div>
          <div className="rv__sim-tile">
            <div className="rv__sim-tile-label">Assets at end (median)</div>
            <div className="rv__sim-tile-value">{fmtUSDcompact(endP50)}</div>
            <div className="rv__sim-tile-sub">average scenario</div>
          </div>
          <div className="rv__sim-tile">
            <div className="rv__sim-tile-label">Assets at end (70th pct)</div>
            <div className="rv__sim-tile-value">{fmtUSDcompact(endP70)}</div>
            <div className="rv__sim-tile-sub">favorable scenario</div>
          </div>
        </div>
      )}

      {/* Asset projection chart */}
      <div className="rv__chart-wrap">
        {simRunning ? (
          <div className="rv__chart-loading">Simulating {scenario?.monteCarlo?.paths || 1000} paths…</div>
        ) : chartData.length === 0 ? (
          <div className="rv__chart-empty">Click "Run simulation" to project the scenario</div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={chartData} margin={{ top: 10, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: 'var(--ink-dim, var(--ink))', fontSize: 11 }} stroke="var(--rule)" />
              <YAxis tickFormatter={fmtUSDcompact} tick={{ fill: 'var(--ink-dim, var(--ink))', fontSize: 11 }} stroke="var(--rule)" />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                payload={[
                  { value: '70th percentile (favorable)', type: 'square', color: 'var(--accent)' },
                  { value: 'Median', type: 'square', color: 'var(--accent)' },
                  { value: '10th percentile (worst)', type: 'square', color: 'var(--accent)' },
                ]}
              />
              {/* Render in order: largest (p70) first so smaller bands layer on top. */}
              <Area type="monotone" dataKey="p70" stroke="var(--accent)" strokeWidth={1} fill="var(--accent)" fillOpacity={0.15} />
              <Area type="monotone" dataKey="p50" stroke="var(--accent)" strokeWidth={1.5} fill="var(--accent)" fillOpacity={0.30} />
              <Area type="monotone" dataKey="p10" stroke="var(--accent)" strokeWidth={1.5} fill="var(--accent)" fillOpacity={0.55} />
              {retirementYear && (
                <ReferenceLine x={retirementYear} stroke="var(--ink-dim, var(--ink))" strokeDasharray="4 4" label={{ value: 'Retirement', position: 'insideTop', fill: 'var(--ink-dim, var(--ink))', fontSize: 10 }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* SS claim-age optimizer */}
      <div className="rv__ss-opt">
        <div className="rv__ss-opt-head">
          <div>
            <div className="rv__ss-opt-title">Social Security claim-age optimizer</div>
            <div className="rv__ss-opt-subtitle">
              Sweeps ages 62–70 for both spouses (81 combos × 200 paths each).
              Recommends the combination that maximizes probability of success.
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => { setSsOptOpen(o => !o); if (!ssOpt && !ssOptRunning) runSSOpt(); }}
            disabled={ssOptRunning}
          >
            {ssOptRunning ? 'Running…' : (ssOpt ? (ssOptOpen ? 'Hide' : 'Show') : 'Run optimizer')}
          </Button>
        </div>
        {ssOptOpen && ssOpt && (
          <div className="rv__ss-opt-body">
            <div className="rv__ss-opt-best">
              <div>
                <div className="rv__ss-opt-best-label">Recommended</div>
                <div className="rv__ss-opt-best-value">
                  Self claims at <strong>{ssOpt.best.selfClaimAge}</strong>,
                  spouse at <strong>{ssOpt.best.spouseClaimAge}</strong>
                </div>
                <div className="rv__ss-opt-best-sub">
                  P(success) {(ssOpt.best.probabilityOfSuccess * 100).toFixed(1)}% ·
                  median end {fmtUSDcompact(ssOpt.best.medianEndAssets)}
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  // Apply best to current draft (caller has setPath via scenario prop binding;
                  // here we just emit feedback — user can apply manually or we could lift state).
                  setFeedback({
                    kind: 'ok',
                    msg: `Recommended: self ${ssOpt.best.selfClaimAge}, spouse ${ssOpt.best.spouseClaimAge}. Update the SS section to apply.`,
                  });
                }}
              >
                Note recommendation
              </Button>
            </div>
            <div className="rv__ss-opt-grid-wrap">
              <SSOptimizerGrid results={ssOpt.results} best={ssOpt.best} />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Compact 9×9 heatmap of the SS optimizer sweep. Each cell shows P(success).
function SSOptimizerGrid({ results, best }) {
  const ages = [62, 63, 64, 65, 66, 67, 68, 69, 70];
  const byKey = new Map(results.map(r => [`${r.selfClaimAge}-${r.spouseClaimAge}`, r]));
  // Find min/max for color scaling.
  let minP = 1, maxP = 0;
  for (const r of results) {
    if (r.probabilityOfSuccess < minP) minP = r.probabilityOfSuccess;
    if (r.probabilityOfSuccess > maxP) maxP = r.probabilityOfSuccess;
  }
  const range = Math.max(0.001, maxP - minP);
  return (
    <table className="rv__ss-grid">
      <thead>
        <tr>
          <th className="rv__ss-grid-corner">self↓ / spouse→</th>
          {ages.map(a => <th key={a}>{a}</th>)}
        </tr>
      </thead>
      <tbody>
        {ages.map(self => (
          <tr key={self}>
            <th>{self}</th>
            {ages.map(sp => {
              const r = byKey.get(`${self}-${sp}`);
              if (!r) return <td key={sp}>—</td>;
              const isBest = best.selfClaimAge === self && best.spouseClaimAge === sp;
              const norm = (r.probabilityOfSuccess - minP) / range;
              const opacity = 0.15 + norm * 0.55; // 0.15..0.70
              return (
                <td
                  key={sp}
                  className={`rv__ss-grid-cell ${isBest ? 'rv__ss-grid-cell--best' : ''}`}
                  style={{ background: `color-mix(in srgb, var(--accent) ${(opacity * 100).toFixed(0)}%, transparent)` }}
                  title={`self ${self} / spouse ${sp}: P=${(r.probabilityOfSuccess * 100).toFixed(1)}%, median ${fmtUSDcompact(r.medianEndAssets)}`}
                >
                  {(r.probabilityOfSuccess * 100).toFixed(0)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Merged Starting position + account inclusion. Read-only DOBs/totals at top,
// editable include/exclude toggles for each account bucket below. The toggle
// labels carry the balance so the user sees the same number twice would be
// redundant — we drop the per-account read-only tiles in favor of the toggles.
//
// `total invested` reflects only INCLUDED accounts so the sim's starting
// wealth is visibly tied to the toggles.
// Compose draft.ownerOrder + the canonical owners list into the displayed
// order. Owners pinned in `order` keep their slot; new owners (or those
// missing from order) get appended in canonical order at the tail.
function buildOrderedOwners(allOwners, order) {
  const known = new Set(allOwners);
  const seen = new Set();
  const out = [];
  for (const name of (order || [])) {
    if (known.has(name) && !seen.has(name)) {
      out.push(name);
      seen.add(name);
    }
  }
  for (const name of allOwners) {
    if (!seen.has(name)) {
      out.push(name);
      seen.add(name);
    }
  }
  return out;
}

// Resolve a person's age at today given an ISO DOB.
function ageNowFromDob(dobIso) {
  if (!dobIso) return null;
  const dob = new Date(dobIso + 'T00:00:00Z');
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function InputsSummary({
  inputs, draft, setPath, ownerInclusion, selfOwner, onToggleOwner,
}) {
  // Drag-and-drop reorder state — kept local because it's transient UI state
  // that only matters during the drag interaction itself.
  const [dragSrc, setDragSrc] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  if (!inputs) return null;
  const allOwners = Array.isArray(inputs.owners) ? inputs.owners : [];
  const ordered = buildOrderedOwners(allOwners, draft.ownerOrder);
  const ownerProfile = draft.ownerProfile || {};
  const ownerRoles = draft.ownerRoles || {};
  const ownerCollapsed = draft.ownerCollapsed || {};
  const anyIncluded = ordered.some(o => ownerInclusion?.[o] === true);

  // Resolved role for an owner: explicit user designation wins; otherwise
  // fall back to the server's selfOwner heuristic for "self" only. Spouse
  // and child are never auto-assigned — names rarely line up reliably and
  // child status is a deliberate exclusion, not a guess.
  const roleFor = (name) => {
    const explicit = ownerRoles[name];
    if (explicit === 'self' || explicit === 'spouse' || explicit === 'child') return explicit;
    const anyExplicitSelf = Object.values(ownerRoles).includes('self');
    if (!anyExplicitSelf && name === selfOwner) return 'self';
    return null;
  };

  // Move owner currently at `srcIdx` so it lands at position `dstIdx` in
  // the displayed list. Used by drag-and-drop drop-targets.
  const moveOwnerTo = (srcIdx, dstIdx) => {
    if (srcIdx === dstIdx || srcIdx < 0 || dstIdx < 0) return;
    const next = [...ordered];
    const [item] = next.splice(srcIdx, 1);
    next.splice(dstIdx, 0, item);
    setPath(['ownerOrder'], next);
  };

  // Role designation. Role is now the single source of truth for inclusion:
  //   self | spouse → counted in the simulation
  //   child | (none) → excluded
  // 'self' and 'spouse' each clear from any prior holder (only one of each).
  // We sync ownerInclusion alongside so the simulator path (which still
  // reads ownerInclusion) stays consistent without divergence.
  const setRole = (name, nextRole) => {
    const cleared = { ...ownerRoles };
    const dispossessed = []; // owners whose role we just stole
    if (nextRole === 'self' || nextRole === 'spouse') {
      for (const k of Object.keys(cleared)) {
        if (cleared[k] === nextRole && k !== name) {
          dispossessed.push(k);
          delete cleared[k];
        }
      }
      cleared[name] = nextRole;
    } else if (nextRole === 'child') {
      cleared[name] = 'child';
    } else {
      delete cleared[name];
    }
    setPath(['ownerRoles'], cleared);
    if (onToggleOwner) {
      // Sync inclusion for the owner we just changed.
      const shouldInclude = nextRole === 'self' || nextRole === 'spouse';
      const isIncluded = ownerInclusion?.[name] === true;
      if (shouldInclude !== isIncluded) onToggleOwner(name, shouldInclude);
      // Anyone we dispossessed of self/spouse drops out of the simulation.
      for (const k of dispossessed) {
        if (ownerInclusion?.[k] === true) onToggleOwner(k, false);
      }
    }
  };

  const toggleCollapsed = (name) => {
    const next = { ...ownerCollapsed };
    if (next[name]) delete next[name];
    else next[name] = true;
    setPath(['ownerCollapsed'], next);
  };

  // Birthday/mortality writers. For self/spouse roles, write to BOTH
  // ownerProfile (per-name persistence) and the simulator-facing
  // horizon/retirementDates fields so the sim picks the values up.
  const setBirthday = (name, role, v) => {
    setPath(['ownerProfile', name, 'dob'], v);
    // ownerProfile DOB is overlaid into inputs.people inside RetirementView,
    // so no horizon write here.
  };
  const setMortality = (name, role, v) => {
    setPath(['ownerProfile', name, 'mortalityAge'], v);
    if (role === 'self') setPath(['horizon', 'mortalityAgeSelf'], v);
    else if (role === 'spouse') setPath(['horizon', 'mortalityAgeSpouse'], v);
  };
  const setRetirementDate = (name, role, v) => {
    setPath(['ownerProfile', name, 'retirementDate'], v);
    if (role === 'self') setPath(['retirementDates', 'selfStopWorkingDate'], v);
    else if (role === 'spouse') setPath(['retirementDates', 'spouseStopWorkingDate'], v);
  };

  // Resolve displayed values: explicit ownerProfile entries override
  // server-/scenario-derived defaults so the user's edits are stickier
  // than the imported defaults.
  const dobFor = (name, role) => {
    const profileDob = ownerProfile[name]?.dob;
    if (profileDob) return profileDob;
    if (role === 'self')   return inputs.people?.self?.dob || null;
    if (role === 'spouse') return inputs.people?.spouse?.dob || null;
    return null;
  };
  const mortalityFor = (name, role) => {
    const profileMortality = ownerProfile[name]?.mortalityAge;
    if (profileMortality != null) return profileMortality;
    if (role === 'self')   return draft.horizon.mortalityAgeSelf;
    if (role === 'spouse') return draft.horizon.mortalityAgeSpouse;
    return null;
  };
  const retirementDateFor = (name, role) => {
    const profileDate = ownerProfile[name]?.retirementDate;
    if (profileDate) return profileDate;
    if (role === 'self')   return draft.retirementDates.selfStopWorkingDate;
    if (role === 'spouse') return draft.retirementDates.spouseStopWorkingDate;
    return null;
  };

  return (
    <Section
      title="Account Owners"
      subtitle="Pick whose accounts feed the simulator, designate roles, and configure each person's life-stage data."
    >
      {ordered.length === 0 && (
        <div className="rv__owners-empty">
          No owners detected in the spreadsheet yet.
        </div>
      )}

      {!anyIncluded && ordered.length > 0 && (
        <div className="rv__owners-prompt">
          Pick at least one household member below to start the simulation.
        </div>
      )}

      <div className="rv__owners">
        {ordered.map((name, idx) => {
          const role = roleFor(name);
          const included = ownerInclusion?.[name] === true;
          const collapsed = !!ownerCollapsed[name];
          const isChild = role === 'child';
          const dob = dobFor(name, role);
          const age = ageNowFromDob(dob);

          const ownerClass = [
            'rv__owner',
            included && 'rv__owner--on',
            isChild && 'rv__owner--child',
            dragSrc === idx && 'rv__owner--dragging',
            dragOver === idx && dragSrc !== null && dragSrc !== idx && 'rv__owner--drop-target',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={name}
              className={ownerClass}
              draggable={dragSrc === idx}
              onDragStart={(e) => {
                if (dragSrc !== idx) { e.preventDefault(); return; }
                e.dataTransfer.setData('text/plain', String(idx));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (dragSrc === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOver !== idx) setDragOver(idx);
              }}
              onDragLeave={() => { if (dragOver === idx) setDragOver(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const src = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (Number.isInteger(src)) moveOwnerTo(src, idx);
                setDragSrc(null);
                setDragOver(null);
              }}
              onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
            >
              <div className="rv__owner-head-row">
                <button
                  type="button"
                  className="rv__owner-grip"
                  aria-label="Drag to reorder"
                  title="Drag to reorder"
                  onMouseDown={() => setDragSrc(idx)}
                  onTouchStart={() => setDragSrc(idx)}
                >
                  <span aria-hidden="true">⋮⋮</span>
                </button>
                <div className="rv__owner-head">
                  <span className="rv__owner-name">{name}</span>
                </div>
                <select
                  className="rv__owner-role-select"
                  value={role || ''}
                  onChange={(e) => setRole(name, e.target.value || null)}
                  title="Role determines how the simulator uses this person's data"
                >
                  <option value="">—</option>
                  <option value="self">Self</option>
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                </select>
                <button
                  type="button"
                  className="rv__owner-collapse"
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? 'Expand details' : 'Collapse details'}
                  title={collapsed ? 'Expand details' : 'Collapse details'}
                  onClick={() => toggleCollapsed(name)}
                >
                  <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                </button>
              </div>

              {!collapsed && !isChild && (
                <div className="rv__owner-fields">
                  <Field
                    label="Birthday"
                    hint={age != null ? `Age ${age}` : null}
                  >
                    <DateInput
                      value={dob}
                      onChange={(v) => setBirthday(name, role, v)}
                    />
                  </Field>
                  <Field label="Mortality age">
                    <NumInput
                      value={mortalityFor(name, role)}
                      onChange={(v) => setMortality(name, role, v)}
                      min={50}
                    />
                  </Field>
                  {(role === 'self' || role === 'spouse') ? (
                    <Field label="Retirement date">
                      <DateInput
                        value={retirementDateFor(name, role)}
                        onChange={(v) => setRetirementDate(name, role, v)}
                      />
                    </Field>
                  ) : (
                    <Field label="Retirement date" hint="Set role to self or spouse">
                      <div className="rv__owner-disabled">—</div>
                    </Field>
                  )}
                </div>
              )}

              {!collapsed && isChild && (
                <div className="rv__owner-child-note">
                  Excluded — children's accounts (529s, custodial) don't feed
                  the retirement projection.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
