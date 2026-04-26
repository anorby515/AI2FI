import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card } from '../ui';
import './EducationSavingsView.css';

const ALL = '__all__';
const DEFAULT_RATE_PCT = 6;
const PROJ_SUFFIX = '__proj';
const COLLEGE_YEARS = 4;

// Series colors keyed off design tokens. Recharts forwards `stroke` to the
// underlying SVG attribute, which accepts `var(...)` references.
const SERIES_COLORS = ['var(--accent)', 'var(--accent-2)', 'var(--warn)', 'var(--pos)', 'var(--neg)'];

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

function monthsBetween(isoA, isoB) {
  const [ay, am] = isoA.split('-').map(Number);
  const [by, bm] = isoB.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

// Compute graduation as the (semestersRemaining)-th Aug/Jan on or after the
// later of seam and college_start, plus 5 months (~May graduation). This
// matters for students already mid-college: we should only charge tuition
// for semesters they haven't already paid, not all 8 from college_start.
function deriveGraduationDate(seamDate, collegeStart, semestersRemaining) {
  if (!collegeStart || semestersRemaining <= 0) return seamDate;
  const walk = collegeStart > seamDate ? collegeStart : seamDate;
  let count = 0;
  for (let i = 0; i < 240; i++) {
    const d = addMonthsISO(walk, i);
    const m = Number(d.split('-')[1]);
    if (m === 1 || m === 8) {
      count++;
      if (count === semestersRemaining) return addMonthsISO(d, 5);
    }
  }
  return walk;
}

// Project all students together so that, when an older sibling graduates,
// their monthly contribution can be redirected to the next still-enrolled
// sibling. Each month, in order:
//   1. apply growth at the supplied annual rate
//   2. add own contribution + any inherited contributions from already-
//      graduated siblings (the youngest pre-grad sibling absorbs the pool)
//   3. if the student is currently in college (between college_start and
//      graduation), and the calendar month is Aug or Jan, subtract one
//      half of estimated_tuition (a semester payment)
// Each student's graduation date is derived from remaining_tuition rather
// than college_start + 48 months, so a junior with two years left only
// gets four more tuition draws instead of eight.
function projectAllStudents(students, annualRatePct) {
  const meta = students.map(s => {
    const seamDate = s.history?.length ? s.history[s.history.length - 1].date : null;
    let semestersRemaining = COLLEGE_YEARS * 2;
    if (s.remaining_tuition != null && s.estimated_tuition && s.estimated_tuition > 0) {
      semestersRemaining = Math.max(0, Math.round(s.remaining_tuition / (s.estimated_tuition / 2)));
    }
    const graduation_date = (seamDate && s.college_start_date)
      ? deriveGraduationDate(seamDate, s.college_start_date, semestersRemaining)
      : null;
    return { ...s, seamDate, graduation_date };
  });

  // Inheritance order: by college start date ascending.
  const order = meta
    .filter(s => s.college_start_date)
    .sort((a, b) => a.college_start_date.localeCompare(b.college_start_date));

  const seams = meta.map(s => s.seamDate).filter(Boolean).sort();
  const grads = meta.map(s => s.graduation_date).filter(Boolean).sort();
  if (!seams.length || !grads.length) {
    return meta.map(s => ({
      ...s,
      projection: [],
      projected_at_start: s.current_balance,
      end_balance: s.current_balance,
    }));
  }
  const globalStart = seams[0];
  const globalEnd = grads[grads.length - 1];
  const totalMonths = monthsBetween(globalStart, globalEnd);
  const r = (annualRatePct / 100) / 12;

  // Per-student running state. Seed with seam point for chart continuity.
  const state = new Map();
  for (const s of meta) {
    const proj = [];
    if (s.seamDate && s.current_balance != null) {
      proj.push({ date: s.seamDate, balance: s.current_balance });
    }
    state.set(s.name, { balance: s.current_balance ?? 0, projection: proj });
  }

  // Compare by YYYY-MM rather than full ISO. The data seam sits on the 1st of
  // the month while college_start_date can be mid-month (e.g. Aug 15); a
  // full-date comparison would skip the start month's first-semester draw.
  const ymOf = (iso) => iso.slice(0, 7);

  for (let i = 1; i <= totalMonths; i++) {
    const date = addMonthsISO(globalStart, i);
    const ym = ymOf(date);
    const monthIdx = Number(date.split('-')[1]); // 1..12
    const isSemesterMonth = monthIdx === 1 || monthIdx === 8;

    // At this date, freed pool = sum of own contributions of already-graduated
    // siblings; recipient = first non-graduated sibling in order.
    let freedPool = 0;
    let recipient = null;
    for (const s of order) {
      if (ym > ymOf(s.graduation_date)) {
        freedPool += (s.monthly_contribution || 0);
      } else if (!recipient) {
        recipient = s.name;
      }
    }

    for (const s of meta) {
      if (!s.seamDate || !s.graduation_date) continue;
      if (ym <= ymOf(s.seamDate)) continue;
      if (ym > ymOf(s.graduation_date)) continue;

      const st = state.get(s.name);
      st.balance = st.balance * (1 + r);
      const inherited = (s.name === recipient) ? freedPool : 0;
      st.balance += (s.monthly_contribution || 0) + inherited;

      if (s.college_start_date
          && ym >= ymOf(s.college_start_date)
          && ym < ymOf(s.graduation_date)
          && isSemesterMonth) {
        st.balance -= (s.estimated_tuition || 0) / 2;
      }
      st.projection.push({ date, balance: st.balance });
    }
  }

  return meta.map(s => {
    const st = state.get(s.name);
    const projection = st ? st.projection : [];
    let projected_at_start = s.current_balance;
    if (s.college_start_date) {
      const startYm = s.college_start_date.slice(0, 7);
      // Last point strictly BEFORE the start month, so we capture the balance
      // entering freshman year before the first semester draw is applied.
      const prior = projection.filter(p => p.date.slice(0, 7) < startYm);
      if (prior.length) projected_at_start = prior[prior.length - 1].balance;
    }
    const end_balance = projection.length
      ? projection[projection.length - 1].balance
      : s.current_balance;
    return { ...s, projection, projected_at_start, end_balance };
  });
}

export default function EducationSavingsView() {
  const [data, setData] = useState(null);
  const [errorBody, setErrorBody] = useState(null);
  const [selected, setSelected] = useState(ALL);
  const [rateInput, setRateInput] = useState(String(DEFAULT_RATE_PCT));
  // Per-student "what-if" delta applied on top of the spreadsheet's monthly
  // contribution. Keyed by student name; value in dollars (-500..+500, step 25).
  const [contribDelta, setContribDelta] = useState({});

  useEffect(() => {
    fetch('/api/education-savings')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) { setErrorBody({ status: r.status, ...body }); return null; }
        return body;
      })
      .then((body) => { if (body) setData(body); })
      .catch((e) => setErrorBody({ status: 0, error: e.message }));
  }, []);

  const ratePct = Number.parseFloat(rateInput);
  const ratePctSafe = Number.isFinite(ratePct) ? ratePct : DEFAULT_RATE_PCT;

  // Project all students together so sibling contributions can roll forward
  // after each graduation. The chart's dashed projection runs from the seam
  // through graduation and bakes in the semesterly tuition draws.
  const forecasts = useMemo(() => {
    if (!data?.students?.length) return [];
    const adjusted = data.students.map(s => ({
      ...s,
      monthly_contribution: (s.monthly_contribution || 0) + (contribDelta[s.name] || 0),
    }));
    return projectAllStudents(adjusted, ratePctSafe);
  }, [data, ratePctSafe, contribDelta]);

  // Pivot per-student histories AND projections into a single
  // { date, [name]: balance, [name__proj]: projected } row set so Recharts
  // can render multiple lines on a shared x-axis. The projection's first
  // point shares the seam date with the last actual point, which makes the
  // dashed projection visually meet the solid history line.
  const chartData = useMemo(() => {
    if (!forecasts.length) return [];
    const byDate = new Map();
    const get = (date) => {
      if (!byDate.has(date)) byDate.set(date, { date });
      return byDate.get(date);
    };
    for (const s of forecasts) {
      for (const point of s.history) {
        get(point.date)[s.name] = point.balance;
      }
      for (const point of s.projection) {
        get(point.date)[s.name + PROJ_SUFFIX] = point.balance;
      }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [forecasts]);

  if (errorBody) {
    return (
      <div className="es">
        <div className="es__page-header">Educational Savings</div>
        <Card>
          <div className="es__error">
            {errorBody.error || `Failed to load (status ${errorBody.status}).`}
          </div>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="es">
        <div className="es__page-header">Educational Savings</div>
        <div className="es__loading">Loading…</div>
      </div>
    );
  }

  const visible = selected === ALL ? forecasts : forecasts.filter(s => s.name === selected);

  return (
    <div className="es">
      <div className="es__page-header">Educational Savings</div>

      <Card>
        <div className="es__forecast-control">
          <label className="es__forecast-label" htmlFor="es-rate">
            Forecasted annual return
          </label>
          <div className="es__forecast-input-wrap">
            <input
              id="es-rate"
              className="es__forecast-input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="20"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
            />
            <span className="es__forecast-suffix">%</span>
          </div>
        </div>
      </Card>

      <Card>
        <table className="es__table">
          <thead>
            <tr>
              <th>Student</th>
              <th className="es__num">Current Balance</th>
              <th className="es__num">Monthly Contribution</th>
              <th>Adjust Monthly</th>
              <th>College Start Date</th>
              <th className="es__num">Annual Tuition</th>
              <th className="es__num">Remaining Tuition</th>
              <th className="es__num">Projected at Start</th>
              <th className="es__num">Projected at Graduation</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map(s => {
              const tone = s.end_balance == null ? '' : s.end_balance >= 0 ? 'es__pos' : 'es__neg';
              const delta = contribDelta[s.name] || 0;
              const baseMonthly = (s.monthly_contribution || 0) - delta;
              const deltaTone = delta > 0 ? 'es__pos' : delta < 0 ? 'es__neg' : '';
              return (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="es__num">{fmtUSD(s.current_balance)}</td>
                  <td className="es__num">{fmtUSD(baseMonthly)}</td>
                  <td>
                    <div className="es__slider-cell">
                      <input
                        type="range"
                        className="es__slider"
                        min="-500"
                        max="500"
                        step="25"
                        value={delta}
                        onChange={(e) => setContribDelta(prev => ({
                          ...prev,
                          [s.name]: Number(e.target.value),
                        }))}
                      />
                      <span className={`es__slider-val ${deltaTone}`}>
                        {fmtUSDSigned(delta)}
                      </span>
                    </div>
                  </td>
                  <td>{fmtDate(s.college_start_date)}</td>
                  <td className="es__num">{fmtUSD(s.estimated_tuition)}</td>
                  <td className="es__num">{fmtUSD(s.remaining_tuition)}</td>
                  <td className="es__num">{fmtUSD(s.projected_at_start)}</td>
                  <td className={`es__num ${tone}`}>{fmtUSDSigned(s.end_balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="es__chart-header">
          <div className="es__section-title">Balance over time</div>
          <div className="es__toggle">
            <button
              className={`es__toggle-btn ${selected === ALL ? 'is-active' : ''}`}
              onClick={() => setSelected(ALL)}
            >All</button>
            {forecasts.map(s => (
              <button
                key={s.name}
                className={`es__toggle-btn ${selected === s.name ? 'is-active' : ''}`}
                onClick={() => setSelected(s.name)}
              >{s.name}</button>
            ))}
          </div>
        </div>

        <div className="es__chart-wrapper">
          <ResponsiveContainer width="100%" height={420}>
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
                width={80}
              />
              <Tooltip
                contentStyle={{ background: 'var(--card-hi)', border: '1px solid var(--rule-3)', fontSize: 12 }}
                labelStyle={{ color: 'var(--ink-2)' }}
                formatter={(v, name) => [fmtUSD(v), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {visible.flatMap((s) => {
                const idx = forecasts.findIndex(x => x.name === s.name);
                const color = SERIES_COLORS[idx % SERIES_COLORS.length];
                return [
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    name={s.name}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />,
                  <Line
                    key={s.name + PROJ_SUFFIX}
                    type="monotone"
                    dataKey={s.name + PROJ_SUFFIX}
                    name={`${s.name} (projected)`}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                    legendType="none"
                  />,
                ];
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
