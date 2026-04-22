/**
 * Gain/loss and portfolio math utilities.
 * All monetary values in USD.
 */

// Use displayShares/displayCostBasis from normalization layer, falling back to raw values
export function ds(lot) { return lot.displayShares ?? lot.sharesBought; }
export function dc(lot) { return lot.displayCostBasis ?? lot.costBasis; }

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
  if (!lot.proceeds || !lot.sharesBought || !lot.costBasis) return null;
  const cost = lot.sharesBought * lot.costBasis;
  return lot.proceeds - cost;
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
 * IRR (Internal Rate of Return) via Newton's method.
 * cashFlows: array of { date: 'YYYY-MM-DD', amount: number }
 *   - Negative amounts = money out (purchases)
 *   - Positive amounts = money in (current value, proceeds)
 * Returns annualized rate or null if can't converge.
 */
export function calcIRR(cashFlows) {
  if (!cashFlows || cashFlows.length < 2) return null;

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const t0 = new Date(cashFlows[0].date).getTime();
  const flows = cashFlows.map(cf => ({
    amount: cf.amount,
    years: (new Date(cf.date).getTime() - t0) / msPerYear,
  }));

  // Newton's method: find r where NPV(r) = 0
  let r = 0.1; // initial guess 10%
  for (let i = 0; i < 100; i++) {
    let npv = 0;
    let dnpv = 0;
    for (const f of flows) {
      const disc = Math.pow(1 + r, f.years);
      if (!isFinite(disc) || disc === 0) return null;
      npv += f.amount / disc;
      dnpv -= f.years * f.amount / (disc * (1 + r));
    }
    if (Math.abs(npv) < 0.01) return r; // converged
    if (dnpv === 0) return null;
    r -= npv / dnpv;
    if (r < -0.99) r = -0.99; // clamp to avoid divergence
    if (r > 100) r = 100;
  }
  return Math.abs(r) < 100 ? r : null; // didn't converge well
}

/**
 * Compute IRR for a set of open lots at a given current price.
 * Each lot purchase is a negative cash flow; current value is a positive terminal flow.
 */
export function calcLotsIRR(lots, currentPrice, today) {
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
  flows.sort((a, b) => a.date.localeCompare(b.date));

  return calcIRR(flows);
}

/**
 * Compute IRR for a set of closed lots using proceeds.
 */
export function calcClosedLotsIRR(lots) {
  if (!lots || lots.length === 0) return null;

  const flows = [];
  for (const lot of lots) {
    const shares = ds(lot);
    const cost = shares * dc(lot);
    if (!lot.dateAcquired || cost <= 0) continue;
    flows.push({ date: lot.dateAcquired, amount: -cost });
    if (lot.dateSold && lot.proceeds) {
      flows.push({ date: lot.dateSold, amount: lot.proceeds });
    }
  }

  if (flows.length < 2) return null;
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
      pos.totalProceeds += lot.proceeds || 0;
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
