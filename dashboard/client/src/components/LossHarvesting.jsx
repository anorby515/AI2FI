import { useMemo } from 'react';
import { formatCurrency, formatPct, formatShares, ds, dc, taxTerm, harvestSavings } from '../utils/calculations';

export default function LossHarvesting({ openLots, quotes, selectedAccounts, taxRates, onSelectPosition }) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const allSelected = selectedAccounts.size === 0;
  const filtered = allSelected
    ? openLots
    : openLots.filter(l => selectedAccounts.has(l.account));

  // Build a map of symbol → most-recent purchase date across ALL open lots
  // Used to detect wash-sale risk (recent repurchase of the same symbol)
  const recentPurchaseMap = useMemo(() => {
    const map = {};
    for (const lot of filtered) {
      if (!map[lot.symbol] || lot.dateAcquired > map[lot.symbol]) {
        map[lot.symbol] = lot.dateAcquired;
      }
    }
    return map;
  }, [filtered]);

  const harvestable = useMemo(() => {
    const rows = [];
    for (const lot of filtered) {
      const price = quotes[lot.symbol]?.price;
      if (price == null) continue;
      const shares = ds(lot);
      const cost = dc(lot);
      const totalCost = shares * cost;
      const currentValue = shares * price;
      const loss = currentValue - totalCost;
      if (loss >= 0) continue; // only losses

      const daysHeld = Math.floor((Date.now() - new Date(lot.dateAcquired)) / (24 * 60 * 60 * 1000));
      const term = taxTerm(lot.dateAcquired, today);
      const savings = harvestSavings(loss, term, taxRates);

      // Wash sale risk: another lot of the same symbol was bought in the last 30 days
      // (if you sell this lot and another recent purchase of same symbol exists,
      //  the IRS wash-sale rule may disallow the loss)
      const mostRecentBuy = recentPurchaseMap[lot.symbol];
      const washSaleRisk = mostRecentBuy >= thirtyDaysAgo && mostRecentBuy !== lot.dateAcquired;

      rows.push({
        lot,
        symbol: lot.symbol,
        description: lot.description,
        account: lot.account,
        shares,
        costPerShare: cost,
        totalCost,
        price,
        currentValue,
        loss,
        lossPct: loss / totalCost,
        daysHeld,
        term,
        savings,
        washSaleRisk,
        dateAcquired: lot.dateAcquired,
      });
    }
    // Sort by largest loss (most negative) first
    return rows.sort((a, b) => a.loss - b.loss);
  }, [filtered, quotes, taxRates, today, thirtyDaysAgo, recentPurchaseMap]);

  const totalLoss = harvestable.reduce((s, r) => s + r.loss, 0);
  const totalSavings = harvestable.reduce((s, r) => s + (r.savings || 0), 0);
  const ltCount = harvestable.filter(r => r.term === 'long').length;
  const stCount = harvestable.filter(r => r.term === 'short').length;

  if (harvestable.length === 0) {
    const hasQuotes = openLots.some(l => quotes[l.symbol]);
    return (
      <div className="harvest-empty">
        {hasQuotes
          ? 'No open positions currently at a loss. Nothing to harvest.'
          : 'No quote data loaded. Run Sync to fetch current prices.'}
      </div>
    );
  }

  return (
    <div className="loss-harvesting">
      <div className="harvest-summary-cards">
        <HarvestCard
          label="Total Harvestable Losses"
          value={formatCurrency(totalLoss)}
          accent="negative"
          sub={`${harvestable.length} lot${harvestable.length !== 1 ? 's' : ''} · ${ltCount} LT · ${stCount} ST`}
        />
        <HarvestCard
          label="Est. Tax Savings"
          value={formatCurrency(totalSavings)}
          accent="positive"
          sub={`At ${(taxRates?.lt * 100).toFixed(1)}% LT / ${(taxRates?.st * 100).toFixed(1)}% ST`}
        />
        <HarvestCard
          label="Tax Rates"
          value={`${(taxRates?.lt * 100).toFixed(1)}% LT`}
          sub={`${(taxRates?.st * 100).toFixed(1)}% ST`}
        />
      </div>

      <div className="harvest-note">
        <strong>How to use:</strong> Selling these lots realizes a tax loss you can use to offset capital gains.
        Watch for the 30-day wash-sale window — avoid buying back the same security within 30 days before or after selling.
      </div>

      <table>
        <thead>
          <tr>
            <th style={{textAlign:'left'}}>Symbol</th>
            <th style={{textAlign:'left'}}>Description</th>
            <th style={{textAlign:'left'}}>Account</th>
            <th>Date Acq.</th>
            <th>Days Held</th>
            <th>Term</th>
            <th>Shares</th>
            <th>Cost/Share</th>
            <th>Price</th>
            <th>Loss $</th>
            <th>Loss %</th>
            <th>Est. Savings</th>
            <th>Wash Sale</th>
          </tr>
        </thead>
        <tbody>
          {harvestable.map((r, i) => (
            <tr
              key={i}
              className="clickable"
              onClick={() => onSelectPosition(r.symbol)}
            >
              <td className="symbol">{r.symbol}</td>
              <td className="desc">{r.description}</td>
              <td>{r.account}</td>
              <td style={{textAlign:'right'}}>{r.dateAcquired}</td>
              <td style={{textAlign:'right'}}>{r.daysHeld.toLocaleString()}</td>
              <td style={{textAlign:'right'}}>
                {r.term ? (
                  <span className={`term-badge ${r.term}`}>{r.term === 'long' ? 'LT' : 'ST'}</span>
                ) : '—'}
              </td>
              <td style={{textAlign:'right'}}>{formatShares(r.shares)}</td>
              <td style={{textAlign:'right'}}>{formatCurrency(r.costPerShare)}</td>
              <td style={{textAlign:'right'}}>{formatCurrency(r.price)}</td>
              <td className="negative">{formatCurrency(r.loss)}</td>
              <td className="negative">{formatPct(r.lossPct)}</td>
              <td className="positive">{r.savings != null ? formatCurrency(r.savings) : '—'}</td>
              <td>
                {r.washSaleRisk
                  ? <span className="wash-sale-badge">⚠ Recent Buy</span>
                  : <span className="wash-safe-badge">Clear</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HarvestCard({ label, value, sub, accent }) {
  return (
    <div className={`summary-card ${accent || ''}`}>
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  );
}
