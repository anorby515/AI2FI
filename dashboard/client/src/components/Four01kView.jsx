import { Fragment, useEffect, useMemo, useState } from 'react';
import { Card, Stat, Button } from '../ui';
import useFour01k from '../hooks/useFour01k';
import { useCurrentQuotes, useBenchmark, useHistoricalPrices, benchmarkPriceOnDate } from '../hooks/usePortfolio';
import { calcIRR } from '../utils/calculations';
import './Four01kView.css';

// Per-holding cash flow IRR (CAGR via XIRR) plus SPY-shadow alpha.
//
//   - Cash flows from the perspective of "the fund as an asset":
//       Contributions / Exchange In  → -amount  (money INTO the fund)
//       Exchange Out                 → -amount  (raw is negative → flips positive)
//       Terminal (today)             → +currentValue (omitted for closed funds
//          where currentValue = 0; the Exchange Out rows already represent
//          the proceeds, no terminal needed)
//   - Alpha = fundIRR − benchmarkIRR. Benchmark IRR uses the SAME cash flow
//     dates and amounts but replaces the terminal with the value of an
//     equivalent SPY position: each net inflow buys SPY shares at that
//     date's adjClose; each outflow sells them; final value = remaining
//     shares × today's SPY adjClose. This is the "what if you'd put the
//     same money into SPY at the same times" measurement.
//
//   Works for both open and closed positions:
//     - Open: terminal = currentValue. Standard XIRR.
//     - Closed: no terminal needed. The signed cash flows alone (with at
//       least one of each sign) determine realized IRR.
function computeReturns(transactions, currentValue, todayStr, spyLookup) {
  if (!transactions || !transactions.length) return { cagr: null, alpha: null };
  const flows = [];
  let spyShares = 0;
  const spyToday = spyLookup ? benchmarkPriceOnDate(spyLookup, todayStr, 'adjClose') : null;
  for (const t of transactions) {
    if (!t.date) continue;
    if (t.transactionType !== 'Contributions'
        && t.transactionType !== 'Exchange In'
        && t.transactionType !== 'Exchange Out') continue;
    const signed = -t.amount; // -raw: into-fund flips to outflow; out-of-fund flips to inflow
    if (signed === 0) continue;
    flows.push({ date: t.date, amount: signed });
    const spyAtDate = spyLookup ? benchmarkPriceOnDate(spyLookup, t.date, 'adjClose') : null;
    if (spyAtDate) spyShares -= signed / spyAtDate;
  }
  if (flows.length === 0) return { cagr: null, alpha: null };
  // Append terminal only when there's a meaningful currentValue. For closed
  // funds (0 shares, all cash already withdrawn via Exchange Out), the flows
  // alone are the realized return.
  const hasTerminal = currentValue != null && currentValue > 0.01;
  if (hasTerminal) flows.push({ date: todayStr, amount: currentValue });
  flows.sort((a, b) => a.date.localeCompare(b.date));
  // calcIRR needs at least one positive and one negative flow.
  let hasPos = false, hasNeg = false;
  for (const f of flows) { if (f.amount > 0) hasPos = true; if (f.amount < 0) hasNeg = true; }
  if (!hasPos || !hasNeg) return { cagr: null, alpha: null };
  const fundIRR = calcIRR(flows);
  let alpha = null;
  if (spyToday != null) {
    const benchmarkFlows = flows.slice();
    if (hasTerminal && spyShares > 0) {
      benchmarkFlows[benchmarkFlows.length - 1] = { date: todayStr, amount: spyShares * spyToday };
    } else if (!hasTerminal && spyShares > 0.01) {
      // Closed fund but the SPY shadow still has remaining shares — append
      // them as terminal so the SPY-equivalent IRR is fair.
      benchmarkFlows.push({ date: todayStr, amount: spyShares * spyToday });
    } else if (!hasTerminal && spyShares < -0.01) {
      // Negative SPY shadow shares means we sold more SPY than we bought —
      // shouldn't happen if cash flows balance, but guard anyway.
      return { cagr: fundIRR, alpha: null };
    }
    let bHasPos = false, bHasNeg = false;
    for (const f of benchmarkFlows) { if (f.amount > 0) bHasPos = true; if (f.amount < 0) bHasNeg = true; }
    if (bHasPos && bHasNeg) {
      const benchIRR = calcIRR(benchmarkFlows);
      if (fundIRR != null && benchIRR != null) alpha = fundIRR - benchIRR;
    }
  }
  return { cagr: fundIRR, alpha };
}

/**
 * Four01kView — Retirement → 401(k) sub-page.
 *
 * Reads /api/401k, which parses the spreadsheet's "401k Ledger" + "401k
 * Ticker Map" tabs. Two distinct accounts share the same fund menu:
 *   - 89551 → main 401k
 *   - 35750 → Restoration 401k
 *
 * Layout:
 *   - Header: title, as-of date, totals reload button.
 *   - Account chips: All / each account number+name. Filters the table.
 *   - Scoreboard tiles: Total balance, Total contributions, Open holdings,
 *     Closed positions count.
 *   - Holdings table: Investment, Account, Shares, Running Balance, Ticker,
 *     Proxy?, Status. Sort by accountNumber then runningBalance desc.
 *   - Click-to-expand row: ticker + proxy footnote + recent transactions.
 *     Charting is intentionally deferred — Phase 4 (BrokerageLink) deferred
 *     it for the same reason: the existing /api/prices route is keyed on
 *     Yahoo tickers and Fidelity / proxy tickers don't always have reliable
 *     coverage. The expand panel leaves a comment marking where a chart
 *     would slot in once those quotes are wired up.
 *   - Closed positions live in their own collapsible section under the open
 *     holdings — they still appear so the user can see fund history, but
 *     they don't compete for visual real estate with active positions.
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

function fmtShares(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(v);
}

function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(2)}%`;
}

export default function Four01kView() {
  const { data, loading, error, refetch } = useFour01k();
  // accountFilter is the accountNumber to scope the table to, or null for "all".
  const [accountFilter, setAccountFilter] = useState(null);
  // expandedKey is `${accountNumber}::${investment}` so the same Investment
  // across two accounts can be expanded independently.
  const [expandedKey, setExpandedKey] = useState(null);
  const [showClosed, setShowClosed] = useState(false);

  // currentValue rationale:
  //   The proxy's per-share PRICE doesn't match the actual fund's per-share
  //   NAV (e.g. VFIAX ≈ $668, but "S&P 500 STOCK INDEX" plan unit ≈ $72)
  //   even when both track the same index. Multiplying user shares × proxy
  //   price overestimates by 5–10×. Correct approach:
  //     1. Anchor on the fund's own most-recent NAV from the ledger
  //        (lastKnownNAV = amount/shares of the most recent transaction).
  //     2. Scale forward to today using the proxy's adjClose growth between
  //        lastNAVDate and today. Total-return adjustment captures
  //        reinvested dividends.
  //     currentValue = currentShares × lastKnownNAV ×
  //                    (proxy_adjClose_today / proxy_adjClose_at_lastNAVDate)
  //   For dormant funds, the proxy's growth carries the value forward; for
  //   actively-contributing funds the adjustment is small.
  const tickerSymbols = useMemo(() => {
    if (!data || !Array.isArray(data.holdings)) return [];
    const set = new Set();
    for (const h of data.holdings) {
      if (h.ticker) set.add(h.ticker);
      if (h.fallback) set.add(h.fallback);
    }
    return [...set];
  }, [data]);
  // Live quotes fetched but no longer used for currentValue (see rationale).
  // Keeping the prefetch warm so future per-share displays work without delay.
  const { fetch: fetchQuotes } = useCurrentQuotes(tickerSymbols);
  useEffect(() => {
    if (tickerSymbols.length > 0) fetchQuotes();
  }, [tickerSymbols, fetchQuotes]);

  // Historical prices for each unique proxy. Server caches 7 days.
  const histLookups = useHistoricalPrices(tickerSymbols);

  // SPY benchmark for Alpha. Uses adjClose (dividend-adjusted) so the
  // shadow position reflects total return, not just price return.
  const { lookup: spyLookup } = useBenchmark('SPY');
  const todayStr = new Date().toISOString().slice(0, 10);

  // Proxy growth factor for a holding from lastNAVDate → today, using
  // adjClose for total-return scaling. Returns null when the proxy's
  // history doesn't cover the dates (loading or coverage gap).
  function proxyGrowthFactor(h) {
    if (!h.lastNAVDate) return null;
    const lookup = (h.ticker && histLookups[h.ticker])
                || (h.fallback && histLookups[h.fallback]);
    if (!lookup) return null;
    const at = benchmarkPriceOnDate(lookup, h.lastNAVDate, 'adjClose');
    const now = benchmarkPriceOnDate(lookup, todayStr, 'adjClose');
    if (!at || !now || at <= 0) return null;
    return now / at;
  }

  // Group transactions by account+investment for the expand panel. Sorted
  // newest first. Memoized so toggling expand doesn't re-bucket each click.
  const txnsByKey = useMemo(() => {
    if (!data || !Array.isArray(data.transactions)) return new Map();
    const map = new Map();
    for (const t of data.transactions) {
      if (!t.investment || !t.account) continue;
      const key = `${t.account}::${t.investment}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }
    return map;
  }, [data]);

  // Apply the account filter to holdings before splitting open/closed and
  // computing the scoreboard. "All" → no filter.
  const visibleHoldings = useMemo(() => {
    if (!data || !Array.isArray(data.holdings)) return [];
    if (!accountFilter) return data.holdings;
    return data.holdings.filter(h => h.accountNumber === accountFilter);
  }, [data, accountFilter]);

  // Decorate each holding with currentValue (NAV-anchored × proxy growth),
  // gain, gainPct, cagr, alpha, and a closed-position-friendly displayShares.
  //
  //   Open: currentValue = currentShares × lastKnownNAV × proxyGrowth(today,
  //         lastNAVDate). cagr/alpha via XIRR over cash flows + terminal.
  //   Closed: currentValue = 0. cagr/alpha via XIRR over realized cash flows
  //         alone (the Exchange Out rows ARE the proceeds — no terminal).
  //         Negative net shares are an artifact of dividend reinvestments
  //         that never appear as ledger rows; we display 0 instead.
  const decorated = useMemo(() => {
    return visibleHoldings.map(h => {
      const sharesForDisplay = h.isOpen ? h.currentShares : 0;
      let currentValue = null;
      if (h.isOpen && h.snapshot && Number.isFinite(h.snapshot.currentValue)) {
        // Preferred path: Fidelity-export snapshot from the 401k Ledger top
        // table. Exact and fresh — beats NAV-anchor + proxy growth.
        currentValue = h.snapshot.currentValue;
      } else if (h.isOpen && h.lastKnownNAV != null && h.currentShares > 0) {
        const factor = proxyGrowthFactor(h);
        const adjustedNAV = factor != null ? h.lastKnownNAV * factor : h.lastKnownNAV;
        currentValue = h.currentShares * adjustedNAV;
      } else if (!h.isOpen) {
        currentValue = 0;
      }
      // Cost basis on closed funds isn't meaningful (shares=0). For closed
      // funds, "Realized gain" = -costBasis (positive when net cash out > in).
      const gain = h.isOpen
        ? (currentValue != null ? currentValue - h.costBasis : null)
        : -h.costBasis;
      const gainPct = (h.isOpen && currentValue != null && h.costBasis > 0)
        ? gain / h.costBasis
        : null;
      const key = `${h.accountNumber}::${h.investment}`;
      const txns = txnsByKey.get(key) || [];
      const { cagr, alpha } = computeReturns(
        txns,
        h.isOpen ? currentValue : 0,
        todayStr,
        spyLookup
      );
      return {
        ...h,
        sharesForDisplay,
        currentValue,
        gain,
        gainPct,
        cagr,
        alpha,
      };
    });
  // proxyGrowthFactor closes over histLookups — re-derive when it changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleHoldings, histLookups, spyLookup, txnsByKey, todayStr]);

  const openHoldings = useMemo(() => decorated.filter(h => h.isOpen), [decorated]);
  const closedHoldings = useMemo(() => decorated.filter(h => !h.isOpen), [decorated]);

  const totals = useMemo(() => {
    let valueSum = 0;
    let valueComplete = true;
    let costSum = 0;
    let contribSum = 0;
    for (const h of decorated) {
      costSum += h.costBasis || 0;
      contribSum += h.totalContributions || 0;
      if (h.isOpen) {
        if (h.currentValue != null) {
          valueSum += h.currentValue;
        } else if (h.lastKnownNAV != null) {
          valueComplete = false; // anchorable holding without proxy history loaded yet
        }
      }
    }
    // Portfolio-level CAGR + Alpha. Combine cash flows from ALL visible
    // holdings (across both accounts when filter is null) and append the
    // total currentValue as terminal. This is the dollar-weighted return on
    // the user's overall 401k contribution stream.
    const allFlows = [];
    let spyShadowShares = 0;
    const spyToday = spyLookup ? benchmarkPriceOnDate(spyLookup, todayStr, 'adjClose') : null;
    for (const h of decorated) {
      const key = `${h.accountNumber}::${h.investment}`;
      const txns = txnsByKey.get(key) || [];
      for (const t of txns) {
        if (!t.date) continue;
        if (t.transactionType !== 'Contributions'
            && t.transactionType !== 'Exchange In'
            && t.transactionType !== 'Exchange Out') continue;
        const signed = -t.amount;
        if (signed === 0) continue;
        allFlows.push({ date: t.date, amount: signed });
        const spyAt = spyLookup ? benchmarkPriceOnDate(spyLookup, t.date, 'adjClose') : null;
        if (spyAt) spyShadowShares -= signed / spyAt;
      }
    }
    let portfolioCAGR = null;
    let portfolioAlpha = null;
    if (allFlows.length > 0 && valueSum > 0.01) {
      // Inter-fund Exchange In / Exchange Out cancel at the portfolio level
      // (they're net-zero across both sides). Including them is harmless but
      // adds noise; calcIRR converges either way. Sort and run.
      const flowsWithTerminal = [...allFlows, { date: todayStr, amount: valueSum }];
      flowsWithTerminal.sort((a, b) => a.date.localeCompare(b.date));
      let hp = false, hn = false;
      for (const f of flowsWithTerminal) { if (f.amount > 0) hp = true; if (f.amount < 0) hn = true; }
      if (hp && hn) portfolioCAGR = calcIRR(flowsWithTerminal);
      if (spyToday != null) {
        // SPY shadow: same flows, but final value is shadow-SPY shares × today's adjClose.
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
    return {
      currentValue: valueSum,
      currentValueComplete: valueComplete,
      costBasis: costSum,
      contributions: contribSum,
      openCount: openHoldings.length,
      closedCount: closedHoldings.length,
      portfolioCAGR,
      portfolioAlpha,
    };
  }, [decorated, openHoldings, closedHoldings, txnsByKey, spyLookup, todayStr]);

  if (loading) return <div className="f401k__loading">Loading 401(k)…</div>;
  if (error) return <div className="f401k__error">Error: {error}</div>;
  if (!data || !data.holdings) return <div className="f401k__loading">No 401(k) data.</div>;

  const accounts = data.accounts || [];

  return (
    <div className="f401k">
      <div className="f401k__head">
        <div>
          <div className="f401k__title">401(k)</div>
          <div className="f401k__subtitle">As of {data.asOfDate}</div>
        </div>
        <div className="f401k__head-right">
          <Button variant="ghost" onClick={refetch}>Reload from sheet</Button>
        </div>
      </div>

      <div className="f401k__chips">
        <button
          className={`f401k__chip ${accountFilter == null ? 'f401k__chip--active' : ''}`}
          onClick={() => setAccountFilter(null)}
        >
          All accounts
        </button>
        {accounts.map(a => (
          <button
            key={a.accountNumber}
            className={`f401k__chip ${accountFilter === a.accountNumber ? 'f401k__chip--active' : ''}`}
            onClick={() => setAccountFilter(a.accountNumber)}
          >
            <span className="f401k__chip-name">{a.accountName}</span>
            <span className="f401k__chip-num">#{a.accountNumber}</span>
          </button>
        ))}
      </div>

      <div className="f401k__scoreboard">
        <Card><Stat label="Current value" value={`${fmtUSD(totals.currentValue)}${totals.currentValueComplete ? '' : '*'}`} /></Card>
        <Card><Stat label="Cost basis" value={fmtUSD(totals.costBasis)} /></Card>
        <Card><Stat label="CAGR" value={fmtPct(totals.portfolioCAGR)} /></Card>
        <Card><Stat label="Alpha vs SPY" value={fmtPct(totals.portfolioAlpha)} /></Card>
        <Card><Stat label="Open holdings" value={String(totals.openCount)} /></Card>
        <Card><Stat label="Closed positions" value={String(totals.closedCount)} /></Card>
      </div>

      {data.tickerMapWarnings && data.tickerMapWarnings.length > 0 && (
        <div className="f401k__warnings">
          <div className="f401k__warnings-title">Ticker map warnings</div>
          {data.tickerMapWarnings.map((w, i) => (
            <div key={i} className="f401k__warning">{w}</div>
          ))}
        </div>
      )}

      <Card className="f401k__holdings-card">
        <div className="f401k__holdings-head">Open holdings ({openHoldings.length})</div>
        {openHoldings.length === 0 ? (
          <div className="f401k__empty">No open holdings in this view.</div>
        ) : (
          <HoldingsTable
            mode="open"
            holdings={openHoldings}
            txnsByKey={txnsByKey}
            expandedKey={expandedKey}
            setExpandedKey={setExpandedKey}
          />
        )}
      </Card>

      <Card className="f401k__holdings-card">
        <button
          className="f401k__closed-toggle"
          onClick={() => setShowClosed(s => !s)}
        >
          <span>{showClosed ? '▾' : '▸'}</span> Closed positions ({closedHoldings.length})
        </button>
        {showClosed && closedHoldings.length > 0 && (
          <HoldingsTable
            mode="closed"
            holdings={closedHoldings}
            txnsByKey={txnsByKey}
            expandedKey={expandedKey}
            setExpandedKey={setExpandedKey}
          />
        )}
      </Card>

      <div className="f401k__footnote">
        <strong>Current value</strong> is anchored on the fund's most recent
        per-share NAV from the ledger and scaled forward to today using the
        proxy ticker's adjClose growth (total return, includes reinvested
        dividends). For dormant funds the proxy carries the value forward;
        for actively-contributing funds the adjustment is small. <strong>Cost
        basis</strong> = net cash put into the fund (Contributions + Exchange
        In − Exchange Out); on closed funds, parentheses denote net cash OUT
        of the fund (realized gain). <strong>CAGR</strong> is money-weighted
        (XIRR) over the fund's actual contribution stream — works for both
        open and closed positions. <strong>Alpha vs SPY</strong> = fund CAGR
        − SPY total-return CAGR over the same cash flow dates (i.e. "what
        if every dollar had gone into SPY instead?"). Investments tagged
        <em>proxy</em> use a public-market ticker as a stand-in for an
        untradable CIT or unitized fund. An asterisk on the Current value
        tile means at least one fund's proxy history is still loading.
        Closed funds may show negative net shares from accumulated
        reinvested-dividend artifacts in the ledger; we display 0.
      </div>
    </div>
  );
}

// mode='open'   → 11 cols: Investment, Account, Shares, Current value, Cost basis,
//                            Gain, Gain %, CAGR, Alpha, Ticker, Proxy?
// mode='closed' →  8 cols: Investment, Account,
//                            Gain, Gain %, CAGR, Alpha, Ticker, Proxy?
//   Status, Shares, Current value, and Cost basis are dropped for closed —
//   shares=0 by definition, current value=0, and cost basis is meaningless
//   (the surfaced "Gain" already shows realized gain).
function HoldingsTable({ mode, holdings, txnsByKey, expandedKey, setExpandedKey }) {
  const isOpenMode = mode === 'open';
  const colCount = isOpenMode ? 11 : 8;
  return (
    <div className="f401k__table-wrap">
      <table className="f401k__table">
        <thead>
          <tr>
            <th className="f401k__col-inv">Investment</th>
            <th className="f401k__col-acct">Account</th>
            {isOpenMode && <th className="f401k__col-num">Shares</th>}
            {isOpenMode && <th className="f401k__col-num">Current value</th>}
            {isOpenMode && <th className="f401k__col-num">Cost basis</th>}
            <th className="f401k__col-num">Gain</th>
            <th className="f401k__col-num">Gain %</th>
            <th className="f401k__col-num" title="Money-weighted return (XIRR) over the holding's own contribution history">CAGR</th>
            <th className="f401k__col-num" title="Holding's CAGR minus SPY total-return CAGR over the same cash flow stream">Alpha vs SPY</th>
            <th className="f401k__col-ticker">Ticker</th>
            <th className="f401k__col-proxy">Proxy?</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => {
            const key = `${h.accountNumber}::${h.investment}`;
            const isExpanded = expandedKey === key;
            const rowTxns = txnsByKey.get(key) || [];
            const canExpand = rowTxns.length > 0;
            return (
              <Fragment key={key}>
                <tr
                  className={`f401k__row ${canExpand ? 'f401k__row--clickable' : ''} ${isExpanded ? 'f401k__row--expanded' : ''}`}
                  onClick={() => canExpand && setExpandedKey(isExpanded ? null : key)}
                >
                  <td className="f401k__col-inv">
                    <div className="f401k__inv-name">{h.investment}</div>
                    {h.notes && <div className="f401k__inv-note">{h.notes}</div>}
                  </td>
                  <td className="f401k__col-acct">
                    <div className="f401k__acct-name">{h.accountName}</div>
                    <div className="f401k__acct-num">#{h.accountNumber}</div>
                  </td>
                  {isOpenMode && (
                    <td className="f401k__col-num">{fmtShares(h.sharesForDisplay)}</td>
                  )}
                  {isOpenMode && (
                    <td className="f401k__col-num">
                      {h.currentValue != null ? fmtUSD(h.currentValue) :
                        h.lastKnownNAV != null ? <span className="f401k__loading-cell">…</span> : '—'}
                    </td>
                  )}
                  {isOpenMode && (
                    <td className="f401k__col-num" title="Net cash put into the fund">
                      {fmtUSD(h.costBasis)}
                    </td>
                  )}
                  <td className={`f401k__col-num ${h.gain != null && h.gain >= 0 ? 'f401k__gain-pos' : h.gain != null ? 'f401k__gain-neg' : ''}`}>
                    {h.gain != null ? fmtUSD(h.gain) : '—'}
                  </td>
                  <td className={`f401k__col-num ${h.gainPct != null && h.gainPct >= 0 ? 'f401k__gain-pos' : h.gainPct != null ? 'f401k__gain-neg' : ''}`}>
                    {fmtPct(h.gainPct)}
                  </td>
                  <td className={`f401k__col-num ${h.cagr != null && h.cagr >= 0 ? 'f401k__gain-pos' : h.cagr != null ? 'f401k__gain-neg' : ''}`}>
                    {fmtPct(h.cagr)}
                  </td>
                  <td className={`f401k__col-num ${h.alpha != null && h.alpha >= 0 ? 'f401k__gain-pos' : h.alpha != null ? 'f401k__gain-neg' : ''}`}>
                    {fmtPct(h.alpha)}
                  </td>
                  <td className="f401k__col-ticker">
                    {h.ticker ? (
                      <span className="f401k__ticker">{h.ticker}</span>
                    ) : (
                      <span className="f401k__ticker--missing">—</span>
                    )}
                    {h.fallback && (
                      <span className="f401k__fallback" title={`Fallback ticker: ${h.fallback}`}>
                        ↪ {h.fallback}
                      </span>
                    )}
                  </td>
                  <td className="f401k__col-proxy">
                    {h.proxy ? <span className="f401k__proxy-chip">proxy</span> : <span className="f401k__proxy-no">—</span>}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="f401k__expand-row">
                    <td colSpan={colCount}>
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
  );
}

// Per-row expand panel: ticker resolution + recent transactions.
//
// CHART SLOT: a price-history sparkline would render here once the
// /api/prices route reliably covers Fidelity/proxy tickers. Behavior should
// match BrokerageLinkView's deferred chart plan:
//   - chartable && !proxy → normal sparkline
//   - chartable && proxy → sparkline with a "proxy" badge + notes footnote
//   - !chartable → no chart, ledger numbers only
function ExpandedDetail({ holding, transactions }) {
  const recent = transactions.slice(0, 25);
  return (
    <div className="f401k__expand">
      <div className="f401k__expand-grid">
        <div>
          <div className="f401k__kv-label">Ticker</div>
          <div className="f401k__kv-value">
            {holding.ticker || '—'}
            {holding.proxy && <span className="f401k__proxy-chip f401k__proxy-chip--inline">proxy</span>}
          </div>
        </div>
        {holding.fallback && (
          <div>
            <div className="f401k__kv-label">Fallback</div>
            <div className="f401k__kv-value">{holding.fallback}</div>
          </div>
        )}
        <div>
          <div className="f401k__kv-label">First transaction</div>
          <div className="f401k__kv-value">{holding.firstTransactionDate || '—'}</div>
        </div>
        <div>
          <div className="f401k__kv-label">Last transaction</div>
          <div className="f401k__kv-value">{holding.lastTransactionDate || '—'}</div>
        </div>
      </div>
      {holding.proxy && holding.notes && (
        <div className="f401k__proxy-note">{holding.notes}</div>
      )}

      <div className="f401k__txn-title">
        Recent transactions ({Math.min(recent.length, transactions.length)} of {transactions.length})
      </div>
      <table className="f401k__txn-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th className="f401k__col-num">Shares</th>
            <th className="f401k__col-num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((t, i) => (
            <tr key={i}>
              <td>{t.date || '—'}</td>
              <td className="f401k__txn-type">{t.transactionType}</td>
              <td className="f401k__col-num">{fmtShares(t.shares)}</td>
              <td className="f401k__col-num">{fmtUSDcents(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
