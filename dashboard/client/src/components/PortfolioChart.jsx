import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { formatCurrency, gainLoss, gainLossPct, calcLotsIRR, calcClosedLotsIRR, calcBenchmarkIRR, ds, dc, lotProceeds } from '../utils/calculations';
import { benchmarkPriceOnDate } from '../hooks/usePortfolio';

// Resolve design-system tokens at runtime so the chart picks up theme changes
// without baking hex values into JSX (per dashboard CLAUDE.md design rules).
function readTokens() {
  if (typeof window === 'undefined') {
    return { pos: '#34d399', neg: '#fb7185', ink: '#f1f3fb' };
  }
  const cs = getComputedStyle(document.documentElement);
  return {
    pos: cs.getPropertyValue('--pos').trim() || '#34d399',
    neg: cs.getPropertyValue('--neg').trim() || '#fb7185',
    ink: cs.getPropertyValue('--ink').trim() || '#f1f3fb',
  };
}

const PCT_MODES = [
  { key: 'gainPct', label: 'Gain %', color: '#34c78a' },
  { key: 'cagr', label: 'CAGR', color: '#f9a84f' },
  { key: 'alpha', label: 'Alpha', color: '#f94f6a' },
];

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function earliestAcquired(p) {
  const lots = p.lots || p.allLots || [];
  let min = null;
  for (const l of lots) {
    if (!l.dateAcquired) continue;
    if (min == null || l.dateAcquired < min) min = l.dateAcquired;
  }
  return min;
}

function buildChartData(positions, quotes, spyLookup, isOpen, today) {
  if (!positions || positions.length === 0) return [];
  const benchmarkFn = spyLookup ? (d) => benchmarkPriceOnDate(spyLookup, d) : null;

  return positions.map(p => {
    const q = quotes[p.symbol];
    const price = q?.price ?? null;

    let totalCost, gl, glPct, cagr, alpha;

    if (isOpen) {
      totalCost = p.totalCost;
      const value = price != null ? p.totalShares * price : null;
      gl = value != null ? gainLoss(totalCost, value) : null;
      glPct = value != null ? gainLossPct(totalCost, value) : null;
      cagr = price != null && p.lots ? calcLotsIRR(p.lots, price, today) : null;
      const spyCagr = benchmarkFn && p.lots ? calcBenchmarkIRR(p.lots, benchmarkFn, today) : null;
      alpha = (cagr != null && spyCagr != null) ? cagr - spyCagr : null;
    } else {
      const closedLots = p.allLots?.filter(l => l.transaction !== 'Open') || p.closedLots || p.lots || [];
      if (closedLots.length === 0) return null;
      totalCost = closedLots.reduce((s, l) => s + ds(l) * dc(l), 0);
      const totalReturn = closedLots.reduce((s, l) => s + lotProceeds(l), 0);
      gl = totalReturn - totalCost;
      glPct = gainLossPct(totalCost, totalReturn);
      cagr = calcClosedLotsIRR(closedLots);
      const spyCagr = benchmarkFn ? calcBenchmarkIRR(closedLots, benchmarkFn, today) : null;
      alpha = (cagr != null && spyCagr != null) ? cagr - spyCagr : null;
    }

    return {
      symbol: p.symbol,
      costBasis: totalCost,
      gains: gl,
      gainPct: glPct != null ? glPct * 100 : null,
      cagr: cagr != null ? cagr * 100 : null,
      alpha: alpha != null ? alpha * 100 : null,
    };
  }).filter(d => d != null);
}

function ChartSection({ title, data, modes, defaultMode }) {
  const [pctMode, setPctMode] = useState(defaultMode);
  const activeMode = modes.find(m => m.key === pctMode) || modes[0];
  const tokens = readTokens();

  const sorted = useMemo(() => (
    [...data]
      .filter(d => d[activeMode.key] != null)
      .sort((a, b) => (b[activeMode.key] ?? -Infinity) - (a[activeMode.key] ?? -Infinity))
  ), [data, activeMode.key]);

  if (sorted.length === 0) return null;

  // Color each dot by sign so positive returns read green and negative red.
  const renderSignedDot = (props) => {
    const { cx, cy, payload } = props;
    const v = payload?.[activeMode.key];
    if (v == null || cx == null || cy == null) return null;
    const fill = v >= 0 ? tokens.pos : tokens.neg;
    return <circle cx={cx} cy={cy} r={3.5} fill={fill} stroke={fill} />;
  };

  return (
    <div className="portfolio-chart-wrapper">
      {title && <div className="chart-section-title">{title}</div>}
      <div className="chart-mode-toggle">
        {modes.map(m => (
          <button
            key={m.key}
            className={`tab ${pctMode === m.key ? 'active' : ''}`}
            style={pctMode === m.key ? { borderColor: m.color, color: m.color } : {}}
            onClick={() => setPctMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={sorted} margin={{ top: 8, right: 12, left: 12, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis
            dataKey="symbol"
            tick={{ fontSize: 10, fill: '#6a6a8a' }}
            angle={-45}
            textAnchor="end"
            interval={0}
            height={60}
          />
          <YAxis
            yAxisId="pct"
            orientation="left"
            tick={{ fontSize: 10, fill: '#6a6a8a' }}
            tickFormatter={v => `${v.toFixed(0)}%`}
            domain={['auto', 'auto']}
          />
          <YAxis
            yAxisId="dollar"
            orientation="right"
            tick={{ fontSize: 10, fill: '#6a6a8a' }}
            tickFormatter={v => {
              const abs = Math.abs(v);
              if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
              if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
              return `$${v.toFixed(0)}`;
            }}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #444', fontSize: 12, padding: '10px 14px', borderRadius: 6 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              if (!d) return null;
              return (
                <div style={{ background: '#1a1a2e', border: '1px solid #444', padding: '10px 14px', borderRadius: 6, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#4f9cf9', marginBottom: 6 }}>{d.symbol}</div>
                  <div>Cost Basis: <strong>{formatCurrency(d.costBasis)}</strong></div>
                  <div style={{ color: d.gains >= 0 ? '#34c78a' : '#f94f6a' }}>
                    G/L $: <strong>{formatCurrency(d.gains)}</strong>
                  </div>
                  <div style={{ color: d.gainPct >= 0 ? '#34c78a' : '#f94f6a' }}>
                    G/L %: <strong>{d.gainPct != null ? d.gainPct.toFixed(2) + '%' : '—'}</strong>
                  </div>
                  {modes.some(m => m.key === 'cagr') && (
                    <div style={{ color: d.cagr >= 0 ? '#34c78a' : '#f94f6a' }}>
                      CAGR: <strong>{d.cagr != null ? d.cagr.toFixed(2) + '%' : '—'}</strong>
                    </div>
                  )}
                  {modes.some(m => m.key === 'alpha') && (
                    <div style={{ color: d.alpha >= 0 ? '#34c78a' : '#f94f6a' }}>
                      Alpha: <strong>{d.alpha != null ? (d.alpha >= 0 ? '+' : '') + d.alpha.toFixed(2) + '%' : '—'}</strong>
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />

          <Bar yAxisId="dollar" dataKey="costBasis" name="Cost Basis" fill="#34c78a" opacity={0.7} stackId="value" />
          <Bar yAxisId="dollar" dataKey="gains" name="Gains $" fill="#4f9cf9" opacity={0.7} stackId="value" />

          <ReferenceLine
            yAxisId="pct"
            y={0}
            stroke={tokens.ink}
            strokeWidth={2}
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
          />

          <Line
            yAxisId="pct"
            dataKey={activeMode.key}
            name={activeMode.label}
            stroke={activeMode.color}
            strokeWidth={2}
            dot={renderSignedDot}
            activeDot={renderSignedDot}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PortfolioChart({ positions, quotes, spyLookup, view }) {
  const today = new Date().toISOString().slice(0, 10);
  const isOpen = view !== 'Closed Positions';

  const { ltData, stData, fullData } = useMemo(() => {
    if (!isOpen) {
      return { ltData: [], stData: [], fullData: buildChartData(positions, quotes, spyLookup, false, today) };
    }
    const todayMs = new Date(today).getTime();
    const lt = [];
    const st = [];
    for (const p of positions || []) {
      const earliest = earliestAcquired(p);
      const ageMs = earliest ? todayMs - new Date(earliest).getTime() : 0;
      (ageMs >= ONE_YEAR_MS ? lt : st).push(p);
    }
    return {
      ltData: buildChartData(lt, quotes, spyLookup, true, today),
      stData: buildChartData(st, quotes, spyLookup, true, today),
      fullData: [],
    };
  }, [positions, quotes, spyLookup, isOpen, today]);

  if (!isOpen) {
    if (fullData.length === 0) return null;
    return <ChartSection data={fullData} modes={PCT_MODES} defaultMode="cagr" />;
  }

  if (ltData.length === 0 && stData.length === 0) return null;

  // Suppress section titles when only one group has data — keeps the UI quiet
  // for portfolios that are entirely long-term (or entirely short-term).
  const showTitles = ltData.length > 0 && stData.length > 0;
  const stModes = PCT_MODES.filter(m => m.key === 'gainPct');

  return (
    <>
      {ltData.length > 0 && (
        <ChartSection
          title={showTitles ? 'Long-term holdings (≥ 1 year)' : null}
          data={ltData}
          modes={PCT_MODES}
          defaultMode="cagr"
        />
      )}
      {stData.length > 0 && (
        <ChartSection
          title={showTitles ? 'Short-term holdings (< 1 year)' : null}
          data={stData}
          modes={stModes}
          defaultMode="gainPct"
        />
      )}
    </>
  );
}
