import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card } from '../ui';
import './EducationSavingsView.css';

const ALL = '__all__';
const DEFAULT_RATE_PCT = 6;
const PROJ_SUFFIX = '__proj';

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

// Project a single student's balance monthly from the seam (last actual point)
// up to their college start date. Returns [] if the start date is on/before
// the seam, or if we don't have a current balance to project from.
function projectBalances(student, annualRatePct) {
  if (!student.history?.length) return [];
  if (!student.college_start_date) return [];
  const seamDate = student.history[student.history.length - 1].date;
  const seamBal = student.current_balance;
  if (seamBal == null) return [];
  const nMonths = monthsBetween(seamDate, student.college_start_date);
  if (nMonths <= 0) return [];
  const r = (annualRatePct / 100) / 12;
  const monthly = student.monthly_contribution || 0;
  const out = [{ date: seamDate, balance: seamBal }];
  let bal = seamBal;
  for (let i = 1; i <= nMonths; i++) {
    bal = bal * (1 + r) + monthly;
    out.push({ date: addMonthsISO(seamDate, i), balance: bal });
  }
  return out;
}

export default function EducationSavingsView() {
  const [data, setData] = useState(null);
  const [errorBody, setErrorBody] = useState(null);
  const [selected, setSelected] = useState(ALL);
  const [rateInput, setRateInput] = useState(String(DEFAULT_RATE_PCT));

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

  // Project per-student forecasts and surface a per-student summary used by
  // both the table (Projected at Start / Gap) and the chart (dashed lines).
  const forecasts = useMemo(() => {
    if (!data?.students?.length) return [];
    return data.students.map(s => {
      const projection = projectBalances(s, ratePctSafe);
      const projectedAtStart = projection.length
        ? projection[projection.length - 1].balance
        : s.current_balance;
      const remaining = s.remaining_tuition;
      const gap = (projectedAtStart != null && remaining != null)
        ? projectedAtStart - remaining
        : null;
      return { ...s, projection, projected_at_start: projectedAtStart, gap };
    });
  }, [data, ratePctSafe]);

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
              <th>College Start Date</th>
              <th className="es__num">Annual Tuition</th>
              <th className="es__num">Remaining Tuition</th>
              <th className="es__num">Projected at Start</th>
              <th className="es__num">Gap</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map(s => {
              const tone = s.gap == null ? '' : s.gap >= 0 ? 'es__pos' : 'es__neg';
              return (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="es__num">{fmtUSD(s.current_balance)}</td>
                  <td className="es__num">{fmtUSD(s.monthly_contribution)}</td>
                  <td>{fmtDate(s.college_start_date)}</td>
                  <td className="es__num">{fmtUSD(s.estimated_tuition)}</td>
                  <td className="es__num">{fmtUSD(s.remaining_tuition)}</td>
                  <td className="es__num">{fmtUSD(s.projected_at_start)}</td>
                  <td className={`es__num ${tone}`}>{fmtUSDSigned(s.gap)}</td>
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
