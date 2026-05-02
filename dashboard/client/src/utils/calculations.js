/**
 * Gain/loss and portfolio math utilities.
 * All monetary values in USD.
 */

// Use displayShares/displayCostBasis from normalization layer, falling back to raw values
export function ds(lot) { return lot.displayShares ?? lot.sharesBought; }
export function dc(lot) { return lot.displayCostBasis ?? lot.costBasis; }

// Lot proceeds derived from per-share Sell Basis × Shares Sold so the rest
// of the app doesn't depend on the spreadsheet's Proceeds column. Falls back
// to lot.proceeds (legacy) when sellBasis is missing.
export function lotProceeds(lot) {
  if (lot.sellBasis != null && lot.sharesSold != null) {
    return lot.sellBasis * lot.sharesSold;
  }
  return lot.proceeds || 0;
}

export function totalCostBasis(lots) {
  return lots.reduce((sum, l) => sum + ds(l) * dc(l), 0);
}

export function currentValue(lots, quotes) {
  return lots.reduce((sum, l) => {
    const q = quotes[l.symbol];
    if (!q) return sum;
    return sum + ds(l) * q.price;
  }, 0);
}

export function gainLoss(cost, value) {
  return value - cost;
}

export function gainLossPct(cost, value) {
  if (cost === 0) return 0;
  return (value - cost) / cost;
}

export function realizedGain(lot) {
  const proceeds = lotProceeds(lot);
  if (!proceeds || !lot.sharesBought || !lot.costBasis) return null;
  const cost = lot.sharesBought * lot.costBasis;
  return proceeds - cost;
}

export function formatCurrency(val) {
  if (val == null || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

export function formatPct(val) {
  if (val == null || isNaN(val)) return '—';
  return (val * 100).toFixed(2) + '%';
}

export function formatNumber(val, decimals = 4) {
  if (val == null || isNaN(val)) return '—';
  return val.toFixed(decimals);
}

export function formatShares(val) {
  if (val == null || isNaN(val)) return '—';
  if (Number.isInteger(val)) return String(val);
  return String(parseFloat(val.toFixed(2)));
}

// Tax term: 'long' if held >= 1 year, 'short' otherwise
export function taxTerm(dateAcquired, endDate) {
  if (!dateAcquired || !endDate) return null;
  const ms = new Date(endDate) - new Date(dateAcquired);
  return ms >= 365.25 * 24 * 60 * 60 * 1000 ? 'long' : 'short';
}

// Default rates: 23.8% LT (20% cap gains + 3.8% NIIT), 40.8% ST (37% + 3.8%)
export const DEFAULT_TAX_RATES = { lt: 0.238, st: 0.408 };

// Estimated tax on a gain (returns null for losses — losses are tax savings, shown separately)
export function estimatedTax(gain, term, rates = DEFAULT_TAX_RATES) {
  if (gain == null || gain <= 0 || !term) return null;
  return gain * (term === 'long' ? rates.lt : rates.st);
}

// Estimated tax savings from harvesting a loss
export function harvestSavings(loss, term, rates = DEFAULT_TAX_RATES) {
  if (loss == null || loss >= 0 || !term) return null;
  return Math.abs(loss) * (term === 'long' ? rates.lt : rates.st);
}

// CAGR: (endValue / startValue) ^ (1/years) - 1
// Use for single-lot returns. For multi-lot, use calcIRR instead.
export function calcCAGR(startValue, endValue, startDate, endDate) {
  if (!startValue || startValue <= 0 || !endValue || endValue <= 0) return null;
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = (new Date(endDate) - new Date(startDate)) / msPerYear;
  if (years <= 0) return null;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * IRR (Internal Rate of Return).
 * cashFlows: array of { date: 'YYYY-MM-DD', amount: number }
 *   - Negative amounts = money out (purchases)
 *   - Positive amounts = money in (current value, proceeds, dividends)
 * Returns annualized rate or null if a root can't be located.
 *
 * Strategy: try Newton's method first (fast); if it diverges or converges to
 * a non-root, fall back to bisection over [-0.99, 100]. This matters once
 * dividends and re-buys are folded in — the resulting NPV curve can have
 * multiple sign changes, on which Newton can climb to the upper clamp.
 */
export function calcIRR(cashFlows) {
  if (!cashFlows || cashFlows.length < 2) return null;

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const t0 = new Date(cashFlows[0].date).getTime();
  const flows = cashFlows.map(cf => ({
    amount: cf.amount,
    years: (new Date(cf.date).getTime() - t0) / msPerYear,
  }));

  const grossFlow = flows.reduce((s, f) => s + Math.abs(f.amount), 0);
  // Relative tolerance — absolute $0.01 is too tight for large portfolios.
  const tol = Math.max(0.01, grossFlow * 1e-6);

  function npvAt(r) {
    let npv = 0;
    for (const f of flows) {
      const disc = Math.pow(1 + r, f.years);
      if (!isFinite(disc) || disc === 0) return NaN;
      npv += f.amount / disc;
    }
    return npv;
  }

  // Newton's method
  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    let npv = 0, dnpv = 0;
    for (const f of flows) {
      const disc = Math.pow(1 + r, f.years);
      if (!isFinite(disc) || disc === 0) { r = NaN; break; }
      npv += f.amount / disc;
      dnpv -= f.years * f.amount / (disc * (1 + r));
    }
    if (!isFinite(r)) break;
    if (Math.abs(npv) < tol) return r;
    if (dnpv === 0) break;
    const next = r - npv / dnpv;
    if (!isFinite(next) || next <= -0.99 || next >= 100) break; // bail to bisection
    r = next;
  }

  // Bisection fallback — scan for a sign change and converge.
  const lo0 = -0.9999, hi0 = 100;
  let fLo = npvAt(lo0);
  let fHi = npvAt(hi0);
  if (!isFinite(fLo) || !isFinite(fHi)) return null;
  if (fLo * fHi > 0) {
    // No sign change at endpoints — sweep for one
    let prevR = lo0, prevF = fLo;
    let found = false;
    const steps = 200;
    for (let i = 1; i <= steps; i++) {
      const rr = lo0 + (hi0 - lo0) * (i / steps);
      const ff = npvAt(rr);
      if (!isFinite(ff)) continue;
      if (prevF * ff < 0) {
        fLo = prevF; fHi = ff;
        // bisect within [prevR, rr]
        let lo = prevR, hi = rr;
        for (let j = 0; j < 80; j++) {
          const mid = (lo + hi) / 2;
          const fm = npvAt(mid);
          if (!isFinite(fm)) return null;
          if (Math.abs(fm) < tol) return mid;
          if (fLo * fm < 0) { hi = mid; fHi = fm; }
          else { lo = mid; fLo = fm; }
        }
        return (lo + hi) / 2;
      }
      prevR = rr; prevF = ff;
    }
    if (!found) return null;
  }
  // Standard bisection on [lo0, hi0]
  let lo = lo0, hi = hi0;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fm = npvAt(mid);
    if (!isFinite(fm)) return null;
    if (Math.abs(fm) < tol) return mid;
    if (fLo * fm < 0) { hi = mid; fHi = fm; }
    else { lo = mid; fLo = fm; }
  }
  return (lo + hi) / 2;
}

// --- Dividends ---

// A lot is "holding shares on ex-date" if it was acquired by then AND either
// is still open or was sold strictly after the ex-date. Uses raw sharesBought
// to match historical (un-split-adjusted) per-share dividend amounts from Yahoo.
function sharesHeldOnExDate(lot, exDate) {
  if (!lot.dateAcquired || lot.dateAcquired > exDate) return 0;
  if (lot.transaction === 'Open') return lot.sharesBought || 0;
  if (lot.dateSold && lot.dateSold > exDate) return lot.sharesBought || 0;
  return 0;
}

/**
 * Build positive cash flows from dividends actually received by these lots.
 * dividendEvents: [{ date, dividend }] (per-share amounts at ex-date).
 * Returns one flow per ex-date with non-zero held shares.
 */
export function dividendCashFlows(lots, dividendEvents) {
  if (!dividendEvents || !dividendEvents.length || !lots || !lots.length) return [];
  const flows = [];
  for (const div of dividendEvents) {
    const exDate = div.date;
    const perShare = div.dividend ?? div.adjDividend ?? 0;
    if (!exDate || !perShare) continue;
    let shares = 0;
    for (const lot of lots) shares += sharesHeldOnExDate(lot, exDate);
    if (shares > 0) flows.push({ date: exDate, amount: shares * perShare });
  }
  return flows;
}

/**
 * Total dollars of dividends received across these lots, lifetime.
 */
export function lifetimeDividends(lots, dividendEvents) {
  if (!dividendEvents || !dividendEvents.length || !lots || !lots.length) return 0;
  let total = 0;
  for (const div of dividendEvents) {
    const exDate = div.date;
    const perShare = div.dividend ?? div.adjDividend ?? 0;
    if (!exDate || !perShare) continue;
    let shares = 0;
    for (const lot of lots) shares += sharesHeldOnExDate(lot, exDate);
    total += shares * perShare;
  }
  return total;
}

// dividendEvents map: { [SYMBOL]: [{date, dividend}, ...] }
export function dividendCashFlowsForSymbols(lots, dividendEvents) {
  if (!dividendEvents) return [];
  const bySym = {};
  for (const lot of lots) {
    if (!bySym[lot.symbol]) bySym[lot.symbol] = [];
    bySym[lot.symbol].push(lot);
  }
  const all = [];
  for (const sym in bySym) {
    const events = dividendEvents[sym];
    if (!events) continue;
    all.push(...dividendCashFlows(bySym[sym], events));
  }
  return all;
}

export function lifetimeDividendsForSymbols(lots, dividendEvents) {
  if (!dividendEvents) return 0;
  const bySym = {};
  for (const lot of lots) {
    if (!bySym[lot.symbol]) bySym[lot.symbol] = [];
    bySym[lot.symbol].push(lot);
  }
  let total = 0;
  for (const sym in bySym) {
    const events = dividendEvents[sym];
    if (!events) continue;
    total += lifetimeDividends(bySym[sym], events);
  }
  return total;
}

/**
 * Compute IRR for a set of open lots at a given current price.
 * Each lot purchase is a negative cash flow; current value is a positive terminal flow.
 * Optional dividendEvents: per-share events for the lots' symbol (single-symbol)
 * — folded in as positive flows on ex-dates for shares held.
 */
export function calcLotsIRR(lots, currentPrice, today, dividendEvents = null) {
  if (!lots || lots.length === 0 || currentPrice == null) return null;

  const flows = [];
  let totalCurrentValue = 0;

  for (const lot of lots) {
    const shares = ds(lot);
    const cost = shares * dc(lot);
    if (!lot.dateAcquired || cost <= 0) continue;
    flows.push({ date: lot.dateAcquired, amount: -cost });
    totalCurrentValue += shares * currentPrice;
  }

  if (flows.length === 0 || totalCurrentValue <= 0) return null;
  flows.push({ date: today, amount: totalCurrentValue });
  if (dividendEvents) flows.push(...dividendCashFlows(lots, dividendEvents));
  flows.sort((a, b) => a.date.localeCompare(b.date));

  return calcIRR(flows);
}

/**
 * Compute IRR for a set of closed lots using proceeds.
 */
export function calcClosedLotsIRR(lots, dividendEvents = null) {
  if (!lots || lots.length === 0) return null;

  const flows = [];
  for (const lot of lots) {
    const shares = ds(lot);
    const cost = shares * dc(lot);
    if (!lot.dateAcquired || cost <= 0) continue;
    flows.push({ date: lot.dateAcquired, amount: -cost });
    const proceeds = lotProceeds(lot);
    if (lot.dateSold && proceeds) {
      flows.push({ date: lot.dateSold, amount: proceeds });
    }
  }

  if (flows.length < 2) return null;
  if (dividendEvents) flows.push(...dividendCashFlows(lots, dividendEvents));
  flows.sort((a, b) => a.date.localeCompare(b.date));

  return calcIRR(flows);
}

/**
 * Compute SPY benchmark IRR: what if each lot's cost had been invested in SPY instead?
 * Works for both open lots (using current SPY price) and closed lots (using SPY price at sale date).
 * benchmarkFn: (dateStr) => price  (e.g. benchmarkPriceOnDate bound to lookup)
 */
export function calcBenchmarkIRR(lots, benchmarkFn, today, currentPrice = null) {
  if (!lots || lots.length === 0 || !benchmarkFn) return null;

  const flows = [];
  let terminalValue = 0;
  const spyToday = benchmarkFn(today);

  for (const lot of lots) {
    const cost = ds(lot) * dc(lot);
    if (!lot.dateAcquired || cost <= 0) continue;
    const isOpen = lot.transaction === 'Open';
    const endDate = isOpen ? today : lot.dateSold;
    if (!endDate) continue;

    const spyAtBuy = benchmarkFn(lot.dateAcquired);
    const spyAtEnd = isOpen ? spyToday : benchmarkFn(endDate);
    if (!spyAtBuy || !spyAtEnd) continue;

    flows.push({ date: lot.dateAcquired, amount: -cost });

    if (isOpen) {
      terminalValue += cost * (spyAtEnd / spyAtBuy);
    } else {
      // For closed lots, the SPY "proceeds" at the sale date
      flows.push({ date: endDate, amount: cost * (spyAtEnd / spyAtBuy) });
    }
  }

  if (flows.length < 1) return null;
  if (terminalValue > 0) flows.push({ date: today, amount: terminalValue });
  flows.sort((a, b) => a.date.localeCompare(b.date));

  return calcIRR(flows);
}

// Group ALL lots by symbol (open + closed), with separate tracking
export function aggregateAllBySymbol(lots) {
  const map = {};
  for (const lot of lots) {
    if (!map[lot.symbol]) {
      map[lot.symbol] = {
        symbol: lot.symbol,
        description: lot.description,
        accounts: new Set(),
        openShares: 0,
        openCost: 0,
        openLots: [],
        closedLots: [],
        allLots: [],
        totalProceeds: 0,
        totalClosedCost: 0,
      };
    }
    const pos = map[lot.symbol];
    pos.accounts.add(lot.account);
    pos.allLots.push(lot);

    if (lot.transaction === 'Open') {
      pos.openShares += ds(lot);
      pos.openCost += ds(lot) * dc(lot);
      pos.openLots.push(lot);
    } else {
      pos.closedLots.push(lot);
      pos.totalProceeds += lotProceeds(lot);
      pos.totalClosedCost += ds(lot) * dc(lot);
    }
  }

  return Object.values(map).map(pos => ({
    ...pos,
    accounts: Array.from(pos.accounts),
    avgCostBasis: pos.openShares > 0 ? pos.openCost / pos.openShares : 0,
    realizedGainLoss: pos.totalProceeds - pos.totalClosedCost,
  }));
}

// Group open lots by symbol, computing aggregate position
export function aggregateOpenBySymbol(lots) {
  const map = {};
  for (const lot of lots) {
    if (lot.transaction !== 'Open') continue;
    if (!map[lot.symbol]) {
      map[lot.symbol] = {
        symbol: lot.symbol,
        description: lot.description,
        accounts: new Set(),
        totalShares: 0,
        totalCost: 0,
        lots: [],
      };
    }
    const pos = map[lot.symbol];
    pos.accounts.add(lot.account);
    pos.totalShares += ds(lot);
    pos.totalCost += ds(lot) * dc(lot);
    pos.lots.push(lot);
  }

  return Object.values(map).map(pos => ({
    ...pos,
    accounts: Array.from(pos.accounts),
    avgCostBasis: pos.totalCost / pos.totalShares,
  }));
}
