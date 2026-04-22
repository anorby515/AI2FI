import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Brush,
} from 'recharts';

const INTERVALS = ['Monthly', 'Quarterly', 'Annual'];
const RANGES = ['6M', 'YTD', '1Y', '2Y', '3Y', 'All'];

function fmtFull(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}
function fmt(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}
function fmtPct(val) { return val == null ? '—' : (val >= 0 ? '+' : '') + (val * 100).toFixed(2) + '%'; }
function fmtDelta(val) { return val == null ? '—' : (val >= 0 ? '+' : '') + fmtFull(val); }

export default function CollegeView() {
  const [data, setData] = useState([]);
  const [interval, setInterval] = useState('Monthly');
  const [range, setRange] = useState('All');

  useEffect(() => {
    fetch('/api/networth')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setData(d); })
      .catch(() => {});
  }, []);

  const rangeFiltered = useMemo(() => {
    if (!data.length || range === 'All') return data;
    const now = new Date();
    let start;
    switch (range) {
      case '6M': start = new Date(now.getFullYear(), now.getMonth() - 6, 1); break;
      case 'YTD': start = new Date(now.getFullYear(), 0, 1); break;
      case '1Y': start = new Date(now.getFullYear() - 1, now.getMonth(), 1); break;
      case '2Y': start = new Date(now.getFullYear() - 2, now.getMonth(), 1); break;
      case '3Y': start = new Date(now.getFullYear() - 3, now.getMonth(), 1); break;
      default: return data;
    }
    return data.filter(d => d.date >= start.toISOString().slice(0, 10));
  }, [data, range]);

  const filtered = useMemo(() => {
    if (interval === 'Monthly') return rangeFiltered;
    return rangeFiltered.filter(d => {
      const month = parseInt(d.date.slice(5, 7));
      if (interval === 'Quarterly') return [1, 4, 7, 10].includes(month);
      if (interval === 'Annual') return month === 1;
      return true;
    });
  }, [rangeFiltered, interval]);

  const chartData = useMemo(() => filtered.map(d => ({ ...d, label: d.date.slice(0, 7) })), [filtered]);

  const current = data.length > 0 ? data[data.length - 1] : null;
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const yoy = data.length > 12 ? data[data.length - 13] : null;

  const momChange = current && prev ? current.education - prev.education : null;
  const momPct = current && prev && prev.education ? momChange / prev.education : null;
  const yoyChange = current && yoy ? current.education - yoy.education : null;
  const yoyPct = current && yoy && yoy.education ? yoyChange / yoy.education : null;

  if (!data.length) return <div className="loading">Loading college savings data...</div>;

  return (
    <div className="networth-view">
      <div className="nw-scoreboard">
        <div className="nw-card nw-card-hero">
          <div className="nw-card-label">College Fund</div>
          <div className="nw-card-value">{fmtFull(current?.education)}</div>
        </div>
        <div className="nw-card">
          <div className="nw-card-label">MoM Change</div>
          <div className={`nw-card-value ${momChange >= 0 ? 'positive' : 'negative'}`}>{fmtDelta(momChange)}</div>
          <div className={`nw-card-sub ${momPct >= 0 ? 'positive' : 'negative'}`}>{fmtPct(momPct)}</div>
        </div>
        <div className="nw-card">
          <div className="nw-card-label">YoY Change</div>
          <div className={`nw-card-value ${yoyChange >= 0 ? 'positive' : 'negative'}`}>{fmtDelta(yoyChange)}</div>
          <div className={`nw-card-sub ${yoyPct >= 0 ? 'positive' : 'negative'}`}>{fmtPct(yoyPct)}</div>
        </div>
      </div>

      <div className="nw-controls">
        <div className="filter-group">
          {INTERVALS.map(i => (
            <button key={i} className={`tab ${interval === i ? 'active' : ''}`} onClick={() => setInterval(i)}>{i}</button>
          ))}
        </div>
        <div className="filter-group">
          {RANGES.map(r => (
            <button key={r} className={`tab ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>

      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={500}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6a6a8a' }} minTickGap={40} />
            <YAxis tick={{ fontSize: 10, fill: '#6a6a8a' }} tickFormatter={v => fmt(v)} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #333', fontSize: 12 }}
              formatter={(v, name) => [fmtFull(v), name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="education" name="College Fund" fill="#ce93d8" opacity={0.8} />
            <Line type="monotone" dataKey="education" name="Trend" stroke="#d463e9" strokeWidth={2} dot={false} />
            <Brush dataKey="label" height={30} stroke="#ce93d8" fill="#12122a" travellerWidth={10} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
