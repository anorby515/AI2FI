import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card } from '../ui';
import './EducationSavingsView.css';

const ALL = '__all__';

// Series colors keyed off design tokens. Recharts forwards `stroke` to the
// underlying SVG attribute, which accepts `var(...)` references.
const SERIES_COLORS = ['var(--accent)', 'var(--accent-2)', 'var(--warn)', 'var(--pos)', 'var(--neg)'];

function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function EducationSavingsView() {
  const [data, setData] = useState(null);
  const [errorBody, setErrorBody] = useState(null);
  const [selected, setSelected] = useState(ALL);

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

  // Pivot per-student histories into a single { date, [studentName]: balance }
  // row set so Recharts can render multiple lines on a shared x-axis.
  const chartData = useMemo(() => {
    if (!data?.students?.length) return [];
    const byDate = new Map();
    for (const s of data.students) {
      for (const point of s.history) {
        if (!byDate.has(point.date)) byDate.set(point.date, { date: point.date });
        byDate.get(point.date)[s.name] = point.balance;
      }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

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

  const students = data.students || [];
  const visibleStudents = selected === ALL ? students : students.filter(s => s.name === selected);

  return (
    <div className="es">
      <div className="es__page-header">Educational Savings</div>

      <Card>
        <table className="es__table">
          <thead>
            <tr>
              <th>Student</th>
              <th className="es__num">Balance</th>
              <th className="es__num">Monthly Contribution</th>
              <th>College Start Date</th>
              <th className="es__num">Estimated Tuition</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td className="es__num">{fmtUSD(s.current_balance)}</td>
                <td className="es__num">{fmtUSD(s.monthly_contribution)}</td>
                <td>{fmtDate(s.college_start_date)}</td>
                <td className="es__num">{fmtUSD(s.estimated_tuition)}</td>
              </tr>
            ))}
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
            {students.map(s => (
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
              {visibleStudents.map((s, i) => {
                const color = SERIES_COLORS[students.findIndex(x => x.name === s.name) % SERIES_COLORS.length];
                return (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    name={s.name}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
