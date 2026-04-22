import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency, formatPct, ds, dc, taxTerm } from '../utils/calculations';

const COLORS = [
  '#4f9cf9', '#34c78a', '#f9a84f', '#f94f6a', '#7b5cf9',
  '#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8',
  '#4dd0e1', '#aed581', '#ffd54f', '#ff8a65', '#9575cd',
  '#26c6da', '#c5e1a5', '#fff176', '#ffab91', '#ce93d8',
];

function renderLabel({ name, value, percent }) {
  if (percent < 0.02) return null;
  return `${name}, ${formatCurrency(value)}, ${(percent * 100).toFixed(0)}%`;
}

export default function PortfolioPies({ positions, quotes }) {
  const [expanded, setExpanded] = useState(null); // null | 'value' | 'term'
  const today = new Date().toISOString().slice(0, 10);

  // Pie 1: Current value by ticker
  const valueData = useMemo(() => {
    return positions
      .map(p => {
        const q = quotes[p.symbol];
        const price = q?.price ?? null;
        const value = price != null ? p.totalShares * price : 0;
        return { name: p.symbol, value };
      })
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [positions, quotes]);

  // Pie 2: Long-term vs Short-term by current value
  const termData = useMemo(() => {
    let longVal = 0;
    let shortVal = 0;
    for (const p of positions) {
      const q = quotes[p.symbol];
      const price = q?.price ?? null;
      if (price == null) continue;
      for (const lot of (p.lots || [])) {
        const shares = ds(lot);
        const lotValue = shares * price;
        const term = taxTerm(lot.dateAcquired, today);
        if (term === 'long') longVal += lotValue;
        else shortVal += lotValue;
      }
    }
    const data = [];
    if (longVal > 0) data.push({ name: 'Long Term', value: longVal });
    if (shortVal > 0) data.push({ name: 'Short Term', value: shortVal });
    return data;
  }, [positions, quotes, today]);

  const TERM_COLORS = ['#4f9cf9', '#7baaf7'];

  function PieCard({ id, title, data, colors, size }) {
    const isExpanded = expanded === id;
    const h = isExpanded ? 500 : size;
    const outerRadius = isExpanded ? 200 : Math.min(size / 2 - 20, 140);

    return (
      <div
        className={`pie-card ${isExpanded ? 'pie-expanded' : ''}`}
        onClick={() => setExpanded(isExpanded ? null : id)}
      >
        <div className="pie-title">{title}</div>
        <ResponsiveContainer width="100%" height={h}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={outerRadius}
              label={isExpanded ? renderLabel : false}
              labelLine={isExpanded}
              strokeWidth={1}
              stroke="#0d0d1a"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #444', fontSize: 13, padding: '8px 12px', borderRadius: 6 }}
              itemStyle={{ color: '#c8c8e8' }}
              formatter={(v, name) => [formatCurrency(v), name]}
            />
            {!isExpanded && <Legend wrapperStyle={{ fontSize: 10 }} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (valueData.length === 0) return null;

  // If one is expanded, show only that one full width
  if (expanded) {
    return (
      <div className="portfolio-pies expanded-mode">
        {expanded === 'value' && <PieCard id="value" title="Allocation by Ticker" data={valueData} colors={COLORS} size={500} />}
        {expanded === 'term' && <PieCard id="term" title="Long Term vs Short Term" data={termData} colors={TERM_COLORS} size={500} />}
      </div>
    );
  }

  return (
    <div className="portfolio-pies">
      <PieCard id="value" title="Allocation by Ticker" data={valueData} colors={COLORS} size={280} />
      <PieCard id="term" title="Long Term vs Short Term" data={termData} colors={TERM_COLORS} size={280} />
    </div>
  );
}
