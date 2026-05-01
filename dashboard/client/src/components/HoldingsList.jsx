import { useState, useMemo } from 'react';
import { formatCurrency, formatPct, formatShares, gainLoss, gainLossPct, calcLotsIRR, calcBenchmarkIRR } from '../utils/calculations';
import { benchmarkPriceOnDate } from '../hooks/usePortfolio';

export default function HoldingsList({ positions, quotes, selectedAccounts, onSelectPosition, spyLookup }) {
  const [sortBy, setSortBy] = useState('value');
  const [sortDir, setSortDir] = useState('desc');
  const today = new Date().toISOString().slice(0, 10);

  const allSelected = selectedAccounts.size === 0;
  const filtered = allSelected
    ? positions
    : positions.filter(p => p.accounts.some(a => selectedAccounts.has(a)));

  const enriched = useMemo(() => filtered.map(p => {
    const q = quotes[p.symbol];
    const price = q?.price ?? null;
    const value = price != null ? p.totalShares * price : null;
    const gl = value != null ? gainLoss(p.totalCost, value) : null;
    const glPct = value != null ? gainLossPct(p.totalCost, value) : null;

    // IRR for multi-lot positions (money-weighted return)
    const cagr = price != null ? calcLotsIRR(p.lots, price, today) : null;

    // S&P benchmark IRR
    const benchmarkFn = spyLookup ? (d) => benchmarkPriceOnDate(spyLookup, d) : null;
    const spyCagr = benchmarkFn ? calcBenchmarkIRR(p.lots, benchmarkFn, today) : null;
    const alpha = (cagr != null && spyCagr != null) ? cagr - spyCagr : null;

    return { ...p, price, value, gl, glPct, cagr, spyCagr, alpha };
  }), [filtered, quotes, spyLookup, today]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  const sorted = [...enriched].sort((a, b) => {
    let av = a[sortBy] ?? -Infinity;
    let bv = b[sortBy] ?? -Infinity;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function ColHeader({ col, label }) {
    const active = sortBy === col;
    return (
      <th onClick={() => toggleSort(col)} className={`sortable ${active ? 'sorted' : ''}`}>
        {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
      </th>
    );
  }

  return (
    <div className="holdings-list">
      <table>
        <thead>
          <tr>
            <ColHeader col="symbol" label="Symbol" />
            <ColHeader col="description" label="Description" />
            <ColHeader col="price" label="Last Price" />
            <ColHeader col="totalShares" label="Shares" />
            <ColHeader col="gl" label="G/L $" />
            <ColHeader col="glPct" label="G/L %" />
            <ColHeader col="cagr" label="CAGR" />
            <ColHeader col="alpha" label="Alpha" />
            <ColHeader col="avgCostBasis" label="Avg Cost/Share" />
            <ColHeader col="totalCost" label="Cost Basis Total" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            const isPos = p.gl != null && p.gl >= 0;
            const cagrPos = p.cagr != null && p.cagr >= 0;
            const alphaPos = p.alpha != null && p.alpha >= 0;
            return (
              <tr key={p.symbol} className="clickable" onClick={() => onSelectPosition(p.symbol)}>
                <td className="symbol">{p.symbol}</td>
                <td className="desc">{p.description}</td>
                <td>{p.price != null ? formatCurrency(p.price) : '—'}</td>
                <td>{formatShares(p.totalShares)}</td>
                <td className={p.gl != null ? (isPos ? 'positive' : 'negative') : ''}>
                  {p.gl != null ? formatCurrency(p.gl) : '—'}
                </td>
                <td className={p.gl != null ? (isPos ? 'positive' : 'negative') : ''}>
                  {p.glPct != null ? formatPct(p.glPct) : '—'}
                </td>
                <td className={p.cagr != null ? (cagrPos ? 'positive' : 'negative') : ''}>
                  {p.cagr != null ? formatPct(p.cagr) : '—'}
                </td>
                <td className={p.alpha != null ? (alphaPos ? 'positive' : 'negative') : ''}>
                  {p.alpha != null ? (p.alpha >= 0 ? '+' : '') + formatPct(p.alpha) : '—'}
                </td>
                <td>{formatCurrency(p.avgCostBasis)}</td>
                <td>{formatCurrency(p.totalCost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
