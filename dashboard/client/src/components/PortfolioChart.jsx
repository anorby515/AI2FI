import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { formatCurrency, gainLoss, gainLossPct, calcLotsIRR, calcClosedLotsIRR, calcBenchmarkIRR, ds, dc, lotProceeds } from '../utils/calculations';
import { benchmarkPriceOnDate } from '../hooks/usePortfolio';

const PCT_MODES = [
  { key: 'gainPct', label: 'Gain %', color: '#34c78a' },
  { key: 'cagr', label: 'CAGR', color: '#f9a84f' },
  { key: 'alpha', label: 'Alpha', color: '#f94f6a' },
];

export default function PortfolioChart({ positions, quotes, spyLookup, view }) {
  const [pctMode, setPctMode] = useState('cagr');
  const today = new Date().toISOString().slice(0, 10);

  const chartData = useMemo(() => {
    if (!positions || positions.length === 0) return [];

    return positions.map(p => {
      const q = quotes[p.symbol];
      const price = q?.price ?? null;
      const isOpen = view !== 'Closed';

      let totalCost, gl, glPct, cagr, alpha;

      const benchmarkFn = spyLookup ? (d) => benchmarkPriceOnDate(spyLookup, d) : null;

      if (isOpen) {
        totalCost = p.totalCost;
        const value = price != null ? p.totalShares * price : null;
        gl = value != null ? gainLoss(totalCost, value) : null;
        glPct = value != null ? gainLossPct(totalCost, value) : null;
        cagr = price != null && p.lots ? calcLotsIRR(p.lots, price, today) : null;
        const spyCagr = benchmarkFn && p.lots ? calcBenchmarkIRR(p.lots, benchmarkFn, today) : null;
        alpha = (cagr != null && spyCagr != null) ? cagr - spyCagr : null;
      } else {
        // Use only closed lots — not the full position which mixes open + closed
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
    })
    .filter(d => d != null && d[pctMode] != null)
    .sort((a, b) => (b[pctMode] ?? -Infinity) - (a[pctMode] ?? -Infinity));
  }, [positions, quotes, spyLookup, view, today, pctMode]);

  if (chartData.length === 0) return null;

  const activeMode = PCT_MODES.find(m => m.key === pctMode);

  return (
    <div className="portfolio-chart-wrapper">
      <div className="chart-mode-toggle">
        {PCT_MODES.map(m => (
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
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 12, bottom: 60 }}>
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
            content={({ active, payload, label }) => {
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
                  <div style={{ color: d.cagr >= 0 ? '#34c78a' : '#f94f6a' }}>
                    CAGR: <strong>{d.cagr != null ? d.cagr.toFixed(2) + '%' : '—'}</strong>
                  </div>
                  <div style={{ color: d.alpha >= 0 ? '#34c78a' : '#f94f6a' }}>
                    Alpha: <strong>{d.alpha != null ? (d.alpha >= 0 ? '+' : '') + d.alpha.toFixed(2) + '%' : '—'}</strong>
                  </div>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />

          <Bar yAxisId="dollar" dataKey="costBasis" name="Cost Basis" fill="#34c78a" opacity={0.7} stackId="value" />
          <Bar yAxisId="dollar" dataKey="gains" name="Gains $" fill="#4f9cf9" opacity={0.7} stackId="value" />

          <Line
            yAxisId="pct"
            dataKey={activeMode.key}
            name={activeMode.label}
            stroke={activeMode.color}
            strokeWidth={2}
            dot={{ fill: activeMode.color, r: 3 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
