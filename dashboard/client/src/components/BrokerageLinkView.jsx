import { Fragment, useMemo, useState } from 'react';
import { Card, Stat, Button } from '../ui';
import useBrokerageLink from '../hooks/useBrokerageLink';
import { useBenchmark, benchmarkPriceOnDate } from '../hooks/usePortfolio';
import { calcIRR } from '../utils/calculations';
import './BrokerageLinkView.css';

// Per-holding cash flow IRR + SPY-shadow alpha for BrokerageLink.
//
//   Cash flows (asset perspective):
//     - YOU BOUGHT (action amount is negative)        → keep sign (negative = money in)
//     - YOU SOLD   (action amount is positive)        → keep sign (positive = money out)
//     - Synthetic opening lot (pre-2021 reconstructed)→ -openingLot.costBasis at anchorDate
//     - REINVESTMENT / DIVIDEND / CAP_GAIN / MERGER / REDEMPTION / TRANSFER → skip
//        (reinvestments and dividends are washes, transfers belong to the
//         retirement rollup invariant, mergers/redemptions are state changes
//         with offsetting buy/sell legs already in the data)
//     - Terminal: +currentValue at today
//
//   Alpha = fundIRR − benchmarkIRR. SPY shadow position: each cash flow's
//   inverse buys/sells SPY shares at that date's adjClose; remaining shares
//   × today's adjClose = benchmark terminal.
function computeBLReturns(holding, transactions, todayStr, spyLookup) {
  if (holding.isCash || !transactions) return { cagr: null, alpha: null };
  const flows = [];
  let spyShares = 0;
  const spyToday = spyLookup ? benchmarkPriceOnDate(spyLookup, todayStr, 'adjClose') : null;
  const pushFlow = (date, amount) => {
    if (!date || amount === 0) return;
    flows.push({ date, amount });
    const spyAt = spyLookup ? benchmarkPriceOnDate(spyLookup, date, 'adjClose') : null;
    if (spyAt) spyShares -= amount / spyAt;
  };
  // Synthetic opening lot anchors the chart for pre-2021 holdings.
  if (holding.openingLot && holding.openingLot.costBasis > 0) {
    pushFlow(holding.openingLot.anchorDate, -holding.openingLot.costBasis);
  }
  for (const t of transactions) {
    if (!t.runDate) continue;
    if (t.classifiedAction !== 'BUY' && t.classifiedAction !== 'SELL') continue;
    if (t.amount == null || t.amount === 0) continue;
    pushFlow(t.runDate, t.amount);
  }
  if (flows.length === 0) return { cagr: null, alpha: null };
  if (holding.currentValue != null && holding.currentValue > 0.01) {
    flows.push({ date: todayStr, amount: holding.currentValue });
  }
  flows.sort((a, b) => a.date.localeCompare(b.date));
  let hp = false, hn = false;
  for (const f of flows) { if (f.amount > 0) hp = true; if (f.amount < 0) hn = true; }
  if (!hp || !hn) return { cagr: null, alpha: null };
  const fundIRR = calcIRR(flows);
  let alpha = null;
  if (spyToday != null && spyShares > 0.01) {
    const benchFlows = flows.slice(0, -1);
    benchFlows.push({ date: todayStr, amount: spyShares * spyToday });
    let bp = false, bn = false;
    for (const f of benchFlows) { if (f.amount > 0) bp = true; if (f.amount < 0) bn = true; }
    if (bp && bn) {
      const benchIRR = calcIRR(benchFlows);
      if (fundIRR != null && benchIRR != null) alpha = fundIRR - benchIRR;
    }
  }
  return { cagr: fundIRR, alpha };
}

/**
 * BrokerageLinkView — Retirement → BrokerageLink sub-page.
 *
 * Reads /api/brokerage-link, which parses the spreadsheet's "BrokerageLink"
 * tab. The tab has two stacked tables:
 *   1. Current holdings (current shares, value, cost basis from Fidelity).
 *   2. Transaction history back to 2021 (the user has been in the account
 *      since 2014, so anything pre-2021 is reconstructed as a synthetic
 *      "opening lot" per fund).
 *
 * Layout:
 *   - Header (title, as-of date, total value).
 *   - 4 scoreboard tiles: Total value, Cash, Invested, Total gain/loss.
 *   - Holdings table — symbol, qty, avg cost, cost basis, value, G/L $, G/L %.
 *     Cash (FDRXX) gets its own row labeled "Cash (FDRXX)" with no cost basis.
 *     Caveat chips render under the symbol cell when the row was reconstructed
 *     from pre-2021 data or affected by a merger / transfer / redemption.
 *   - Per-row click expands to show the most recent transactions for the
 *     fund. (Charting is intentionally deferred — adding a price-history
 *     chart here would require Yahoo/cached price data per ticker, which
 *     isn't part of this phase. The expand panel leaves a comment marking
 *     where a chart would slot in once those quotes exist.)
 */

function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}

function fmtUSDcents(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
}

function fmtQty(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(v);
}

function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '−';
  return sign + (Math.abs(v) * 100).toFixed(2) + '%';
}

function fmtSignedUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '−';
  return sign + new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Math.abs(v));
}

export default function BrokerageLinkView() {
  const { data, loading, error, refetch } = useBrokerageLink();
  const [expandedSymbol, setExpandedSymbol] = useState(null);

  // SPY benchmark for Alpha. adjClose = total return.
  const { lookup: spyLookup } = useBenchmark('SPY');
  const todayStr = new Date().toISOString().slice(0, 10);

  // Group transactions by symbol for the expandable detail row. Sorted newest
  // first so the panel reads like a recent-activity feed. Memoized so the
  // expand toggle doesn't recompute every click.
  const txnsBySymbol = useMemo(() => {
    if (!data || !Array.isArray(data.transactions)) return new Map();
    const map = new Map();
    for (const t of data.transactions) {
      const key = t.symbol;
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (b.runDate || '').localeCompare(a.runDate || ''));
    }
    return map;
  }, [data]);

  // Decorate each holding with cagr + alpha. Cash row gets nulls.
  const decorated = useMemo(() => {
    if (!data || !Array.isArray(data.holdings)) return [];
    return data.holdings.map(h => {
      const txns = txnsBySymbol.get(h.symbol) || [];
      const { cagr, alpha } = computeBLReturns(h, txns, todayStr, spyLookup);
      return { ...h, cagr, alpha };
    });
  }, [data, txnsBySymbol, spyLookup, todayStr]);

  const totals = useMemo(() => {
    if (!decorated.length) return null;
    let total = 0, cash = 0, invested = 0, costBasis = 0;
    const allFlows = [];
    let spyShadowShares = 0;
    const spyToday = spyLookup ? benchmarkPriceOnDate(spyLookup, todayStr, 'adjClose') : null;
    for (const h of decorated) {
      total += h.currentValue || 0;
      if (h.isCash) {
        cash += h.currentValue || 0;
        continue;
      }
      invested += h.currentValue || 0;
      costBasis += h.costBasisTotal || 0;
      // Combine flows for portfolio-level CAGR + Alpha.
      if (h.openingLot && h.openingLot.costBasis > 0 && h.openingLot.anchorDate) {
        const amt = -h.openingLot.costBasis;
        allFlows.push({ date: h.openingLot.anchorDate, amount: amt });
        const spyAt = spyLookup ? benchmarkPriceOnDate(spyLookup, h.openingLot.anchorDate, 'adjClose') : null;
        if (spyAt) spyShadowShares -= amt / spyAt;
      }
      const txns = txnsBySymbol.get(h.symbol) || [];
      for (const t of txns) {
        if (!t.runDate) continue;
        if (t.classifiedAction !== 'BUY' && t.classifiedAction !== 'SELL') continue;
        if (!t.amount) continue;
        allFlows.push({ date: t.runDate, amount: t.amount });
        const spyAt = spyLookup ? benchmarkPriceOnDate(spyLookup, t.runDate, 'adjClose') : null;
        if (spyAt) spyShadowShares -= t.amount / spyAt;
      }
    }
    const gain = invested - costBasis;
    const gainPct = costBasis > 0 ? gain / costBasis : null;
    let portfolioCAGR = null;
    let portfolioAlpha = null;
    if (allFlows.length > 0 && invested > 0.01) {
      const flows = [...allFlows, { date: todayStr, amount: invested }];
      flows.sort((a, b) => a.date.localeCompare(b.date));
      let hp = false, hn = false;
      for (const f of flows) { if (f.amount > 0) hp = true; if (f.amount < 0) hn = true; }
      if (hp && hn) portfolioCAGR = calcIRR(flows);
      if (spyToday != null && spyShadowShares > 0.01) {
        const benchFlows = [...allFlows, { date: todayStr, amount: spyShadowShares * spyToday }];
        benchFlows.sort((a, b) => a.date.localeCompare(b.date));
        let bp = false, bn = false;
        for (const f of benchFlows) { if (f.amount > 0) bp = true; if (f.amount < 0) bn = true; }
        if (bp && bn) {
          const spyIRR = calcIRR(benchFlows);
          if (portfolioCAGR != null && spyIRR != null) portfolioAlpha = portfolioCAGR - spyIRR;
        }
      }
    }
    return { total, cash, invested, costBasis, gain, gainPct, portfolioCAGR, portfolioAlpha };
  }, [decorated, txnsBySymbol, spyLookup, todayStr]);

  if (loading) return <div className="bl__loading">Loading BrokerageLink…</div>;
  if (error) return <div className="bl__error">Error: {error}</div>;
  if (!data || !data.holdings) return <div className="bl__loading">No BrokerageLink data.</div>;

  // Cash row last — keeps the table sorted by current value desc otherwise.
  const sortedHoldings = [...decorated].sort((a, b) => {
    if (a.isCash && !b.isCash) return 1;
    if (!a.isCash && b.isCash) return -1;
    return (b.currentValue || 0) - (a.currentValue || 0);
  });

  return (
    <div className="bl">
      <div className="bl__head">
        <div>
          <div className="bl__title">BrokerageLink</div>
          <div className="bl__subtitle">As of {data.asOfDate}</div>
        </div>
        <div className="bl__head-right">
          <Button variant="ghost" onClick={refetch}>Reload from sheet</Button>
        </div>
      </div>

      <div className="bl__scoreboard">
        <Card><Stat label="Total value" value={fmtUSD(totals?.total)} /></Card>
        <Card><Stat label="Invested" value={fmtUSD(totals?.invested)} /></Card>
        <Card><Stat label="Cash (FDRXX)" value={fmtUSD(totals?.cash)} /></Card>
        <Card>
          <Stat
            label="Total gain/loss"
            value={fmtSignedUSD(totals?.gain)}
            sub={fmtPct(totals?.gainPct)}
            tone={totals?.gain >= 0 ? 'pos' : 'neg'}
            subTone={totals?.gain >= 0 ? 'pos' : 'neg'}
          />
        </Card>
        <Card><Stat label="CAGR" value={fmtPct(totals?.portfolioCAGR)} /></Card>
        <Card><Stat label="Alpha vs SPY" value={fmtPct(totals?.portfolioAlpha)} /></Card>
      </div>

      <Card className="bl__holdings-card">
        <div className="bl__holdings-head">Holdings</div>
        <div className="bl__table-wrap">
          <table className="bl__table">
            <thead>
              <tr>
                <th className="bl__col-symbol">Symbol</th>
                <th className="bl__col-desc">Description</th>
                <th className="bl__col-num">Quantity</th>
                <th className="bl__col-num">Avg cost</th>
                <th className="bl__col-num">Cost basis</th>
                <th className="bl__col-num">Current value</th>
                <th className="bl__col-num">Gain/loss $</th>
                <th className="bl__col-num">Gain/loss %</th>
                <th className="bl__col-num" title="Money-weighted return (XIRR) over the holding's BUY/SELL cash flow stream including any pre-2021 reconstructed opening lot">CAGR</th>
                <th className="bl__col-num" title="Holding's CAGR minus SPY total-return CAGR over the same cash flow stream">Alpha vs SPY</th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map(h => {
                const isExpanded = expandedSymbol === h.symbol;
                const rowTxns = txnsBySymbol.get(h.symbol) || [];
                const canExpand = !h.isCash && rowTxns.length > 0;
                return (
                  <Fragment key={h.symbol}>
                    <tr
                      className={`bl__row ${canExpand ? 'bl__row--clickable' : ''} ${isExpanded ? 'bl__row--expanded' : ''}`}
                      onClick={() => canExpand && setExpandedSymbol(isExpanded ? null : h.symbol)}
                    >
                      <td className="bl__col-symbol">
                        <div className="bl__symbol">
                          {h.isCash ? `Cash (${h.symbol})` : h.symbol}
                        </div>
                        {h.caveats && h.caveats.length > 0 && (
                          <div className="bl__caveats">
                            {h.caveats.map((c, i) => (
                              <span key={i} className="bl__caveat-chip" title={c}>{shortCaveat(c)}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="bl__col-desc">{h.description || ''}</td>
                      <td className="bl__col-num">{h.isCash ? '—' : fmtQty(h.quantity)}</td>
                      <td className="bl__col-num">{h.isCash ? '—' : fmtUSDcents(h.averageCost)}</td>
                      <td className="bl__col-num">{h.isCash ? '—' : fmtUSD(h.costBasisTotal)}</td>
                      <td className="bl__col-num">{fmtUSD(h.currentValue)}</td>
                      <td className={`bl__col-num ${h.isCash ? '' : (h.totalGainLossDollar >= 0 ? 'bl__pos' : 'bl__neg')}`}>
                        {h.isCash ? '—' : fmtSignedUSD(h.totalGainLossDollar)}
                      </td>
                      <td className={`bl__col-num ${h.isCash ? '' : (h.totalGainLossPercent >= 0 ? 'bl__pos' : 'bl__neg')}`}>
                        {h.isCash ? '—' : fmtPct(h.totalGainLossPercent)}
                      </td>
                      <td className={`bl__col-num ${!h.isCash && h.cagr != null ? (h.cagr >= 0 ? 'bl__pos' : 'bl__neg') : ''}`}>
                        {h.isCash ? '—' : fmtPct(h.cagr)}
                      </td>
                      <td className={`bl__col-num ${!h.isCash && h.alpha != null ? (h.alpha >= 0 ? 'bl__pos' : 'bl__neg') : ''}`}>
                        {h.isCash ? '—' : fmtPct(h.alpha)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bl__expand-row">
                        <td colSpan={10}>
                          <ExpandedDetail holding={h} transactions={rowTxns} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="bl__footnote">
        History in the spreadsheet only goes back to 2021. Any pre-2021 holdings
        are reconstructed as a synthetic "opening lot" per fund — these rows are
        flagged above with the <em>pre-2021 reconstructed cost</em> chip.
        {' '}
        <strong>CAGR</strong> is money-weighted (XIRR) over the BUY/SELL cash
        flow stream, anchored to the synthetic opening lot when present.
        Reinvestments and dividends are skipped (they wash and are reflected in
        current shares × price). <strong>Alpha vs SPY</strong> = fund CAGR −
        SPY total-return CAGR over the same cash flow stream.
      </div>
    </div>
  );
}

// Compact label for the caveat chip — full text is in the title attribute on
// hover, but the chip itself stays one-line so rows don't grow unpredictably.
function shortCaveat(text) {
  if (!text) return '';
  if (/pre-2021/i.test(text)) return 'pre-2021';
  if (/transfer/i.test(text)) return 'transfer';
  if (/merger|reorg/i.test(text)) return 'merger';
  if (/redemption/i.test(text)) return 'redemption';
  return text.slice(0, 16);
}

// Per-row expand panel: most recent transactions + opening-lot summary.
//
// A price-history chart would slot in here naturally once cached price data
// is wired up — at that point, draw a Chart from openingLot.anchorDate (or
// the earliest transaction date) forward, with a vertical separator at the
// 2021 boundary so the synthetic "before" half is visually distinguishable
// from the real "after" half. Skipping the chart in this phase since the
// existing /api/prices route is keyed on Yahoo tickers and Fidelity mutual
// fund tickers (FBNDX, JAGTX, etc.) don't have reliable Yahoo coverage.
function ExpandedDetail({ holding, transactions }) {
  const recent = transactions.slice(0, 25);
  return (
    <div className="bl__expand">
      {holding.openingLot && (
        <div className="bl__opening">
          <div className="bl__opening-title">Pre-2021 reconstructed opening lot</div>
          <div className="bl__opening-grid">
            <div>
              <div className="bl__kv-label">Anchor date</div>
              <div className="bl__kv-value">{holding.openingLot.anchorDate}</div>
            </div>
            <div>
              <div className="bl__kv-label">Synthetic shares</div>
              <div className="bl__kv-value">{fmtQty(holding.openingLot.shares)}</div>
            </div>
            <div>
              <div className="bl__kv-label">Synthetic cost</div>
              <div className="bl__kv-value">{fmtUSD(holding.openingLot.costBasis)}</div>
            </div>
          </div>
          <div className="bl__opening-note">{holding.openingLot.note}</div>
        </div>
      )}

      <div className="bl__txn-title">Recent transactions ({Math.min(recent.length, transactions.length)} of {transactions.length})</div>
      <table className="bl__txn-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th className="bl__col-num">Qty</th>
            <th className="bl__col-num">Price</th>
            <th className="bl__col-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((t, i) => (
            <tr key={i}>
              <td>{t.runDate || '—'}</td>
              <td className="bl__txn-action" title={t.action}>{t.classifiedAction || 'OTHER'}</td>
              <td className="bl__col-num">{fmtQty(t.quantity)}</td>
              <td className="bl__col-num">{fmtUSDcents(t.price)}</td>
              <td className="bl__col-num">{fmtSignedUSD(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
