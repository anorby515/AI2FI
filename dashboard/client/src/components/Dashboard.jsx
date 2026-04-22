import { useMemo } from 'react';
import { formatCurrency, formatPct, totalCostBasis, currentValue, gainLoss, gainLossPct, calcCAGR, calcLotsIRR, calcClosedLotsIRR, calcBenchmarkIRR, calcIRR, ds, dc } from '../utils/calculations';
import { benchmarkPriceOnDate } from '../hooks/usePortfolio';

export default function Dashboard({ positions, openLots, closedLots, quotes, quotesLoading, selectedAccounts, spyLookup, view }) {
  const allSelected = selectedAccounts.size === 0;
  const filteredLots = allSelected
    ? openLots
    : openLots.filter(l => selectedAccounts.has(l.account));

  const filteredPositions = allSelected
    ? positions
    : positions.filter(p => p.accounts.some(a => selectedAccounts.has(a)));

  const cost = totalCostBasis(filteredLots);
  const value = currentValue(filteredLots, quotes);
  const gl = gainLoss(cost, value);
  const glPct = gainLossPct(cost, value);
  const isPositive = gl >= 0;

  // Portfolio-level alpha using IRR across all open lots
  const today = new Date().toISOString().slice(0, 10);
  const benchmarkFn = spyLookup ? (d) => benchmarkPriceOnDate(spyLookup, d) : null;

  const portfolioIRR = useMemo(() => {
    if (value <= 0) return null;
    // Build cash flows from ALL open lots across all positions
    const flows = [];
    let terminalValue = 0;
    for (const lot of filteredLots) {
      const q = quotes[lot.symbol];
      if (!q) continue;
      const cost = ds(lot) * dc(lot);
      if (!lot.dateAcquired || cost <= 0) continue;
      flows.push({ date: lot.dateAcquired, amount: -cost });
      terminalValue += ds(lot) * q.price;
    }
    if (flows.length === 0 || terminalValue <= 0) return null;
    flows.push({ date: today, amount: terminalValue });
    flows.sort((a, b) => a.date.localeCompare(b.date));
    return calcIRR(flows);
  }, [filteredLots, quotes, value, today]);

  const portfolioSpyIRR = useMemo(() => {
    if (!benchmarkFn || value <= 0) return null;
    return calcBenchmarkIRR(filteredLots, benchmarkFn, today);
  }, [filteredLots, benchmarkFn, value, today]);

  const portfolioAlpha = (portfolioIRR != null && portfolioSpyIRR != null) ? portfolioIRR - portfolioSpyIRR : null;
  const alphaPos = portfolioAlpha != null && portfolioAlpha >= 0;

  // % of open lots beating S&P (per-lot)
  const openBeatingSP = useMemo(() => {
    if (!filteredLots.length || !spyLookup || value <= 0) return null;
    let beat = 0;
    let total = 0;
    for (const lot of filteredLots) {
      const q = quotes[lot.symbol];
      if (!q) continue;
      const lotCost = ds(lot) * dc(lot);
      const lotValue = ds(lot) * q.price;
      const lotCagr = calcCAGR(lotCost, lotValue, lot.dateAcquired, today);
      const sb = benchmarkPriceOnDate(spyLookup, lot.dateAcquired);
      const se = benchmarkPriceOnDate(spyLookup, today);
      const sc = (sb && se) ? calcCAGR(sb, se, lot.dateAcquired, today) : null;
      if (lotCagr != null && sc != null) {
        total++;
        if (lotCagr > sc) beat++;
      }
    }
    return total > 0 ? { beat, total, pct: beat / total } : null;
  }, [filteredLots, quotes, spyLookup, value, today]);

  // Closed view stats
  const filteredClosed = allSelected
    ? closedLots
    : closedLots.filter(l => selectedAccounts.has(l.account));

  const closedCost = filteredClosed.reduce((s, l) => s + ds(l) * dc(l), 0);
  const closedProceeds = filteredClosed.reduce((s, l) => s + (l.proceeds || 0), 0);
  const totalRealizedGL = closedProceeds - closedCost;

  // Closed portfolio IRR + Alpha
  const closedIRR = useMemo(() => {
    if (!filteredClosed.length) return null;
    return calcClosedLotsIRR(filteredClosed);
  }, [filteredClosed]);

  const closedSpyIRR = useMemo(() => {
    if (!benchmarkFn || !filteredClosed.length) return null;
    return calcBenchmarkIRR(filteredClosed, benchmarkFn, today);
  }, [filteredClosed, benchmarkFn, today]);

  const closedAlpha = (closedIRR != null && closedSpyIRR != null) ? closedIRR - closedSpyIRR : null;
  const charitableClosed = filteredClosed.filter(l => l.charitableDonation === 'Yes');
  const charitableGL = charitableClosed.reduce((s, l) => s + ((l.proceeds || 0) - ds(l) * dc(l)), 0);
  const realizedIsPos = totalRealizedGL >= 0;
  const charitableIsPos = charitableGL >= 0;
  const showClosed = view === 'Closed';

  // Total (open + closed combined)
  const totalCost = cost + closedCost;
  const totalGL = gl + totalRealizedGL;
  const totalGlPct = totalCost > 0 ? totalGL / totalCost : 0;

  // Total IRR across all lots
  const totalIRR = useMemo(() => {
    const allFilteredLots = [...filteredLots, ...filteredClosed];
    if (!allFilteredLots.length) return null;
    const flows = [];
    let terminalValue = 0;
    for (const lot of allFilteredLots) {
      const lotCost = ds(lot) * dc(lot);
      if (!lot.dateAcquired || lotCost <= 0) continue;
      flows.push({ date: lot.dateAcquired, amount: -lotCost });
      if (lot.transaction === 'Open') {
        const q = quotes[lot.symbol];
        if (q) terminalValue += ds(lot) * q.price;
      } else if (lot.dateSold && lot.proceeds) {
        flows.push({ date: lot.dateSold, amount: lot.proceeds });
      }
    }
    if (flows.length === 0) return null;
    if (terminalValue > 0) flows.push({ date: today, amount: terminalValue });
    flows.sort((a, b) => a.date.localeCompare(b.date));
    return calcIRR(flows);
  }, [filteredLots, filteredClosed, quotes, today]);

  const totalSpyIRR = useMemo(() => {
    if (!benchmarkFn) return null;
    return calcBenchmarkIRR([...filteredLots, ...filteredClosed], benchmarkFn, today);
  }, [filteredLots, filteredClosed, benchmarkFn, today]);

  const totalAlpha = (totalIRR != null && totalSpyIRR != null) ? totalIRR - totalSpyIRR : null;

  // All lots % Alpha > 0
  const allBeatingSP = useMemo(() => {
    if (!spyLookup) return null;
    const allLots = [...filteredLots, ...filteredClosed];
    let beat = 0, total = 0;
    for (const lot of allLots) {
      const isOpen = lot.transaction === 'Open';
      const endDate = isOpen ? today : lot.dateSold;
      if (!endDate || !lot.dateAcquired) continue;
      const lotCost = ds(lot) * dc(lot);
      let lotEnd;
      if (isOpen) {
        const q = quotes[lot.symbol];
        if (!q) continue;
        lotEnd = ds(lot) * q.price;
      } else {
        lotEnd = lot.proceeds || 0;
      }
      const lotCagr = calcCAGR(lotCost, lotEnd, lot.dateAcquired, endDate);
      const sb = benchmarkPriceOnDate(spyLookup, lot.dateAcquired);
      const se = benchmarkPriceOnDate(spyLookup, endDate);
      const sc = (sb && se) ? calcCAGR(sb, se, lot.dateAcquired, endDate) : null;
      if (lotCagr != null && sc != null) { total++; if (lotCagr > sc) beat++; }
    }
    return total > 0 ? { beat, total, pct: beat / total } : null;
  }, [filteredLots, filteredClosed, quotes, spyLookup, today]);

  // % of closed lots beating S&P
  const closedBeatingSP = useMemo(() => {
    if (!filteredClosed.length || !spyLookup) return null;
    let beat = 0;
    let total = 0;
    for (const lot of filteredClosed) {
      if (!lot.dateSold) continue;
      const lotCost = ds(lot) * dc(lot);
      const proceeds = lot.proceeds || 0;
      const lotCagr = calcCAGR(lotCost, proceeds, lot.dateAcquired, lot.dateSold);
      const sb = benchmarkPriceOnDate(spyLookup, lot.dateAcquired);
      const se = benchmarkPriceOnDate(spyLookup, lot.dateSold);
      const sc = (sb && se) ? calcCAGR(sb, se, lot.dateAcquired, lot.dateSold) : null;
      if (lotCagr != null && sc != null) {
        total++;
        if (lotCagr > sc) beat++;
      }
    }
    return total > 0 ? { beat, total, pct: beat / total } : null;
  }, [filteredClosed, spyLookup]);

  return (
    <div className="dashboard">
      <div className="stats-grid-3row">
        <div className="stats-data-area">
          <div className="stat stat-price-tower">
            <div className="price-tower-value">{value > 0 ? formatCurrency(value) : '—'}</div>
            <div className={`price-tower-shares ${isPositive ? 'positive' : 'negative'}`}>{value > 0 ? formatCurrency(gl) : '—'}</div>
            <div className="price-tower-cagr">{portfolioIRR != null ? formatPct(portfolioIRR) : '—'} <span>CAGR</span></div>
            <div className="price-tower-cagr">{value > 0 ? formatPct(glPct) : '—'} <span>Gain</span></div>
            <div className="price-tower-date">As of {today}</div>
          </div>
          <div className="stats-data-rows">
            {/* Column headers */}
            <div className="stats-row-wrapper stats-col-headers">
              <div className="col-header-spacer" />
              <div className="position-stats">
                <div className="col-header">G/L $</div>
                <div className="col-header">G/L %</div>
                <div className="col-header">CAGR</div>
                <div className="col-header">Alpha</div>
                <div className="col-header">% Alpha &gt; 0</div>
                <div className="col-header" />
              </div>
            </div>

            {/* Row 1: Total */}
            <div className="stats-row-wrapper">
              <div className="stats-row-label total-label">Total</div>
              <div className="position-stats total-row">
                <Stat value={formatCurrency(totalGL)} accent={totalGL >= 0 ? 'positive' : 'negative'} />
                <Stat value={formatPct(totalGlPct)} accent={totalGL >= 0 ? 'positive' : 'negative'} />
                <Stat value={totalIRR != null ? formatPct(totalIRR) : '—'} accent={totalIRR != null ? (totalIRR >= 0 ? 'positive' : 'negative') : null} />
                <Stat value={totalAlpha != null ? (totalAlpha >= 0 ? '+' : '') + formatPct(totalAlpha) : '—'} accent={totalAlpha != null ? (totalAlpha >= 0 ? 'positive' : 'negative') : null} />
                <Stat value={allBeatingSP != null ? formatPct(allBeatingSP.pct) : '—'} sub={allBeatingSP != null ? `${allBeatingSP.beat} of ${allBeatingSP.total}` : null} accent={allBeatingSP != null ? (allBeatingSP.pct >= 0.5 ? 'positive' : 'negative') : null} />
                <Stat label="Charity" value={charitableClosed.length > 0 ? formatCurrency(charitableGL) : '—'} sub={charitableClosed.length > 0 ? `${charitableClosed.length} donations` : null} accent={charitableClosed.length > 0 ? (charitableIsPos ? 'positive' : 'negative') : null} />
              </div>
            </div>

            {/* Row 2: Unrealized */}
            <div className="stats-row-wrapper detail-row">
              <div className="stats-row-label">Unrealized</div>
              <div className="position-stats">
                <Stat value={value > 0 ? formatCurrency(gl) : '—'} accent={isPositive ? 'positive' : 'negative'} />
                <Stat value={value > 0 ? formatPct(glPct) : '—'} accent={isPositive ? 'positive' : 'negative'} />
                <Stat value={portfolioIRR != null ? formatPct(portfolioIRR) : '—'} accent={portfolioIRR != null ? (portfolioIRR >= 0 ? 'positive' : 'negative') : null} />
                <Stat value={portfolioAlpha != null ? (portfolioAlpha >= 0 ? '+' : '') + formatPct(portfolioAlpha) : '—'} accent={portfolioAlpha != null ? (alphaPos ? 'positive' : 'negative') : null} />
                <Stat value={openBeatingSP != null ? formatPct(openBeatingSP.pct) : '—'} sub={openBeatingSP != null ? `${openBeatingSP.beat} of ${openBeatingSP.total}` : null} accent={openBeatingSP != null ? (openBeatingSP.pct >= 0.5 ? 'positive' : 'negative') : null} />
                <div className="stat" />
              </div>
            </div>

            {/* Row 3: Realized */}
            {filteredClosed.length > 0 && (
              <div className="stats-row-wrapper detail-row">
                <div className="stats-row-label realized-label">Realized</div>
                <div className="position-stats">
                  <Stat value={formatCurrency(totalRealizedGL)} accent={realizedIsPos ? 'positive' : 'negative'} />
                  <Stat value={closedCost > 0 ? formatPct(totalRealizedGL / closedCost) : '—'} accent={realizedIsPos ? 'positive' : 'negative'} />
                  <Stat value={closedIRR != null ? formatPct(closedIRR) : '—'} accent={closedIRR != null ? (closedIRR >= 0 ? 'positive' : 'negative') : null} />
                  <Stat value={closedAlpha != null ? (closedAlpha >= 0 ? '+' : '') + formatPct(closedAlpha) : '—'} accent={closedAlpha != null ? (closedAlpha >= 0 ? 'positive' : 'negative') : null} />
                  <Stat value={closedBeatingSP != null ? formatPct(closedBeatingSP.pct) : '—'} sub={closedBeatingSP != null ? `${closedBeatingSP.beat} of ${closedBeatingSP.total}` : null} accent={closedBeatingSP != null ? (closedBeatingSP.pct >= 0.5 ? 'positive' : 'negative') : null} />
                  <div className="stat" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, sub }) {
  return (
    <div className="stat">
      {label && <div className="stat-label">{label}</div>}
      <div className={`stat-value ${accent || ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
