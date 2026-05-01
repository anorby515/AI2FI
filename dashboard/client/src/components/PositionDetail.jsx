import { useMemo, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, Brush, ResponsiveContainer, Legend, Scatter, ComposedChart,
} from 'recharts';
import { usePriceHistory, useDividends, useBenchmark, useMoat, benchmarkPriceOnDate } from '../hooks/usePortfolio';
import MoatCard from './MoatCard';
import { formatCurrency, formatPct, formatShares, gainLoss, gainLossPct, calcCAGR, calcLotsIRR, calcClosedLotsIRR, calcIRR, calcBenchmarkIRR, ds, dc, lotProceeds, taxTerm, estimatedTax } from '../utils/calculations';

export default function PositionDetail({ symbol, allPositions, quotes, onBack, selectedAccounts, lotFilter, sortBy, sortDir, toggleSort, taxRates }) {

  const position = allPositions.find(p => p.symbol === symbol);
  const today = new Date().toISOString().slice(0, 10);

  // All lots for this symbol
  const allLots = position?.allLots || [];

  // Earliest date across all lots for chart range
  // Always fetch full history for the symbol (cached forever)
  const { history: fullHistory, loading, error } = usePriceHistory(symbol, '1990-01-01', today);
  const { dividends } = useDividends(symbol);
  const moat = useMoat(symbol);
  const { lookup: spyLookup } = useBenchmark('SPY');

  const q = quotes[symbol];
  const price = q?.price ?? null;

  const allAccountsSelected = selectedAccounts.size === 0;

  // Filter lots by status and account
  const filteredLots = useMemo(() => {
    let lots = allLots;
    if (lotFilter === 'Open') lots = lots.filter(l => l.transaction === 'Open');
    else if (lotFilter === 'Closed') lots = lots.filter(l => l.transaction !== 'Open');
    if (!allAccountsSelected) lots = lots.filter(l => selectedAccounts.has(l.account));
    return lots;
  }, [allLots, lotFilter, selectedAccounts, allAccountsSelected]);

  // Aggregate stats using normalized display values
  // Earliest date from filtered lots — drives chart X-axis start
  const earliest = filteredLots.length > 0
    ? filteredLots.reduce((min, l) => l.dateAcquired < min ? l.dateAcquired : min, filteredLots[0].dateAcquired)
    : '2015-01-01';

  // Filter history to start at earliest filtered lot
  const history = useMemo(() => fullHistory.filter(h => h.date >= earliest), [fullHistory, earliest]);

  const openLots = filteredLots.filter(l => l.transaction === 'Open');
  const closedLots = filteredLots.filter(l => l.transaction !== 'Open');
  const totalOpenShares = openLots.reduce((s, l) => s + ds(l), 0);
  const totalOpenCost = openLots.reduce((s, l) => s + ds(l) * dc(l), 0);
  const totalClosedCost = closedLots.reduce((s, l) => s + ds(l) * dc(l), 0);
  const totalProceeds = closedLots.reduce((s, l) => s + lotProceeds(l), 0);
  const marketValue = price != null ? totalOpenShares * price : null;
  const unrealizedGL = marketValue != null ? marketValue - totalOpenCost : null;
  const realizedGL = totalProceeds - totalClosedCost;
  const totalGL = (unrealizedGL || 0) + realizedGL;

  // Charitable vs non-charitable realized G/L
  const charitableLots = closedLots.filter(l => l.charitableDonation === 'Yes');
  const charitableCost = charitableLots.reduce((s, l) => s + ds(l) * dc(l), 0);
  const charitableProceeds = charitableLots.reduce((s, l) => s + lotProceeds(l), 0);
  const charitableGL = charitableProceeds - charitableCost;

  // Total IRR across all lots (open + closed)
  const totalInvested = totalOpenCost + totalClosedCost;
  const benchmarkFn = spyLookup ? (d) => benchmarkPriceOnDate(spyLookup, d) : null;
  const cagr = useMemo(() => {
    const flows = [];
    let terminalValue = 0;
    for (const lot of filteredLots) {
      const cost = ds(lot) * dc(lot);
      if (!lot.dateAcquired || cost <= 0) continue;
      flows.push({ date: lot.dateAcquired, amount: -cost });
      if (lot.transaction === 'Open') {
        if (price != null) terminalValue += ds(lot) * price;
      } else if (lot.dateSold) {
        const proceeds = lotProceeds(lot);
        if (proceeds) flows.push({ date: lot.dateSold, amount: proceeds });
      }
    }
    if (flows.length === 0) return null;
    if (terminalValue > 0) flows.push({ date: today, amount: terminalValue });
    flows.sort((a, b) => a.date.localeCompare(b.date));
    return calcIRR(flows);
  }, [filteredLots, price, today]);

  // Total alpha (IRR vs SPY benchmark IRR)
  const totalSpyCagr = useMemo(() => {
    if (!benchmarkFn) return null;
    return calcBenchmarkIRR(filteredLots, benchmarkFn, today, price);
  }, [filteredLots, benchmarkFn, today, price]);
  const totalAlpha = (cagr != null && totalSpyCagr != null) ? cagr - totalSpyCagr : null;

  // Dividends received: estimate based on shares held at each ex-date
  const dividendsReceived = useMemo(() => {
    if (!dividends.length || !allLots.length) return null;
    let total = 0;
    for (const div of dividends) {
      const exDate = div.date;
      if (!exDate) continue;
      // Count shares held on ex-date (bought before, not yet sold)
      let sharesHeld = 0;
      for (const lot of allLots) {
        if (lot.dateAcquired <= exDate) {
          if (lot.transaction === 'Open' || (lot.dateSold && lot.dateSold > exDate)) {
            sharesHeld += lot.sharesBought;
          }
        }
      }
      total += sharesHeld * (div.dividend || div.adjDividend || 0);
    }
    return total;
  }, [dividends, allLots]);

  // Chart data: merge buy/sell markers + normalized SPY into price history.
  // Markers plot at the price actually paid/received (split-adjusted to today's
  // share count, so it shares the y-axis with `close`). Multiple lots on the
  // same date collapse to a share-weighted average. This means a marker that
  // sits visibly off the price line is a real signal — the recorded basis
  // doesn't match the market that day.
  const chartData = useMemo(() => {
    if (!history.length) return [];

    // Per-date weighted-average buy price (today-adjusted). displayShares /
    // displayCostBasis already incorporate all splits, so dollars / shares is
    // directly comparable to historical `close`.
    const buyAgg = new Map();   // date -> { dollars, shares }
    const sellAgg = new Map();
    const charityAgg = new Map();
    for (const lot of allLots) {
      if (lot.dateAcquired) {
        const sh = ds(lot);
        const cb = dc(lot);
        if (sh > 0 && cb != null) {
          const a = buyAgg.get(lot.dateAcquired) || { dollars: 0, shares: 0 };
          a.dollars += sh * cb;
          a.shares  += sh;
          buyAgg.set(lot.dateAcquired, a);
        }
      }
      if (lot.dateSold && lot.sharesSold) {
        const proceeds = lotProceeds(lot);
        if (proceeds) {
          // Adjust sharesSold from sale-time share count to today's share count
          // so proceeds/adjShares yields a today-comparable per-share price.
          const sf = lot.splitFactor || 1;
          const tsf = lot.totalSplitFactor || 1;
          const adjShares = lot.sharesSold * (sf / tsf);
          const target = lot.charitableDonation === 'Yes' ? charityAgg : sellAgg;
          const a = target.get(lot.dateSold) || { dollars: 0, shares: 0 };
          a.dollars += proceeds;
          a.shares  += adjShares;
          target.set(lot.dateSold, a);
        }
      }
    }
    const wavg = (m, d) => {
      const a = m.get(d);
      return (a && a.shares > 0) ? a.dollars / a.shares : undefined;
    };

    const markerDates = new Set([...buyAgg.keys(), ...sellAgg.keys(), ...charityAgg.keys()]);

    // Downsample: keep max ~1500 points + always keep marker dates
    const MAX_POINTS = 1500;
    let sampled = history;
    if (history.length > MAX_POINTS) {
      const step = Math.ceil(history.length / MAX_POINTS);
      sampled = history.filter((h, i) => i % step === 0 || i === history.length - 1 || markerDates.has(h.date));
    }

    // Normalize SPY to match the stock's starting price (so they share a Y axis)
    const stockStart = sampled[0]?.close;
    const spyStart = spyLookup ? benchmarkPriceOnDate(spyLookup, sampled[0]?.date) : null;
    const spyScale = (stockStart && spyStart) ? stockStart / spyStart : null;

    return sampled.map(h => {
      const spyPrice = spyLookup ? benchmarkPriceOnDate(spyLookup, h.date) : null;
      return {
        ...h,
        buyMarker: wavg(buyAgg, h.date),
        sellMarker: wavg(sellAgg, h.date),
        charityMarker: wavg(charityAgg, h.date),
        spy: spyPrice != null && spyScale != null ? spyPrice * spyScale : undefined,
      };
    });
  }, [history, allLots, spyLookup]);

  // Unrealized IRR + Alpha
  const unrealizedCagr = price != null && openLots.length > 0 ? calcLotsIRR(openLots, price, today) : null;
  const unrealizedSpyCagr = benchmarkFn && openLots.length > 0 ? calcBenchmarkIRR(openLots, benchmarkFn, today) : null;
  const unrealizedAlpha = (unrealizedCagr != null && unrealizedSpyCagr != null) ? unrealizedCagr - unrealizedSpyCagr : null;

  // Realized IRR + Alpha
  const realizedCagr = closedLots.length > 0 ? calcClosedLotsIRR(closedLots) : null;
  const realizedSpyCagr = benchmarkFn && closedLots.length > 0 ? calcBenchmarkIRR(closedLots, benchmarkFn, today) : null;
  const realizedAlpha = (realizedCagr != null && realizedSpyCagr != null) ? realizedCagr - realizedSpyCagr : null;

  // % of open lots beating S&P
  const openBeatingSP = useMemo(() => {
    if (!openLots.length || !spyLookup || price == null) return null;
    let beat = 0;
    let total = 0;
    for (const lot of openLots) {
      const lotCost = ds(lot) * dc(lot);
      const lotValue = ds(lot) * price;
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
  }, [openLots, spyLookup, price, today]);

  // % of sells beating S&P
  const sellsBeatingSP = useMemo(() => {
    if (!closedLots.length || !spyLookup) return null;
    let beat = 0;
    let total = 0;
    for (const lot of closedLots) {
      if (!lot.dateSold) continue;
      const lotCost = ds(lot) * dc(lot);
      const proceeds = lotProceeds(lot);
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
  }, [closedLots, spyLookup]);

  // Total % Alpha > 0 across ALL lots (open + closed)
  const allBeatingSP = useMemo(() => {
    if (!spyLookup) return null;
    let beat = 0;
    let total = 0;
    for (const lot of filteredLots) {
      const isOpen = lot.transaction === 'Open';
      const endDate = isOpen ? today : lot.dateSold;
      if (!endDate) continue;
      const lotCost = ds(lot) * dc(lot);
      const lotEnd = isOpen ? (price != null ? ds(lot) * price : null) : lotProceeds(lot);
      if (lotEnd == null) continue;
      const lotCagr = calcCAGR(lotCost, lotEnd, lot.dateAcquired, endDate);
      const sb = benchmarkPriceOnDate(spyLookup, lot.dateAcquired);
      const se = benchmarkPriceOnDate(spyLookup, endDate);
      const sc = (sb && se) ? calcCAGR(sb, se, lot.dateAcquired, endDate) : null;
      if (lotCagr != null && sc != null) {
        total++;
        if (lotCagr > sc) beat++;
      }
    }
    return total > 0 ? { beat, total, pct: beat / total } : null;
  }, [filteredLots, spyLookup, price, today]);

  // Tax estimates
  const estTaxUnrealized = unrealizedGL != null && unrealizedGL > 0
    ? openLots.reduce((sum, l) => {
        const lotValue = price != null ? ds(l) * price : null;
        if (lotValue == null) return sum;
        const lotGain = lotValue - ds(l) * dc(l);
        if (lotGain <= 0) return sum;
        const term = taxTerm(l.dateAcquired, today);
        const tax = estimatedTax(lotGain, term, taxRates);
        return sum + (tax || 0);
      }, 0)
    : null;
  const estTaxRealized = realizedGL > 0
    ? closedLots.filter(l => l.charitableDonation !== 'Yes').reduce((sum, l) => {
        const proceeds = lotProceeds(l);
        const lotGain = proceeds - ds(l) * dc(l);
        if (lotGain <= 0) return sum;
        const term = taxTerm(l.dateAcquired, l.dateSold || today);
        const tax = estimatedTax(lotGain, term, taxRates);
        return sum + (tax || 0);
      }, 0)
    : null;

  // Tax avoided by charitable donations
  const taxAvoided = charitableLots.reduce((sum, l) => {
    const proceeds = lotProceeds(l);
    const lotGain = proceeds - ds(l) * dc(l);
    if (lotGain <= 0) return sum;
    const term = taxTerm(l.dateAcquired, l.dateSold || today);
    const tax = estimatedTax(lotGain, term, taxRates);
    return sum + (tax || 0);
  }, 0) || null;

  const estTaxTotal = (estTaxUnrealized || 0) + (estTaxRealized || 0) || null;

  const isPos = unrealizedGL != null && unrealizedGL >= 0;
  const isRealizedPos = realizedGL >= 0;

  return (
    <div className="position-detail">
      <div className="ticker-header">
        <span className="ticker-symbol">{symbol}</span>
        <span className="ticker-desc">{position?.description}</span>
      </div>

      <div className="stats-grid-3row">
        <div className="stats-rows-col">
        {/* Data rows with price tower on the left */}
        <div className="stats-data-area">
        <div className="stat stat-price-tower">
          <div className="price-tower-value">{marketValue != null ? formatCurrency(marketValue) : '—'}</div>
          <div className="stat-value">{price != null ? formatCurrency(price) : '—'}</div>
          <div className="price-tower-shares">{totalOpenShares > 0 ? `${Number.isInteger(totalOpenShares) ? totalOpenShares : parseFloat(totalOpenShares.toFixed(2))} shares` : '—'}</div>
          <div className="price-tower-cagr">{cagr != null ? formatPct(cagr) : '—'} <span>CAGR</span></div>
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
            <div className="col-header" />
          </div>
        </div>

        {/* Row 1: Total */}
        <div className="stats-row-wrapper">
          <div className="stats-row-label total-label">Total</div>
          <div className="position-stats total-row">
            <Stat value={formatCurrency(totalGL)} accent={totalGL >= 0 ? 'positive' : 'negative'} />
            <Stat value={totalInvested > 0 ? formatPct(totalGL / totalInvested) : '—'} accent={totalGL >= 0 ? 'positive' : 'negative'} />
            <Stat value={cagr != null ? formatPct(cagr) : '—'} accent={cagr != null ? (cagr >= 0 ? 'positive' : 'negative') : null} />
            <Stat value={totalAlpha != null ? (totalAlpha >= 0 ? '+' : '') + formatPct(totalAlpha) : '—'} accent={totalAlpha != null ? (totalAlpha >= 0 ? 'positive' : 'negative') : null} />
            <Stat value={allBeatingSP != null ? formatPct(allBeatingSP.pct) : '—'} sub={allBeatingSP != null ? `${allBeatingSP.beat} of ${allBeatingSP.total} lots` : null} accent={allBeatingSP != null ? (allBeatingSP.pct >= 0.5 ? 'positive' : 'negative') : null} />
            <Stat label="Charity" value={charitableLots.length > 0 ? formatCurrency(charitableGL) : '—'} sub={charitableLots.length > 0 ? `${charitableLots.length} donation${charitableLots.length !== 1 ? 's' : ''}` : null} accent={charitableLots.length > 0 ? (charitableGL >= 0 ? 'positive' : 'negative') : null} />
            <Stat label="Est. Tax" value={estTaxTotal ? formatCurrency(estTaxTotal) : '—'} sub={estTaxTotal ? `${(taxRates?.lt * 100).toFixed(1)}% LT / ${(taxRates?.st * 100).toFixed(1)}% ST` : null} accent={estTaxTotal ? 'negative' : null} />
          </div>
        </div>

        {/* Row 2: Unrealized */}
        <div className="stats-row-wrapper detail-row">
          <div className="stats-row-label">Unrealized</div>
          <div className="position-stats">
            <Stat value={unrealizedGL != null ? formatCurrency(unrealizedGL) : '—'} accent={unrealizedGL != null ? (isPos ? 'positive' : 'negative') : null} />
            <Stat value={unrealizedGL != null && totalOpenCost > 0 ? formatPct(unrealizedGL / totalOpenCost) : '—'} accent={unrealizedGL != null ? (isPos ? 'positive' : 'negative') : null} />
            <Stat value={unrealizedCagr != null ? formatPct(unrealizedCagr) : '—'} accent={unrealizedCagr != null ? (unrealizedCagr >= 0 ? 'positive' : 'negative') : null} />
            <Stat value={unrealizedAlpha != null ? (unrealizedAlpha >= 0 ? '+' : '') + formatPct(unrealizedAlpha) : '—'} accent={unrealizedAlpha != null ? (unrealizedAlpha >= 0 ? 'positive' : 'negative') : null} />
            <Stat value={openBeatingSP != null ? formatPct(openBeatingSP.pct) : '—'} sub={openBeatingSP != null ? `${openBeatingSP.beat} of ${openBeatingSP.total} lots` : null} accent={openBeatingSP != null ? (openBeatingSP.pct >= 0.5 ? 'positive' : 'negative') : null} />
            <Stat label="Current Value" value={marketValue != null ? formatCurrency(marketValue) : '—'} />
            <Stat label="Est. Tax" value={estTaxUnrealized ? formatCurrency(estTaxUnrealized) : '—'} accent={estTaxUnrealized ? 'negative' : null} />
          </div>
        </div>

        {/* Row 3: Realized */}
        {closedLots.length > 0 && (
          <div className="stats-row-wrapper detail-row">
            <div className="stats-row-label realized-label">Realized</div>
            <div className="position-stats">
              <Stat value={formatCurrency(realizedGL)} accent={isRealizedPos ? 'positive' : 'negative'} />
              <Stat value={totalClosedCost > 0 ? formatPct(realizedGL / totalClosedCost) : '—'} accent={isRealizedPos ? 'positive' : 'negative'} />
              <Stat value={realizedCagr != null ? formatPct(realizedCagr) : '—'} accent={realizedCagr != null ? (realizedCagr >= 0 ? 'positive' : 'negative') : null} />
              <Stat value={realizedAlpha != null ? (realizedAlpha >= 0 ? '+' : '') + formatPct(realizedAlpha) : '—'} accent={realizedAlpha != null ? (realizedAlpha >= 0 ? 'positive' : 'negative') : null} />
              <Stat value={sellsBeatingSP != null ? formatPct(sellsBeatingSP.pct) : '—'} sub={sellsBeatingSP != null ? `${sellsBeatingSP.beat} of ${sellsBeatingSP.total} lots` : null} accent={sellsBeatingSP != null ? (sellsBeatingSP.pct >= 0.5 ? 'positive' : 'negative') : null} />
              <Stat label="Tax Avoided" value={taxAvoided ? formatCurrency(taxAvoided) : '—'} sub={taxAvoided ? 'via charity' : null} accent={taxAvoided ? 'positive' : null} />
              <Stat label="Est. Tax" value={estTaxRealized ? formatCurrency(estTaxRealized) : '—'} accent={estTaxRealized ? 'negative' : null} />
            </div>
          </div>
        )}
        </div>
        </div>
        </div>
      </div>

      {/* Chart with drag-to-zoom */}
      <PriceChart chartData={chartData} loading={loading} error={error} />

      <MoatCard moat={moat} />

      <div className="lot-table-section">
        <LotTable
          filteredLots={filteredLots}
          price={price}
          today={today}
          spyLookup={spyLookup}
          sortBy={sortBy}
          sortDir={sortDir}
          toggleSort={toggleSort}
          taxRates={taxRates}
        />
        <div className="lot-summary">
          {filteredLots.length} lot{filteredLots.length !== 1 ? 's' : ''}
          {openLots.length > 0 && closedLots.length > 0 && ` (${openLots.length} open, ${closedLots.length} closed)`}
          <span className="legend">
            <span className="legend-item"><span className="legend-swatch unrealized" /> Unrealized</span>
            <span className="legend-item"><span className="legend-swatch realized" /> Realized</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function PriceChart({ chartData, loading, error }) {
  if (loading) return <p className="loading">Loading price history...</p>;
  if (error) return <p className="error">Could not load price history: {error}</p>;
  if (!chartData.length) return null;

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={d => d?.slice(0, 7)}
            minTickGap={50}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={v => `$${v}`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            formatter={(v, name) => {
              if (name === 'Buy') return [`$${Number(v).toFixed(2)}`, '🟢 Buy'];
              if (name === 'Sell') return [`$${Number(v).toFixed(2)}`, '🔴 Sell'];
              if (name === 'Charity') return [`$${Number(v).toFixed(2)}`, '🟡 Charity'];
              return [`$${Number(v).toFixed(2)}`, 'Close'];
            }}
            labelFormatter={l => `Date: ${l}`}
            contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }}
          />
          <Legend verticalAlign="top" />
          <Line type="monotone" dataKey="close" name="Price" stroke="#4f9cf9" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="spy" name="S&P 500" stroke="#6a6a8a" dot={false} strokeWidth={1} strokeDasharray="6 3" />
          <Scatter dataKey="buyMarker" name="Buy" fill="#34c78a" shape="triangle" legendType="triangle" />
          <Scatter dataKey="sellMarker" name="Sell" fill="#f94f6a" shape="diamond" legendType="diamond" />
          <Scatter dataKey="charityMarker" name="Charity" fill="#f9a84f" shape="star" legendType="star" />
          <Brush
            dataKey="date"
            height={40}
            stroke="#4f9cf9"
            fill="#12122a"
            tickFormatter={d => d?.slice(0, 7)}
            travellerWidth={10}
          >
            <ComposedChart>
              <Line type="monotone" dataKey="close" stroke="#4f9cf9" dot={false} strokeWidth={1} />
            </ComposedChart>
          </Brush>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function LotTable({ filteredLots, price, today, spyLookup, sortBy, sortDir, toggleSort, taxRates }) {
  // Pre-compute all sortable values per row
  const rows = useMemo(() => filteredLots.map((lot, i) => {
    const shares = ds(lot);
    const cost = dc(lot);
    const lotCost = shares * cost;
    const isOpen = lot.transaction === 'Open';
    let lotGl, lotGlPct, lotCagr;

    if (isOpen) {
      const lotValue = price != null ? shares * price : null;
      lotGl = lotValue != null ? lotValue - lotCost : null;
      lotGlPct = lotGl != null ? gainLossPct(lotCost, lotValue) : null;
      lotCagr = lotValue != null ? calcCAGR(lotCost, lotValue, lot.dateAcquired, today) : null;
    } else {
      const proceeds = lotProceeds(lot);
      lotGl = proceeds - lotCost;
      lotGlPct = gainLossPct(lotCost, proceeds);
      lotCagr = lot.dateSold ? calcCAGR(lotCost, proceeds, lot.dateAcquired, lot.dateSold) : null;
    }
    const endDate = isOpen ? today : (lot.dateSold || today);
    const spyBuy = benchmarkPriceOnDate(spyLookup, lot.dateAcquired);
    const spySell = benchmarkPriceOnDate(spyLookup, endDate);
    const spyCagr = (spyBuy && spySell) ? calcCAGR(spyBuy, spySell, lot.dateAcquired, endDate) : null;
    const alpha = (lotCagr != null && spyCagr != null) ? lotCagr - spyCagr : null;
    const term = taxTerm(lot.dateAcquired, endDate);
    const isCharity = lot.charitableDonation === 'Yes';
    const estTax = isCharity ? 0 : estimatedTax(lotGl != null && lotGl > 0 ? lotGl : null, term, taxRates);

    const currentValue = isOpen && price != null ? shares * price : null;

    return {
      key: i, lot, isOpen, shares, cost, lotCost, lotGl, lotGlPct, lotCagr, spyCagr, alpha,
      term, estTax, currentValue,
      originalShares: lot.originalShares ?? lot.sharesBought,
      adjCost: lot.adjCostBasis ?? cost,
      totalSplitFactor: lot.totalSplitFactor ?? 1,
      splitDescription: lot.splitDescription || '',
      sharesSold: isOpen ? null : (lot.sharesSold ?? lot.sharesBought),
      sharesOpen: isOpen ? shares : null,
      // Sort-friendly values
      account: lot.account, dateAcquired: lot.dateAcquired, dateSold: lot.dateSold || '',
      charitable: lot.charitableDonation === 'Yes' ? 'Yes' : '',
    };
  }), [filteredLots, price, today, spyLookup]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av = a[sortBy] ?? -Infinity;
      let bv = b[sortBy] ?? -Infinity;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [rows, sortBy, sortDir]);

  function SortTh({ col, label }) {
    const active = sortBy === col;
    return (
      <th onClick={() => toggleSort(col)} className={`sortable ${active ? 'sorted' : ''}`}>
        {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
      </th>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <SortTh col="account" label="Account" />
          <SortTh col="dateAcquired" label="Date Acquired" />
          <SortTh col="originalShares" label="Shares Bought" />
          <SortTh col="sharesOpen" label="Shares Open" />
          <SortTh col="adjCost" label="Adj Cost/Share" />
          <SortTh col="lotCost" label="Cost Basis" />
          <SortTh col="currentValue" label="Current Value" />
          <SortTh col="dateSold" label="Date Sold" />
          <SortTh col="sharesSold" label="Shares Sold" />
          <SortTh col="lotGl" label="G/L $" />
          <SortTh col="lotGlPct" label="G/L %" />
          <SortTh col="lotCagr" label="CAGR" />
          <SortTh col="alpha" label="Alpha" />
          <SortTh col="term" label="Term" />
          <SortTh col="estTax" label="Est. Tax" />
          <SortTh col="charitable" label="Charitable" />
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => {
          const pos = r.lotGl != null && r.lotGl >= 0;
          const cagrPos = r.lotCagr != null && r.lotCagr >= 0;
          const alphaPos = r.alpha != null && r.alpha >= 0;
          return (
            <tr key={r.key} className={r.isOpen ? 'lot-unrealized' : 'lot-realized'}>
              <td>{r.account}</td>
              <td>{r.dateAcquired}</td>
              <td>{formatShares(r.originalShares)}</td>
              <td>
                {r.isOpen ? (
                  <>
                    {r.totalSplitFactor !== 1 && (
                      <>
                        <span className="split-badge" title={r.splitDescription}>{r.totalSplitFactor}×</span>{' '}
                      </>
                    )}
                    {formatShares(r.sharesOpen)}
                  </>
                ) : '—'}
              </td>
              <td>{formatCurrency(r.adjCost)}</td>
              <td>{formatCurrency(r.lotCost)}</td>
              <td>{r.currentValue != null ? formatCurrency(r.currentValue) : '—'}</td>
              <td>{r.isOpen ? '' : r.dateSold}</td>
              <td>
                {r.sharesSold != null ? (
                  <>
                    {r.totalSplitFactor !== 1 && (
                      <>
                        <span className="split-badge" title={r.splitDescription}>{r.totalSplitFactor}×</span>{' '}
                      </>
                    )}
                    {formatShares(r.sharesSold)}
                  </>
                ) : ''}
              </td>
              <td className={r.lotGl != null ? (pos ? 'positive' : 'negative') : ''}>
                {r.lotGl != null ? formatCurrency(r.lotGl) : '—'}
              </td>
              <td className={r.lotGl != null ? (pos ? 'positive' : 'negative') : ''}>
                {r.lotGlPct != null ? formatPct(r.lotGlPct) : '—'}
              </td>
              <td className={r.lotCagr != null ? (cagrPos ? 'positive' : 'negative') : ''}>
                {r.lotCagr != null ? formatPct(r.lotCagr) : '—'}
              </td>
              <td className={r.alpha != null ? (alphaPos ? 'positive' : 'negative') : ''}>
                {r.alpha != null ? (r.alpha >= 0 ? '+' : '') + formatPct(r.alpha) : '—'}
              </td>
              <td>{r.term ? <span className={`term-badge ${r.term}`}>{r.term === 'long' ? 'LT' : 'ST'}</span> : '—'}</td>
              <td className={r.estTax != null ? 'negative' : ''}>
                {r.estTax != null ? formatCurrency(r.estTax) : '—'}
              </td>
              <td>{r.charitable && <span className="charitable-badge">Yes</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Stat({ label, value, accent, sub, subAccent }) {
  return (
    <div className="stat">
      {label && <div className="stat-label">{label}</div>}
      <div className={`stat-value ${accent || ''}`}>{value}</div>
      {sub && <div className={`stat-sub ${subAccent || ''}`}>{sub}</div>}
    </div>
  );
}
