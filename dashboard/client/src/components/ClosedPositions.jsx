import { useState, useMemo } from 'react';
import { formatCurrency, formatPct, formatShares, gainLossPct, calcCAGR, calcClosedLotsIRR, calcBenchmarkIRR, ds, dc, lotProceeds, estimatedTax, taxTerm, lifetimeDividends } from '../utils/calculations';
import { benchmarkPriceOnDate, useCurrentQuotes } from '../hooks/usePortfolio';

export default function ClosedPositions({ closedLots, selectedAccounts, spyLookup, onSelectPosition, taxRates, dividendEvents }) {
  const [sortBy, setSortBy] = useState('gl');
  const [sortDir, setSortDir] = useState('desc');
  const [showIfNotSold, setShowIfNotSold] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const allSelected = selectedAccounts.size === 0;
  const filtered = allSelected
    ? closedLots
    : closedLots.filter(l => selectedAccounts.has(l.account));

  // Unique symbols for closed positions
  const closedSymbols = useMemo(() => [...new Set(filtered.map(l => l.symbol))], [filtered]);

  const { quotes: currentQuotes, loading: quotesLoading, fetch: fetchCurrentQuotes } = useCurrentQuotes(closedSymbols);

  // Aggregate closed lots by symbol
  const positions = useMemo(() => {
    const map = {};
    for (const lot of filtered) {
      const sym = lot.symbol;
      if (!map[sym]) {
        map[sym] = {
          symbol: sym,
          description: lot.description,
          accounts: new Set(),
          totalShares: 0,
          totalCost: 0,
          totalProceeds: 0,
          lotCount: 0,
          earliestAcquired: lot.dateAcquired,
          latestSold: lot.dateSold,
          lots: [],
        };
      }
      const p = map[sym];
      p.accounts.add(lot.account);
      const shares = ds(lot);
      p.totalShares += shares;
      p.totalCost += shares * dc(lot);
      p.totalProceeds += lotProceeds(lot);
      p.lotCount++;
      p.lots.push(lot);
      if (lot.dateAcquired < p.earliestAcquired) p.earliestAcquired = lot.dateAcquired;
      if ((lot.dateSold || '') > (p.latestSold || '')) p.latestSold = lot.dateSold;
    }

    return Object.values(map).map(p => {
      const events = dividendEvents?.[p.symbol] || null;
      const divs = events ? lifetimeDividends(p.lots, events) : 0;
      const gl = p.totalProceeds - p.totalCost;
      const glPct = gainLossPct(p.totalCost, p.totalProceeds);
      const avgCost = p.totalShares > 0 ? p.totalCost / p.totalShares : 0;
      // Total-return CAGR — folds dividend cash flows into the IRR.
      const cagr = calcClosedLotsIRR(p.lots, events);

      // Total-return SPY benchmark via adjClose
      const benchmarkFn = spyLookup ? (d) => benchmarkPriceOnDate(spyLookup, d, 'adjClose') : null;
      const spyCagr = benchmarkFn ? calcBenchmarkIRR(p.lots, benchmarkFn, today) : null;
      const alpha = (cagr != null && spyCagr != null) ? cagr - spyCagr : null;

      // Estimated tax on realized gain
      const estTax = p.lots.reduce((sum, lot) => {
        const lotGain = lotProceeds(lot) - ds(lot) * dc(lot);
        if (lotGain <= 0) return sum;
        const term = taxTerm(lot.dateAcquired, lot.dateSold || today);
        const t = estimatedTax(lotGain, term, taxRates);
        return sum + (t || 0);
      }, 0) || null;

      // "If Not Sold" — using current price for closed ticker
      const currentQ = currentQuotes[p.symbol];
      const currentPrice = currentQ?.price ?? null;
      const hypValue = currentPrice != null ? p.totalShares * currentPrice : null;
      const hypGL = hypValue != null ? hypValue - p.totalCost : null;
      const hypGLPct = hypValue != null ? gainLossPct(p.totalCost, hypValue) : null;
      const hypCagr = hypValue != null ? calcCAGR(p.totalCost, hypValue, p.earliestAcquired, today) : null;
      const spyBuy = benchmarkPriceOnDate(spyLookup, p.earliestAcquired);
      const spyEndToday = benchmarkPriceOnDate(spyLookup, today);
      const spyCagrToday = (spyBuy && spyEndToday) ? calcCAGR(spyBuy, spyEndToday, p.earliestAcquired, today) : null;
      const cagrDelta = (hypCagr != null && cagr != null) ? hypCagr - cagr : null;
      const hypAlpha = (hypCagr != null && spyCagrToday != null) ? hypCagr - spyCagrToday : null;
      const moneyDelta = hypValue != null ? hypValue - p.totalProceeds : null; // + means left on table, - means good sell

      return {
        ...p,
        accounts: Array.from(p.accounts),
        avgCost,
        gl,
        glPct,
        cagr,
        alpha,
        divs,
        estTax,
        currentPrice,
        hypValue,
        hypGL,
        hypGLPct,
        hypCagr,
        cagrDelta,
        hypAlpha,
        moneyDelta,
      };
    });
  }, [filtered, spyLookup, currentQuotes, taxRates, today, dividendEvents]);

  // "If Not Sold" aggregate summary
  const ifNotSoldSummary = useMemo(() => {
    const withData = positions.filter(p => p.hypValue != null);
    if (!withData.length) return null;
    const totalProceeds = withData.reduce((s, p) => s + p.totalProceeds, 0);
    const totalHypValue = withData.reduce((s, p) => s + p.hypValue, 0);
    return { totalProceeds, totalHypValue, delta: totalHypValue - totalProceeds, count: withData.length };
  }, [positions]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  const sorted = [...positions].sort((a, b) => {
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

  const handleFetchPrices = () => {
    setShowIfNotSold(true);
    fetchCurrentQuotes();
  };

  return (
    <div className="closed-positions">
      <div className="closed-toolbar">
        <span className="closed-count">{positions.length} positions · {filtered.length} lots</span>
        <div className="closed-actions">
          {!showIfNotSold ? (
            <button className="if-not-sold-btn" onClick={handleFetchPrices}>
              Load "If Not Sold" Prices
            </button>
          ) : quotesLoading ? (
            <span className="loading-inline">Fetching current prices...</span>
          ) : (
            <>
              {ifNotSoldSummary && (
                <span className={`if-not-sold-summary ${ifNotSoldSummary.delta >= 0 ? 'negative' : 'positive'}`}>
                  {ifNotSoldSummary.delta >= 0
                    ? `Left on table: ${formatCurrency(ifNotSoldSummary.delta)} (${ifNotSoldSummary.count} pos)`
                    : `Good sells saved: ${formatCurrency(Math.abs(ifNotSoldSummary.delta))} (${ifNotSoldSummary.count} pos)`}
                </span>
              )}
              <button className="if-not-sold-btn active" onClick={fetchCurrentQuotes}>Refresh Prices</button>
            </>
          )}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <ColHeader col="symbol" label="Symbol" />
            <ColHeader col="description" label="Description" />
            <th>Accounts</th>
            <ColHeader col="totalShares" label="Shares" />
            <ColHeader col="avgCost" label="Cost/Share" />
            <ColHeader col="totalCost" label="Total Cost" />
            <ColHeader col="totalProceeds" label="Proceeds" />
            <ColHeader col="gl" label="G/L $" />
            <ColHeader col="glPct" label="G/L %" />
            <ColHeader col="cagr" label="CAGR" />
            <ColHeader col="alpha" label="Alpha" />
            <ColHeader col="divs" label="Dividends" />
            <ColHeader col="estTax" label="Est. Tax" />
            {showIfNotSold && <ColHeader col="currentPrice" label="Current Price" />}
            {showIfNotSold && <ColHeader col="hypGL" label="Hyp. G/L $" />}
            {showIfNotSold && <ColHeader col="hypCagr" label="Hyp. CAGR" />}
            {showIfNotSold && <ColHeader col="cagrDelta" label="CAGR Delta" />}
            {showIfNotSold && <ColHeader col="moneyDelta" label="$ Delta" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            const isPos = p.gl >= 0;
            const cagrPos = p.cagr != null && p.cagr >= 0;
            const alphaPos = p.alpha != null && p.alpha >= 0;
            const moneyDeltaPos = p.moneyDelta != null && p.moneyDelta >= 0;
            const cagrDeltaPos = p.cagrDelta != null && p.cagrDelta >= 0;
            return (
              <tr key={p.symbol} className="clickable" onClick={() => onSelectPosition(p.symbol)}>
                <td className="symbol">{p.symbol}</td>
                <td className="desc">{p.description}</td>
                <td>{p.accounts.join(', ')}</td>
                <td>{formatShares(p.totalShares)}</td>
                <td>{formatCurrency(p.avgCost)}</td>
                <td>{formatCurrency(p.totalCost)}</td>
                <td>{formatCurrency(p.totalProceeds)}</td>
                <td className={isPos ? 'positive' : 'negative'}>{formatCurrency(p.gl)}</td>
                <td className={isPos ? 'positive' : 'negative'}>{formatPct(p.glPct)}</td>
                <td className={p.cagr != null ? (cagrPos ? 'positive' : 'negative') : ''}>
                  {p.cagr != null ? formatPct(p.cagr) : '—'}
                </td>
                <td className={p.alpha != null ? (alphaPos ? 'positive' : 'negative') : ''}>
                  {p.alpha != null ? (p.alpha >= 0 ? '+' : '') + formatPct(p.alpha) : '—'}
                </td>
                <td className={p.divs > 0 ? 'positive' : ''}>
                  {p.divs > 0 ? formatCurrency(p.divs) : '—'}
                </td>
                <td className={p.estTax ? 'negative' : ''}>
                  {p.estTax ? formatCurrency(p.estTax) : '—'}
                </td>
                {showIfNotSold && (
                  <td className="dim">
                    {p.currentPrice != null ? formatCurrency(p.currentPrice) : <span className="delisted">Delisted</span>}
                  </td>
                )}
                {showIfNotSold && (
                  <td className={p.hypGL != null ? (p.hypGL >= 0 ? 'positive' : 'negative') : 'dim'}>
                    {p.hypGL != null ? formatCurrency(p.hypGL) : '—'}
                  </td>
                )}
                {showIfNotSold && (
                  <td className={p.hypCagr != null ? (p.hypCagr >= 0 ? 'positive' : 'negative') : 'dim'}>
                    {p.hypCagr != null ? formatPct(p.hypCagr) : '—'}
                  </td>
                )}
                {showIfNotSold && (
                  <td className={p.cagrDelta != null ? (cagrDeltaPos ? 'negative' : 'positive') : 'dim'}
                      title={cagrDeltaPos ? 'Would have done better holding' : 'Good sell — underperformed since'}>
                    {p.cagrDelta != null ? (cagrDeltaPos ? '+' : '') + formatPct(p.cagrDelta) : '—'}
                  </td>
                )}
                {showIfNotSold && (
                  <td className={p.moneyDelta != null ? (moneyDeltaPos ? 'negative' : 'positive') : 'dim'}
                      title={moneyDeltaPos ? 'Left on the table' : 'Avoided further loss / captured peak'}>
                    {p.moneyDelta != null ? formatCurrency(p.moneyDelta) : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
