import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import { Card, Stat, Button } from '../ui';
import { useRetirementScenarios, useRetirementInputs } from '../hooks/useRetirementScenarios';
import { runSimulation, aggregatePercentiles, optimizeSSClaimAge } from '../utils/monteCarlo';
import './RetirementView.css';

/**
 * RetirementView — Phase 1 scenario UI.
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
    pension: { optionId: null, annualAmount: 0, startDate: null },
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
  },
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
function withDefaults(s) {
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
// their cursor on every render.
function NumInput({ value, onChange, step = 1, suffix, placeholder, min }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    // Sync external value changes (scenario load) into the input
    setText(value == null ? '' : String(value));
  }, [value]);
  return (
    <div className="rv__num-wrap">
      <input
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

function PctInput({ value, onChange, step = 0.005 }) {
  // Stored as decimal (0.04). Displayed as 4.0.
  const [text, setText] = useState(value == null ? '' : (value * 100).toFixed(2));
  useEffect(() => {
    setText(value == null ? '' : (value * 100).toFixed(2));
  }, [value]);
  return (
    <div className="rv__num-wrap">
      <input
        className="rv__input"
        type="number"
        step={step * 100}
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

function Field({ label, hint, children }) {
  return (
    <div className="rv__field">
      <div className="rv__field-label">{label}</div>
      {children}
      {hint && <div className="rv__field-hint">{hint}</div>}
    </div>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────
function Section({ title, subtitle, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="rv__section">
      <div className="rv__section-head">
        <div>
          <div className="rv__section-title">{title}</div>
          {subtitle && <div className="rv__section-subtitle">{subtitle}</div>}
        </div>
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
export default function RetirementView() {
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

  const allocSum = (
    Number(draft.allocation.equity || 0) +
    Number(draft.allocation.bond || 0) +
    Number(draft.allocation.cash || 0)
  );
  const allocOk = Math.abs(allocSum - 1) < 0.0005;

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
          {/* Scenario header */}
          <Section title="Scenario" subtitle="Identity and lifecycle">
            <div className="rv__grid-2">
              <Field label="Name">
                <TextInput
                  value={draft.name}
                  onChange={(v) => setPath(['name'], v)}
                  placeholder="Base case"
                />
              </Field>
              <Field label="ID" hint={activeId ? 'Saved with this id' : 'Generated on save from name'}>
                <TextInput value={draft.id || ''} onChange={() => {}} placeholder="(auto)" />
              </Field>
            </div>
          </Section>

          {/* Simulation pane — between Scenario and Starting position */}
          <div className="rv__sim">
            <SimulationPane scenario={draft} inputs={inputs} setFeedback={setFeedback} />
          </div>

          {/* Starting position + account inclusion (merged) */}
          <InputsSummary
            inputs={inputs}
            accountInclusion={draft.accountInclusion}
            onToggleInclude={(k, v) => setPath(['accountInclusion', k], v)}
          />

          {/* Horizon */}
          <Section title="Horizon" subtitle="Plan length">
            <div className="rv__grid-2">
              <Field label="Mortality age — self">
                <NumInput
                  value={draft.horizon.mortalityAgeSelf}
                  onChange={(v) => setPath(['horizon', 'mortalityAgeSelf'], v)}
                  min={50}
                />
              </Field>
              <Field label="Mortality age — spouse">
                <NumInput
                  value={draft.horizon.mortalityAgeSpouse}
                  onChange={(v) => setPath(['horizon', 'mortalityAgeSpouse'], v)}
                  min={50}
                />
              </Field>
            </div>
          </Section>

          {/* Retirement dates */}
          <Section title="Retirement dates" subtitle="When work income stops">
            <div className="rv__grid-2">
              <Field label="Self stops working">
                <DateInput
                  value={draft.retirementDates.selfStopWorkingDate}
                  onChange={(v) => setPath(['retirementDates', 'selfStopWorkingDate'], v)}
                />
              </Field>
              <Field label="Spouse stops working" hint="Optional">
                <DateInput
                  value={draft.retirementDates.spouseStopWorkingDate}
                  onChange={(v) => setPath(['retirementDates', 'spouseStopWorkingDate'], v)}
                />
              </Field>
            </div>
          </Section>

          {/* Income */}
          <Section title="Income" subtitle="Salary, Social Security, pension">
            <div className="rv__grid-3">
              <Field label="Pre-retirement salary">
                <NumInput
                  value={draft.income.preRetirementSalary}
                  onChange={(v) => setPath(['income', 'preRetirementSalary'], v)}
                  step={1000}
                  suffix="$"
                />
              </Field>
              <Field label="Annual salary increase">
                <PctInput
                  value={draft.income.annualSalaryIncreasePct}
                  onChange={(v) => setPath(['income', 'annualSalaryIncreasePct'], v)}
                />
              </Field>
              <Field label="STIP">
                <PctInput
                  value={draft.income.stipPct}
                  onChange={(v) => setPath(['income', 'stipPct'], v)}
                />
              </Field>
            </div>

            <div className="rv__sub-title">Social Security</div>
            <div className="rv__grid-4">
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
            </div>

            <div className="rv__sub-title">Pension</div>
            <div className="rv__grid-3">
              <Field label="Pension option">
                <select
                  className="rv__input"
                  value={draft.income.pension.optionId || ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const picked = pensionOptions.find(p => p.value === id);
                    setPath(['income', 'pension'], {
                      optionId: id,
                      annualAmount: picked ? (picked.raw.you_amount || picked.raw.you_starting || 0) : 0,
                      startDate: picked ? (picked.raw.start_date || picked.raw.date || null) : null,
                    });
                  }}
                >
                  <option value="">— None —</option>
                  {pensionOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Annual amount">
                <NumInput
                  value={draft.income.pension.annualAmount}
                  onChange={(v) => setPath(['income', 'pension', 'annualAmount'], v)}
                  step={100}
                  suffix="$"
                />
              </Field>
              <Field label="Start date">
                <DateInput
                  value={draft.income.pension.startDate}
                  onChange={(v) => setPath(['income', 'pension', 'startDate'], v)}
                />
              </Field>
            </div>
          </Section>

          {/* Spending */}
          <Section title="Spending" subtitle="Three life-stage bands and healthcare">
            <div className="rv__grid-2">
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
              <Field label="Healthcare growth over inflation">
                <PctInput
                  value={draft.spending.healthcareGrowthPctOverInflation}
                  onChange={(v) => setPath(['spending', 'healthcareGrowthPctOverInflation'], v)}
                />
              </Field>
            </div>
          </Section>

          {/* Contributions */}
          <Section title="Contributions" subtitle="Annual savings while working">
            <div className="rv__grid-2">
              <Field label="401(k) — employee">
                <NumInput
                  value={draft.contributions.annual401k}
                  onChange={(v) => setPath(['contributions', 'annual401k'], v)}
                  step={500}
                  suffix="$"
                />
              </Field>
              <Field label="401(k) — employer match">
                <NumInput
                  value={draft.contributions.annualEmployerMatch}
                  onChange={(v) => setPath(['contributions', 'annualEmployerMatch'], v)}
                  step={500}
                  suffix="$"
                />
              </Field>
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
            </div>
            <div className="rv__row">
              <Toggle
                label="Stop contributions at retirement"
                checked={draft.contributions.stopAtRetirement}
                onChange={(v) => setPath(['contributions', 'stopAtRetirement'], v)}
              />
            </div>
          </Section>

          {/* Withdrawal sequence */}
          <Section title="Withdrawal sequence" subtitle="Order of accounts drawn down">
            <WithdrawalSequence
              sequence={draft.withdrawalSequence}
              onChange={(seq) => setPath(['withdrawalSequence'], seq)}
            />
          </Section>

          {/* Advanced — collapsed by default */}
          <Section title="Advanced — tax, returns, allocation" collapsible defaultOpen={false}>
            <div className="rv__sub-title">Tax</div>
            <div className="rv__grid-2">
              <Field label="Effective ordinary rate">
                <PctInput
                  value={draft.tax.effectiveRateOrdinary}
                  onChange={(v) => setPath(['tax', 'effectiveRateOrdinary'], v)}
                />
              </Field>
              <Field label="Effective LTCG rate">
                <PctInput
                  value={draft.tax.effectiveRateLTCG}
                  onChange={(v) => setPath(['tax', 'effectiveRateLTCG'], v)}
                />
              </Field>
            </div>

            <div className="rv__sub-title">Expected returns (mean / stdev)</div>
            <div className="rv__grid-2">
              {['equity', 'bond', 'cash', 'inflation'].map(k => (
                <div key={k} className="rv__returns-row">
                  <div className="rv__returns-label">{k}</div>
                  <PctInput
                    value={draft.returns[k].mean}
                    onChange={(v) => setPath(['returns', k, 'mean'], v)}
                  />
                  <PctInput
                    value={draft.returns[k].stdev}
                    onChange={(v) => setPath(['returns', k, 'stdev'], v)}
                  />
                </div>
              ))}
            </div>

            <div className="rv__sub-title">
              Allocation
              {!allocOk && (
                <span className="rv__alloc-warn"> · sums to {fmtPct(allocSum)} (must equal 100%)</span>
              )}
            </div>
            <div className="rv__grid-3">
              <Field label="Equity">
                <PctInput
                  value={draft.allocation.equity}
                  onChange={(v) => setPath(['allocation', 'equity'], v)}
                />
              </Field>
              <Field label="Bond">
                <PctInput
                  value={draft.allocation.bond}
                  onChange={(v) => setPath(['allocation', 'bond'], v)}
                />
              </Field>
              <Field label="Cash">
                <PctInput
                  value={draft.allocation.cash}
                  onChange={(v) => setPath(['allocation', 'cash'], v)}
                />
              </Field>
            </div>

            <div className="rv__sub-title">Monte Carlo</div>
            <div className="rv__grid-2">
              <Field label="Number of paths">
                <NumInput
                  value={draft.monteCarlo.paths}
                  onChange={(v) => setPath(['monteCarlo', 'paths'], v)}
                  step={100}
                  min={100}
                />
              </Field>
              <Field label="Random seed" hint="Leave blank for fresh randomness">
                <NumInput
                  value={draft.monteCarlo.seed}
                  onChange={(v) => setPath(['monteCarlo', 'seed'], v)}
                  step={1}
                />
              </Field>
            </div>
          </Section>
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
      <div className="rv__tooltip-row"><span className="rv__tooltip-swatch rv__tooltip-swatch--p90" /> 90th pct (best){fmtUSDcompact(byKey.p90)}</div>
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
        const result = runSimulation(scenario, inputs);
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
        const result = optimizeSSClaimAge(scenario, inputs);
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

  // Aggregate percentiles for the chart.
  const aggregated = useMemo(() => {
    if (!simResult) return null;
    return aggregatePercentiles(simResult.paths, [10, 50, 90]);
  }, [simResult]);

  const chartData = useMemo(() => {
    if (!aggregated) return [];
    return aggregated.years.map((y, i) => ({
      year: y,
      p10: aggregated.bands['10'][i],
      p50: aggregated.bands['50'][i],
      p90: aggregated.bands['90'][i],
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
  const endP90 = lastIndex >= 0 ? aggregated.bands['90'][lastIndex] : null;

  return (
    <Card className="rv__sim-card">
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
          <Card>
            <Stat
              label="Probability of success"
              value={`${(summary.probabilityOfSuccess * 100).toFixed(1)}%`}
              tone={summary.probabilityOfSuccess >= 0.85 ? 'pos' : summary.probabilityOfSuccess >= 0.70 ? 'neutral' : 'neg'}
              sub="paths that don't deplete"
            />
          </Card>
          <Card>
            <Stat label="Assets at end (10th pct)" value={fmtUSDcompact(endP10)} sub="significantly-below scenario" />
          </Card>
          <Card>
            <Stat label="Assets at end (median)" value={fmtUSDcompact(endP50)} sub="average scenario" />
          </Card>
          <Card>
            <Stat label="Assets at end (90th pct)" value={fmtUSDcompact(endP90)} sub="favorable scenario" />
          </Card>
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
              <XAxis dataKey="year" tick={{ fill: 'var(--ink-2)', fontSize: 11 }} stroke="var(--rule)" />
              <YAxis tickFormatter={fmtUSDcompact} tick={{ fill: 'var(--ink-2)', fontSize: 11 }} stroke="var(--rule)" />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                payload={[
                  { value: '90th percentile (best)', type: 'square', color: 'var(--accent)' },
                  { value: 'Median', type: 'square', color: 'var(--accent)' },
                  { value: '10th percentile (worst)', type: 'square', color: 'var(--accent)' },
                ]}
              />
              {/* Render in order: largest (p90) first so smaller bands layer on top. */}
              <Area type="monotone" dataKey="p90" stroke="var(--accent)" strokeWidth={1} fill="var(--accent)" fillOpacity={0.15} />
              <Area type="monotone" dataKey="p50" stroke="var(--accent)" strokeWidth={1.5} fill="var(--accent)" fillOpacity={0.30} />
              <Area type="monotone" dataKey="p10" stroke="var(--accent)" strokeWidth={1.5} fill="var(--accent)" fillOpacity={0.55} />
              {retirementYear && (
                <ReferenceLine x={retirementYear} stroke="var(--ink-2)" strokeDasharray="4 4" label={{ value: 'Retirement', position: 'insideTop', fill: 'var(--ink-2)', fontSize: 10 }} />
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
function InputsSummary({ inputs, accountInclusion, onToggleInclude }) {
  if (!inputs) return null;
  const balances = inputs.currentBalances || {};
  const includedTotal = Object.entries(balances).reduce((a, [k, v]) => {
    const include = accountInclusion ? !!accountInclusion[k] : true;
    return a + (include ? (Number(v) || 0) : 0);
  }, 0);
  return (
    <Section title="Starting position" subtitle="Pulled from your spreadsheet">
      <div className="rv__starting-grid">
        <div className="rv__starting-cell">
          <div className="rv__starting-label">Self</div>
          <div className="rv__starting-value">
            {inputs.people?.self?.dob ? `DOB ${inputs.people.self.dob}` : '—'}
            {inputs.people?.self?.currentAge != null && ` · age ${inputs.people.self.currentAge}`}
          </div>
        </div>
        <div className="rv__starting-cell">
          <div className="rv__starting-label">Spouse</div>
          <div className="rv__starting-value">
            {inputs.people?.spouse?.name ? `${inputs.people.spouse.name} · ` : ''}
            {inputs.people?.spouse?.dob ? `DOB ${inputs.people.spouse.dob}` : '—'}
            {inputs.people?.spouse?.currentAge != null && ` · age ${inputs.people.spouse.currentAge}`}
          </div>
        </div>
        <div className="rv__starting-cell">
          <div className="rv__starting-label">Total invested (included)</div>
          <div className="rv__starting-value rv__mono">{fmtUSD(includedTotal)}</div>
        </div>
      </div>

      {accountInclusion && (
        <>
          <div className="rv__starting-subhead">Accounts feeding the simulator</div>
          <div className="rv__inclusion">
            {Object.keys(accountInclusion).map(k => (
              <Toggle
                key={k}
                label={`${k}${balances[k] != null ? ` · ${fmtUSD(balances[k])}` : ''}`}
                checked={!!accountInclusion[k]}
                onChange={(v) => onToggleInclude && onToggleInclude(k, v)}
              />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
