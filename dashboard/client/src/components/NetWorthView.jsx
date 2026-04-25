import { useState, useEffect, useMemo } from 'react';
import { Card, Stat, Segment, Chart, ProgressBar } from '../ui';
import './NetWorthView.css';

/**
 * NetWorthView — Bento-ported reference screen.
 *
 * Same data contract as before (fetches /api/networth which returns
 * [{ date, net_worth, debt, cash_savings_cd, brokerage, rsus, retirement,
 *    assets, education, debt_ratio }]). Renders with the new primitives.
 */

const RANGE_OPTIONS = [
  { label: '6M', value: '6M' },
  { label: 'YTD', value: 'YTD' },
  { label: '1Y', value: '1Y' },
  { label: '2Y', value: '2Y' },
  { label: '3Y', value: '3Y' },
  { label: 'All', value: 'All' },
];

const COMPOSITION_KEYS = [
  { key: 'brokerage',       label: 'Brokerage',   color: 'var(--accent)' },
  { key: 'retirement',      label: 'Retirement',  color: 'var(--accent-2)' },
  { key: 'rsus',            label: 'RSUs',        color: '#f472b6' },
  { key: 'cash_savings_cd', label: 'Cash',        color: '#fbbf24' },
  { key: 'assets',          label: 'Other assets',color: '#9ba4cc' },
  { key: 'education',       label: 'Education',   color: '#a78bfa' },
];

function fmtUSD(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function fmtUSDK(v) {
  if (v == null) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1_000_000) return s + '$' + (a / 1_000_000).toFixed(2) + 'M';
  if (a >= 1_000) return s + '$' + Math.round(a / 1000) + 'k';
  return s + '$' + Math.round(a);
}

function fmtPct(v) {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '−') + (Math.abs(v) * 100).toFixed(2) + '%';
}

export default function NetWorthView() {
  const [data, setData] = useState([]);
  const [range, setRange] = useState('1Y');

  useEffect(() => {
    fetch('/api/networth')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setData(d); })
      .catch(() => {});
  }, []);

  // Range filter
  const rangeFiltered = useMemo(() => {
    if (!data.length || range === 'All') return data;
    const now = new Date();
    let start;
    switch (range) {
      case '6M':  start = new Date(now.getFullYear(), now.getMonth() - 6, 1); break;
      case 'YTD': start = new Date(now.getFullYear(), 0, 1); break;
      case '1Y':  start = new Date(now.getFullYear() - 1, now.getMonth(), 1); break;
      case '2Y':  start = new Date(now.getFullYear() - 2, now.getMonth(), 1); break;
      case '3Y':  start = new Date(now.getFullYear() - 3, now.getMonth(), 1); break;
      default:    return data;
    }
    const s = start.toISOString().slice(0, 10);
    return data.filter(d => d.date >= s);
  }, [data, range]);

  const series = useMemo(() => rangeFiltered.map(d => d.net_worth), [rangeFiltered]);
  const dates = useMemo(() => rangeFiltered.map(d => d.date), [rangeFiltered]);

  // Scoreboard calcs (use ALL data, not range-filtered, for MoM/YoY)
  const current = data.length ? data[data.length - 1] : null;
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const yoy = data.length > 12 ? data[data.length - 13] : null;

  const momChange = current && prev ? current.net_worth - prev.net_worth : null;
  const yoyChange = current && yoy ? current.net_worth - yoy.net_worth : null;
  const yoyPct = current && yoy && yoy.net_worth ? yoyChange / yoy.net_worth : null;

  // Composition from current row
  const composition = useMemo(() => {
    if (!current) return [];
    const total = COMPOSITION_KEYS.reduce((s, k) => s + Math.max(0, current[k.key] || 0), 0);
    return COMPOSITION_KEYS.map(k => {
      const v = Math.max(0, current[k.key] || 0);
      return { ...k, v, p: total > 0 ? (v / total) * 100 : 0 };
    }).filter(r => r.v > 0);
  }, [current]);

  if (!data.length) return <div className="nw__loading">Loading net worth data…</div>;

  return (
    <div className="nw">
      <div className="nw__head">
        <div>
          <div className="nw__title">Net Worth</div>
          <div className="nw__subtitle">{current?.date}</div>
        </div>
        <Segment options={RANGE_OPTIONS} value={range} onChange={setRange} mono />
      </div>

      <Card variant="grad" className="nw__hero">
        <Stat label="Total net worth" value={fmtUSD(current?.net_worth)} size="lg" />
        <div className="nw__hero-stats">
          {yoyChange != null && (
            <span className={yoyChange >= 0 ? 'nw__delta-pos' : 'nw__delta-neg'}>
              {yoyChange >= 0 ? '↑' : '↓'} {fmtUSDK(Math.abs(yoyChange))} ({fmtPct(yoyPct)})
              <span className="nw__delta-label">YoY</span>
            </span>
          )}
          {momChange != null && (
            <span className={momChange >= 0 ? 'nw__delta-pos' : 'nw__delta-neg'}>
              {momChange >= 0 ? '↑' : '↓'} {fmtUSDK(Math.abs(momChange))}
              <span className="nw__delta-label">MoM</span>
            </span>
          )}
        </div>
        <div className="nw__hero-chart">
          <Chart
            data={series}
            height={280}
            labelFn={(i) => {
              const d = dates[i];
              if (!d) return '';
              return d.slice(0, 7);
            }}
            valueFn={(v) => fmtUSDK(v)}
          />
        </div>
      </Card>

      <div className="nw__grid-split">
        <Card>
          <div className="nw__composition-title">Composition · current month</div>
          {composition.map(c => (
            <div key={c.key} className="nw__composition-row">
              <div className="nw__composition-head">
                <span>{c.label}</span>
                <span>{fmtUSDK(c.v)} · {c.p.toFixed(0)}%</span>
              </div>
              <ProgressBar value={c.p} tone={c.color} />
            </div>
          ))}
        </Card>

        <div className="nw__side-grid">
          <Card><Stat label="Debt" value={fmtUSD(current?.debt)} tone="neg" /></Card>
          <Card>
            <Stat
              label="Debt ratio"
              value={current?.debt_ratio != null ? (current.debt_ratio * 100).toFixed(1) + '%' : '—'}
              sub={current?.debt_ratio > 0.3 ? 'Above 30% target' : 'Within target'}
              subTone={current?.debt_ratio > 0.3 ? 'neg' : 'pos'}
            />
          </Card>
          <Card><Stat label="Cash" value={fmtUSD(current?.cash_savings_cd)} /></Card>
          <Card><Stat label="Retirement" value={fmtUSD(current?.retirement)} /></Card>
        </div>
      </div>

      <div className="nw__grid-4">
        <Card><Stat label="Brokerage" value={fmtUSDK(current?.brokerage)} /></Card>
        <Card><Stat label="RSUs" value={fmtUSDK(current?.rsus)} /></Card>
        <Card><Stat label="Assets" value={fmtUSDK(current?.assets)} /></Card>
        <Card><Stat label="Education" value={fmtUSDK(current?.education)} /></Card>
      </div>
    </div>
  );
}
