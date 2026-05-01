import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card, Button } from '../ui';
import './PensionView.css';

const SERIES_COLORS = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)',
  'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)',
];

const TODAY_ISO = new Date().toISOString().slice(0, 10);
const DEFAULT_RATE_PCT = 6;
const DEFAULT_INFL_PCT = 3;
const DEFAULT_AGE_OF_DEATH = 90;

function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}

function fmtUSDSigned(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return sign + new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Math.abs(v));
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + n, d));
  return date.toISOString().slice(0, 10);
}

function addYearsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y + n, m - 1, d));
  return date.toISOString().slice(0, 10);
}

function monthsBetween(isoA, isoB) {
  const [ay, am] = isoA.split('-').map(Number);
  const [by, bm] = isoB.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

// Age difference between two ISO dates expressed as whole years + months,
// rolled back when the day-of-month hasn't been reached yet.
function ageBetween(dobISO, asOfISO) {
  const [dy, dm, dd] = dobISO.split('-').map(Number);
  const [ay, am, ad] = asOfISO.split('-').map(Number);
  let years = ay - dy;
  let months = am - dm;
  if (ad < dd) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  return { years: Math.max(0, years), months: Math.max(0, months) };
}

function fmtAgeYM({ years, months }) {
  if (months === 0) return `${years} yr`;
  return `${years} yr, ${months} mo`;
}

const ymOf = (iso) => iso.slice(0, 7);

// Returns the monthly payment (nominal) for a given option at a given month.
// The "you alive / spouse alive" booleans drive who's collecting; per the
// user's spec, J&S options keep the "You" amount when only the retiree is
// alive (no pop-up to SLA). When only the spouse is alive, they collect the
// surviving-beneficiary amount.
function paymentForMonth(option, dateISO, youAlive, spouseAlive) {
  if (option.kind === 'annuity') {
    if (youAlive) return option.you_amount || 0;
    if (spouseAlive) return option.spouse_amount || 0;
    return 0;
  }
  if (option.kind === 'ss_offset_annuity') {
    const isLeveling = option.leveling_date ? dateISO >= option.leveling_date : false;
    if (youAlive) {
      return isLeveling ? (option.you_leveling || 0) : (option.you_starting || 0);
    }
    if (spouseAlive) {
      return isLeveling ? (option.spouse_leveling || 0) : (option.spouse_starting || 0);
    }
    return 0;
  }
  return 0;
}

// Single shared simulator. Each option becomes its own forward-projected
// "side account":
//   - any pension/lump-sum cash received gets deposited
//   - the senior supplementary lump sum hits every scenario on its date
//   - monthly spending (today's $, escalated by inflation) is withdrawn each
//     month from the start-of-retirement onward
//   - balance grows at the nominal rate of return between months
//   - the running balance is converted to today's dollars by deflating with
//     the inflation rate, so curves compare directly in real terms
function simulate(options, supplementary, params) {
  const {
    horizonStartISO, horizonEndISO, spendingStartISO,
    myDoD, spouseDoD,
    monthlySpendToday, ratePct, inflationPct,
    benefitCommencement,
  } = params;

  const r = (ratePct / 100) / 12;
  const infl = inflationPct / 100;
  const totalMonths = Math.max(0, monthsBetween(horizonStartISO, horizonEndISO));

  const supplementaryYM = supplementary?.date ? ymOf(supplementary.date) : null;
  const commencementYM = benefitCommencement ? ymOf(benefitCommencement) : null;
  const spendingStartYM = ymOf(spendingStartISO);

  return options.map((opt) => {
    let nominal = 0;
    const series = [];

    for (let m = 0; m <= totalMonths; m++) {
      const dateISO = addMonthsISO(horizonStartISO, m);
      const ym = ymOf(dateISO);
      const yearsFromToday = monthsBetween(TODAY_ISO, dateISO) / 12;

      // Apply growth before this month's flows.
      if (m > 0) nominal *= (1 + r);

      const youAlive = dateISO <= myDoD;
      const spouseAlive = dateISO <= spouseDoD;

      // Pension inflows from the chosen option.
      if (opt.kind === 'lump_sum') {
        // The lump-sum row's column G is a header label, not a date. Pay
        // the lump sum on the month of benefit commencement.
        if (commencementYM && ym === commencementYM && (youAlive || spouseAlive)) {
          nominal += opt.you_amount || 0;
        }
      } else if (opt.kind === 'annuity' || opt.kind === 'ss_offset_annuity') {
        // Some annuity rows leave the start-date column blank — fall back to
        // the plan's Benefit Commencement so payments still flow.
        const optStart = opt.start_date || benefitCommencement;
        if (optStart && dateISO >= optStart) {
          nominal += paymentForMonth(opt, dateISO, youAlive, spouseAlive);
        }
      }

      // Senior supplementary lump sum is paid into every scenario.
      if (supplementaryYM && ym === supplementaryYM && (youAlive || spouseAlive)) {
        nominal += supplementary.amount || 0;
      }

      // Spending kicks in once we reach Stop Working / retirement, and only
      // while at least one of the two is alive.
      if (ym >= spendingStartYM && (youAlive || spouseAlive)) {
        const spendNominal = monthlySpendToday * Math.pow(1 + infl, Math.max(0, yearsFromToday));
        nominal -= spendNominal;
      }

      const real = nominal / Math.pow(1 + infl, Math.max(0, yearsFromToday));
      series.push({ date: dateISO, real, nominal });

      if (!youAlive && !spouseAlive) break;
    }

    const last = series[series.length - 1];
    return {
      ...opt,
      series,
      end_real: last ? last.real : 0,
      end_nominal: last ? last.nominal : 0,
    };
  });
}

function describeOptionAmount(opt) {
  if (opt.kind === 'lump_sum') {
    return { you: fmtUSD(opt.you_amount), spouse: opt.spouse_amount ? fmtUSD(opt.spouse_amount) : '—' };
  }
  if (opt.kind === 'annuity') {
    return {
      you: opt.you_amount ? `${fmtUSD(opt.you_amount)}/mo` : '—',
      spouse: opt.spouse_amount ? `${fmtUSD(opt.spouse_amount)}/mo` : '—',
    };
  }
  if (opt.kind === 'ss_offset_annuity') {
    return {
      you: `${fmtUSD(opt.you_starting)} → ${fmtUSD(opt.you_leveling)}/mo`,
      spouse: opt.spouse_starting
        ? `${fmtUSD(opt.spouse_starting)} → ${fmtUSD(opt.spouse_leveling)}/mo`
        : '—',
    };
  }
  return { you: '—', spouse: '—' };
}

function kindLabel(kind) {
  if (kind === 'lump_sum') return 'Lump Sum';
  if (kind === 'annuity') return 'Annuity';
  if (kind === 'ss_offset_annuity') return 'SS Offset';
  return kind;
}

export default function PensionView() {
  const [data, setData] = useState(null);
  const [errorBody, setErrorBody] = useState(null);

  const [ratePctInput, setRatePctInput] = useState(String(DEFAULT_RATE_PCT));
  const [inflPctInput, setInflPctInput] = useState(String(DEFAULT_INFL_PCT));
  // Ages are integers (years). Date of death is derived from DOB + age,
  // which keeps the input intuitive when comparing scenarios.
  const [myAge, setMyAge] = useState(DEFAULT_AGE_OF_DEATH);
  const [spouseAge, setSpouseAge] = useState(DEFAULT_AGE_OF_DEATH);
  const [hidden, setHidden] = useState(() => new Set());    // option ids hidden from chart

  const reload = useCallback(() => {
    setErrorBody(null);
    fetch('/api/pension')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) { setErrorBody({ status: r.status, ...body }); return null; }
        return body;
      })
      .then((body) => { if (body) setData(body); })
      .catch((e) => setErrorBody({ status: 0, error: e.message }));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const ratePct = Number.parseFloat(ratePctInput);
  const ratePctSafe = Number.isFinite(ratePct) ? ratePct : DEFAULT_RATE_PCT;
  const inflPct = Number.parseFloat(inflPctInput);
  const inflPctSafe = Number.isFinite(inflPct) ? inflPct : DEFAULT_INFL_PCT;

  // Date of death derived from DOB + age. If a DOB isn't available the
  // simulator can't run for that person — guarded below.
  const myDoD = data?.header?.my_dob ? addYearsISO(data.header.my_dob, myAge) : null;
  const spouseDoD = data?.header?.beneficiary_dob ? addYearsISO(data.header.beneficiary_dob, spouseAge) : null;
  const ageAtStopWorking = (data?.header?.my_dob && data?.header?.stop_working)
    ? ageBetween(data.header.my_dob, data.header.stop_working)
    : null;

  const forecasts = useMemo(() => {
    if (!data?.options?.length) return [];
    if (!myDoD || !spouseDoD) return [];
    const horizonStart = data.header?.stop_working || data.header?.benefit_commencement || TODAY_ISO;
    const horizonEnd = (myDoD > spouseDoD) ? myDoD : spouseDoD;
    return simulate(data.options, data.supplementary, {
      horizonStartISO: horizonStart,
      horizonEndISO: horizonEnd,
      // Per spec: spending is $0 — we're comparing pure time-value of money
      // across the option cashflows.
      spendingStartISO: horizonStart,
      myDoD, spouseDoD,
      monthlySpendToday: 0,
      ratePct: ratePctSafe,
      inflationPct: inflPctSafe,
      benefitCommencement: data.header?.benefit_commencement,
    });
  }, [data, myDoD, spouseDoD, ratePctSafe, inflPctSafe]);

  // Pivot per-option series into a wide row per date so Recharts can render
  // every line on a shared x-axis.
  const chartData = useMemo(() => {
    if (!forecasts.length) return [];
    const byDate = new Map();
    const get = (date) => {
      if (!byDate.has(date)) byDate.set(date, { date });
      return byDate.get(date);
    };
    for (const f of forecasts) {
      for (const point of f.series) {
        get(point.date)[f.id] = Math.round(point.real);
      }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [forecasts]);

  function toggleHidden(id) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (errorBody) {
    return (
      <div className="pn">
        <div className="pn__head">
          <div className="pn__page-header">Pension</div>
          <Button variant="ghost" onClick={reload}>Reload from sheet</Button>
        </div>
        <Card>
          <div className="pn__error">{errorBody.error || `Failed to load (status ${errorBody.status}).`}</div>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pn">
        <div className="pn__head">
          <div className="pn__page-header">Pension</div>
          <Button variant="ghost" onClick={reload}>Reload from sheet</Button>
        </div>
        <div className="pn__loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="pn">
      <div className="pn__head">
        <div className="pn__page-header">Pension</div>
        <Button variant="ghost" onClick={reload}>Reload from sheet</Button>
      </div>

      <Card>
        <div className="pn__overview">
          <div className="pn__overview-item">
            <div className="pn__overview-label">Stop Working</div>
            <div className="pn__overview-value">{fmtDate(data.header?.stop_working)}</div>
            <div className="pn__overview-sub">
              {ageAtStopWorking ? `Age ${fmtAgeYM(ageAtStopWorking)}` : 'Add Your DOB to see age'}
            </div>
          </div>
          <div className="pn__overview-item">
            <div className="pn__overview-label">Benefit Commencement</div>
            <div className="pn__overview-value">{fmtDate(data.header?.benefit_commencement)}</div>
          </div>
          <div className="pn__overview-item">
            <div className="pn__overview-label">Beneficiary</div>
            <div className="pn__overview-value">{data.header?.beneficiary || '—'}</div>
          </div>
          <div className="pn__overview-item">
            <div className="pn__overview-label">Your DOB</div>
            <div className="pn__overview-value">{fmtDate(data.header?.my_dob)}</div>
          </div>
          <div className="pn__overview-item">
            <div className="pn__overview-label">Beneficiary DOB</div>
            <div className="pn__overview-value">{fmtDate(data.header?.beneficiary_dob)}</div>
          </div>
          <div className="pn__overview-item">
            <div className="pn__overview-label">Senior Supplementary</div>
            <div className="pn__overview-value">
              {data.supplementary
                ? `${fmtUSD(data.supplementary.amount)} on ${fmtDate(data.supplementary.date)}`
                : '—'}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="pn__inputs">
          <div className="pn__input-group">
            <label className="pn__input-label" htmlFor="pn-rate">Rate of return (lump sums)</label>
            <div className="pn__input-wrap">
              <input
                id="pn-rate"
                className="pn__input pn__input--num"
                type="number" step="0.1" min="0" max="20"
                value={ratePctInput}
                onChange={(e) => setRatePctInput(e.target.value)}
              />
              <span className="pn__input-suffix">%</span>
            </div>
          </div>
          <div className="pn__input-group">
            <label className="pn__input-label" htmlFor="pn-infl">Inflation</label>
            <div className="pn__input-wrap">
              <input
                id="pn-infl"
                className="pn__input pn__input--num"
                type="number" step="0.1" min="0" max="15"
                value={inflPctInput}
                onChange={(e) => setInflPctInput(e.target.value)}
              />
              <span className="pn__input-suffix">%</span>
            </div>
          </div>
          <div className="pn__input-group">
            <label className="pn__input-label" htmlFor="pn-myage">Your age of death</label>
            <div className="pn__input-wrap pn__input-wrap--age">
              <button
                type="button"
                className="pn__bump-btn"
                aria-label="Decrease age"
                onClick={() => setMyAge(a => Math.max(0, a - 1))}
              >−</button>
              <input
                id="pn-myage"
                className="pn__input pn__input--num"
                type="number" step="1" min="0" max="120"
                value={myAge}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setMyAge(Math.max(0, Math.min(120, n)));
                }}
              />
              <button
                type="button"
                className="pn__bump-btn"
                aria-label="Increase age"
                onClick={() => setMyAge(a => Math.min(120, a + 1))}
              >+</button>
            </div>
            <div className="pn__input-hint">{myDoD ? fmtDate(myDoD) : 'Add Your DOB to enable'}</div>
          </div>
          <div className="pn__input-group">
            <label className="pn__input-label" htmlFor="pn-spage">Spouse age of death</label>
            <div className="pn__input-wrap pn__input-wrap--age">
              <button
                type="button"
                className="pn__bump-btn"
                aria-label="Decrease age"
                onClick={() => setSpouseAge(a => Math.max(0, a - 1))}
              >−</button>
              <input
                id="pn-spage"
                className="pn__input pn__input--num"
                type="number" step="1" min="0" max="120"
                value={spouseAge}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setSpouseAge(Math.max(0, Math.min(120, n)));
                }}
              />
              <button
                type="button"
                className="pn__bump-btn"
                aria-label="Increase age"
                onClick={() => setSpouseAge(a => Math.min(120, a + 1))}
              >+</button>
            </div>
            <div className="pn__input-hint">{spouseDoD ? fmtDate(spouseDoD) : 'Add Beneficiary DOB to enable'}</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="pn__chart-header">
          <div className="pn__section-title">Value over time (today's dollars)</div>
        </div>

        <div className="pn__chart-wrapper">
          {forecasts.length === 0 ? (
            <div className="pn__chart-empty">No scenarios to plot.</div>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <LineChart data={chartData} margin={{ top: 12, right: 24, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
                  tickFormatter={(d) => d.slice(0, 7)}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--ink-2)' }}
                  tickFormatter={fmtUSD}
                  width={90}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--card-hi)', border: '1px solid var(--rule-3)', fontSize: 12 }}
                  labelStyle={{ color: 'var(--ink-2)' }}
                  formatter={(v, name) => [fmtUSD(v), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {forecasts.map((f, i) => {
                  if (hidden.has(f.id)) return null;
                  return (
                    <Line
                      key={f.id}
                      type="monotone"
                      dataKey={f.id}
                      name={f.label}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {data.supplementary && (
          <div className="pn__supplement">
            Includes the Senior Supplementary {fmtUSD(data.supplementary.amount)} lump sum on {fmtDate(data.supplementary.date)} for every scenario.
          </div>
        )}
      </Card>

      <Card>
        <table className="pn__table">
          <thead>
            <tr>
              <th>Show</th>
              <th>Scenario</th>
              <th>Type</th>
              <th className="pn__num">You</th>
              <th className="pn__num">Spouse (Survivor)</th>
              <th>Start</th>
              <th>Leveling</th>
              <th className="pn__num">End balance (today $)</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((f, i) => {
              const amt = describeOptionAmount(f);
              const tone = f.end_real == null ? '' : f.end_real >= 0 ? 'pn__pos' : 'pn__neg';
              const isHidden = hidden.has(f.id);
              const color = SERIES_COLORS[i % SERIES_COLORS.length];
              return (
                <tr key={f.id} className={isHidden ? 'pn__row--hidden' : ''}>
                  <td className="pn__toggle-col">
                    <div className="pn__toggle-cell">
                      <span className="pn__swatch" style={{ background: color }} />
                      <input
                        type="checkbox"
                        className="pn__row-toggle"
                        checked={!isHidden}
                        onChange={() => toggleHidden(f.id)}
                        aria-label={`Toggle ${f.label}`}
                      />
                    </div>
                  </td>
                  <td>{f.label}</td>
                  <td className="pn__dim">{kindLabel(f.kind)}</td>
                  <td className="pn__num">{amt.you}</td>
                  <td className="pn__num">{amt.spouse}</td>
                  <td>{fmtDate(f.start_date || f.date || data.header?.benefit_commencement)}</td>
                  <td>{fmtDate(f.leveling_date)}</td>
                  <td className={`pn__num ${tone}`}>{fmtUSDSigned(f.end_real)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
