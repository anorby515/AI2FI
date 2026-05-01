import { Fragment, useMemo, useState } from 'react';
import { Card, Stat, Button } from '../ui';
import { usePortfolio, useMoatSummaries } from '../hooks/usePortfolio';
import {
  ds, dc, lotProceeds, taxTerm, harvestSavings, estimatedTax,
  formatCurrency, formatPct, DEFAULT_TAX_RATES,
} from '../utils/calculations';
import './TaxHarvesting.css';

/**
 * Tax-Harvesting tool — Brokerage-only.
 *
 * Plan table walks through:
 *   [REALIZED]        — closed lots from this year
 *   [HARVEST OPTIONS] — open lots ordered by an interleaved strategy:
 *                         Phase 1 — drop to -$3,000 with losses (ST→LT, biggest first)
 *                         Phase 2 — add largest LT gain, refill losses back to -$3K, repeat
 *                         Phase 3 — any remaining losses (carry-forward)
 *                       Rows whose effective gain is $0 (shares-to-sell = 0) sit at
 *                       the end in their natural potential-gain order.
 *
 * Every option row has editable Shares-to-Sell and Share-Price inputs, plus a
 * checkbox that flips Shares-to-Sell between 0 and the full-lot total. Editing
 * either input re-runs the order over effective-gain values.
 *
 * Owner and account filters are multi-selectable chips above the table.
 */

const ORD_LOSS_LIMIT = -3000;        // IRS net cap-loss offset against ordinary income
const VIEW_CAP = 10000;              // -$10K display cap on the loss side
const MATURITY_WINDOW_DAYS = 90;     // open ST lots that turn LT within this window
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntilLT(dateAcquired, today = new Date()) {
  if (!dateAcquired) return null;
  const acq = new Date(dateAcquired);
  const lt = new Date(acq.getTime() + 365.25 * MS_PER_DAY);
  return Math.ceil((lt - today) / MS_PER_DAY);
}

function startOfYear() {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

// Stable per-lot key for selection state. Composite to handle multiple lots
// with the same symbol on the same date in the same account.
function lotKey(r) {
  return [r.symbol, r.account, r.owner || '', r.dateAcquired, r.shares, r.costPerShare].join('|');
}

// Pull effective shares-to-sell / price / gain from the row + override map.
function effective(row, overrides) {
  const o = overrides.get(lotKey(row));
  const sharesToSell = o?.sharesToSell ?? row.shares;
  const price        = o?.price        ?? row.price;
  const gl           = sharesToSell * (price - row.costPerShare);
  return { sharesToSell, price, gl };
}

// Interleaved harvest-order algorithm. Order is decided by each lot's
// **potential** gain (full-lot at current price) so a row's position is
// stable across edits — toggling Shares to Sell to 0 leaves the row in
// place and just zeros its contribution. The running-total accumulator
// uses **effective** gain (shares-to-sell × (price − cost)).
function buildHarvestOrder(rows, ytdNet, target = ORD_LOSS_LIMIT) {
  // Pure Gain % ranking — no term preference. Cross-netting (ST gain vs.
  // LT loss, etc.) means term doesn't change this year's tax outcome, so
  // we order purely by depth of percentage move.
  const losses = rows.filter(r => r.potentialGL < 0).slice().sort(
    (a, b) => a.potentialGLPct - b.potentialGLPct                // most negative % first
  );
  const gains = rows.filter(r => r.potentialGL >= 0).slice().sort(
    (a, b) => b.potentialGLPct - a.potentialGLPct                // largest % first
  );

  let current = ytdNet;
  const order = [];

  // Phase 1 — drop to target with losses (or exhaust losses).
  while (losses.length > 0 && current > target) {
    const loss = losses.shift();
    order.push(loss);
    current += loss.effectiveGL;
  }

  // Phase 2 — interleave: add largest gain, refill losses back to target.
  while (gains.length > 0) {
    const gain = gains.shift();
    order.push(gain);
    current += gain.effectiveGL;
    while (losses.length > 0 && current > target) {
      const loss = losses.shift();
      order.push(loss);
      current += loss.effectiveGL;
    }
  }

  // Phase 3 — any remaining losses (carry-forward).
  while (losses.length > 0) {
    const loss = losses.shift();
    order.push(loss);
    current += loss.effectiveGL;
  }

  return order;
}

export default function TaxHarvesting() {
  const { openLots, closedLots, quotes, loading, emptyState } = usePortfolio();
  const moats = useMoatSummaries();

  const [selectedOwners, setSelectedOwners]     = useState(() => new Set());
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());
  // overrides: Map<lotKey, { sharesToSell?: number, price?: number }>
  const [overrides, setOverrides] = useState(() => new Map());
  const taxRates = DEFAULT_TAX_RATES;

  const dateRefs = useMemo(() => {
    const now = new Date();
    return {
      today: now.toISOString().slice(0, 10),
      todayMs: now.getTime(),
      yearStart: startOfYear(),
      thirtyDaysAgo: new Date(now.getTime() - 30 * MS_PER_DAY).toISOString().slice(0, 10),
    };
  }, []);
  const { today, todayMs, yearStart, thirtyDaysAgo } = dateRefs;

  const brokerageOpen = useMemo(
    () => openLots.filter(l => l.accountTypeGroup === 'Brokerage'),
    [openLots]
  );
  const brokerageClosed = useMemo(
    () => closedLots.filter(l => l.accountTypeGroup === 'Brokerage'),
    [closedLots]
  );

  const OWNERS = useMemo(
    () => [...new Set([...brokerageOpen, ...brokerageClosed].map(l => l.owner).filter(Boolean))].sort(),
    [brokerageOpen, brokerageClosed]
  );
  const ACCOUNTS = useMemo(
    () => [...new Set([...brokerageOpen, ...brokerageClosed].map(l => l.account).filter(Boolean))].sort(),
    [brokerageOpen, brokerageClosed]
  );

  const allOwnersSelected   = selectedOwners.size === 0;
  const allAccountsSelected = selectedAccounts.size === 0;

  function toggleOwner(o) {
    setSelectedOwners(prev => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o); else next.add(o);
      return next;
    });
  }
  function toggleAccount(a) {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  }
  function clearOwners()   { setSelectedOwners(new Set()); }
  function clearAccounts() { setSelectedAccounts(new Set()); }

  const filteredOpen = useMemo(() => brokerageOpen.filter(l => (
    (selectedOwners.size === 0   || selectedOwners.has(l.owner)) &&
    (selectedAccounts.size === 0 || selectedAccounts.has(l.account))
  )), [brokerageOpen, selectedOwners, selectedAccounts]);

  const filteredClosed = useMemo(() => brokerageClosed.filter(l => (
    (selectedOwners.size === 0   || selectedOwners.has(l.owner)) &&
    (selectedAccounts.size === 0 || selectedAccounts.has(l.account))
  )), [brokerageClosed, selectedOwners, selectedAccounts]);

  // Wash-sale lookahead — most-recent purchase per symbol in the current open set.
  const recentPurchaseMap = useMemo(() => {
    const m = {};
    for (const l of filteredOpen) {
      if (!m[l.symbol] || l.dateAcquired > m[l.symbol]) m[l.symbol] = l.dateAcquired;
    }
    return m;
  }, [filteredOpen]);

  // ── REALIZED rows ──────────────────────────────────────────────────────────
  const realizedRows = useMemo(() => {
    const rows = [];
    for (const lot of filteredClosed) {
      if (!lot.dateSold || lot.dateSold < yearStart) continue;
      const proceeds = lotProceeds(lot);
      const cost = ds(lot) * dc(lot);
      if (!proceeds || !cost) continue;
      const gl = proceeds - cost;
      const term = taxTerm(lot.dateAcquired, lot.dateSold);
      const taxImpact = gl >= 0
        ? estimatedTax(gl, term, taxRates)
        : -(harvestSavings(gl, term, taxRates) || 0);
      const shares = ds(lot);
      const sharesSold = lot.sharesSold ?? shares;
      const sellPrice  = lot.sellBasis ?? (sharesSold > 0 ? proceeds / sharesSold : null);
      rows.push({
        kind: 'realized',
        status: 'CLOSED',
        symbol: lot.symbol,
        owner: lot.owner,
        account: lot.account,
        dateAcquired: lot.dateAcquired,
        dateSold: lot.dateSold,
        shares,
        sharesSold,
        sellPrice,
        costPerShare: dc(lot),
        term,
        gl,
        glPct: cost > 0 ? gl / cost : 0,
        taxImpact,
      });
    }
    rows.sort((a, b) => a.dateSold.localeCompare(b.dateSold));
    return rows;
  }, [filteredClosed, yearStart, taxRates]);

  // ── HARVEST OPTION candidates (raw, with potential gain at full lot) ──────
  const candidateRows = useMemo(() => {
    const rows = [];
    for (const lot of filteredOpen) {
      const price = quotes[lot.symbol]?.price;
      if (price == null) continue;
      const shares = ds(lot);
      const cost = dc(lot);
      const totalCost = shares * cost;
      const currentValue = shares * price;
      const potentialGL = currentValue - totalCost;
      const term = taxTerm(lot.dateAcquired, today);
      const daysToLT = term === 'short' ? daysUntilLT(lot.dateAcquired, new Date(todayMs)) : 0;
      const mostRecentBuy = recentPurchaseMap[lot.symbol];
      const washSaleRisk = potentialGL < 0
        && mostRecentBuy >= thirtyDaysAgo
        && mostRecentBuy !== lot.dateAcquired;
      rows.push({
        kind: 'option',
        status: 'OPEN',
        symbol: lot.symbol,
        owner: lot.owner,
        account: lot.account,
        dateAcquired: lot.dateAcquired,
        shares,
        costPerShare: cost,
        price,                  // current quote (default for the price input)
        term,
        potentialGL,
        potentialGLPct: totalCost > 0 ? potentialGL / totalCost : 0,
        daysToLT,
        washSaleRisk,
      });
    }
    return rows;
  }, [filteredOpen, quotes, today, todayMs, recentPurchaseMap, thirtyDaysAgo]);

  // Apply overrides to compute effective shares/price/G-L per row.
  const enrichedCandidates = useMemo(() => candidateRows.map(r => {
    const e = effective(r, overrides);
    const taxImpact = e.gl >= 0
      ? estimatedTax(e.gl, r.term, taxRates)
      : -(harvestSavings(e.gl, r.term, taxRates) || 0);
    return {
      ...r,
      sharesToSell: e.sharesToSell,
      effectivePrice: e.price,
      effectiveGL: e.gl,
      effectiveGLPct: r.costPerShare > 0
        ? (e.price - r.costPerShare) / r.costPerShare
        : 0,
      taxImpact,
    };
  }), [candidateRows, overrides, taxRates]);

  const ytdNet = realizedRows.reduce((s, r) => s + r.gl, 0);
  const ytdSt = realizedRows.filter(r => r.term === 'short').reduce((s, r) => s + r.gl, 0);
  const ytdLt = realizedRows.filter(r => r.term === 'long').reduce((s, r) => s + r.gl, 0);

  const orderedOptions = useMemo(
    () => buildHarvestOrder(enrichedCandidates, ytdNet, ORD_LOSS_LIMIT),
    [enrichedCandidates, ytdNet]
  );

  // Plan rows with running total. Realized uses gl directly; options use effectiveGL.
  const planRows = useMemo(() => {
    const out = [];
    let cum = 0;
    for (const r of realizedRows) {
      cum += r.gl;
      out.push({ ...r, contribution: r.gl, running: cum });
    }
    for (const r of orderedOptions) {
      cum += r.effectiveGL;
      out.push({ ...r, contribution: r.effectiveGL, running: cum });
    }
    return out;
  }, [realizedRows, orderedOptions]);

  const planEndRunning = planRows.length > 0
    ? planRows[planRows.length - 1].running
    : ytdNet;

  // ST gains maturing into LT soon — useful "wait a bit longer" callout.
  const maturingSoon = useMemo(() => {
    return enrichedCandidates
      .filter(r => r.term === 'short' && r.potentialGL > 0 && r.daysToLT > 0 && r.daysToLT <= MATURITY_WINDOW_DAYS);
  }, [enrichedCandidates]);

  const lossToReach3k = ytdNet > ORD_LOSS_LIMIT ? ytdNet - ORD_LOSS_LIMIT : 0;
  const activeOptionCount = orderedOptions.filter(r => r.effectiveGL !== 0).length;
  const inactiveOptionCount = orderedOptions.length - activeOptionCount;

  // ── Override mutators ─────────────────────────────────────────────────────
  function setOverride(key, patch) {
    setOverrides(prev => {
      const next = new Map(prev);
      const cur = next.get(key) || {};
      next.set(key, { ...cur, ...patch });
      return next;
    });
  }
  function setSharesToSell(row, n) {
    const clamped = Math.max(0, Math.min(row.shares, Number.isFinite(n) ? n : 0));
    setOverride(lotKey(row), { sharesToSell: clamped });
  }
  function setRowPrice(row, p) {
    const cleaned = Number.isFinite(p) && p >= 0 ? p : 0;
    setOverride(lotKey(row), { price: cleaned });
  }
  function toggleCheck(row) {
    const cur = row.sharesToSell;
    setOverride(lotKey(row), { sharesToSell: cur > 0 ? 0 : row.shares });
  }
  function resetAll() {
    setOverrides(new Map());
  }

  // Build the rows the export endpoint will serialize. Only include rows
  // that contribute something:
  //   - Realized rows always (history is part of the plan)
  //   - Option rows only when sharesToSell > 0 (i.e. checkbox checked, and
  //     the user hasn't typed 0 into the input)
  function buildExportRows() {
    const out = [];
    for (const r of planRows) {
      if (r.kind === 'option' && (!r.sharesToSell || r.sharesToSell <= 0)) continue;
      const moat = moats[r.symbol] || moats[(r.symbol || '').toUpperCase()];
      const moatText = moat
        ? [moat.size, moat.direction].filter(Boolean).join(' / ')
        : '';
      const sharesToSell = r.kind === 'realized' ? (r.sharesSold ?? r.shares) : r.sharesToSell;
      const sharePrice   = r.kind === 'realized' ? r.sellPrice : r.effectivePrice;
      const gainPct      = r.kind === 'realized' ? r.glPct : r.effectiveGLPct;
      out.push({
        status: r.status,
        term: r.term === 'long' ? 'LT' : 'ST',
        symbol: r.symbol,
        owner: r.owner || '',
        account: r.account || '',
        dateAcquired: r.dateAcquired || '',
        dateSold: r.dateSold || '',
        gainPct,
        shares: r.shares,
        sharesToSell,
        sharePrice,
        gainDollar: r.contribution,
        taxImpact: r.taxImpact,
        moat: moatText,
        running: r.running,
      });
    }
    return out;
  }

  async function handleExport() {
    const rows = buildExportRows();
    if (rows.length === 0) {
      alert('Nothing to export — every option row has Shares to Sell at 0.');
      return;
    }
    try {
      const res = await fetch('/api/tax-harvesting/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        alert(`Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-harvesting-plan-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed — see console');
      console.error(err);
    }
  }

  if (loading) return <div className="th__loading">Loading portfolio…</div>;
  if (emptyState) return <div className="th__loading">No portfolio data yet — load a profile first.</div>;

  const noBrokerage = brokerageOpen.length === 0 && brokerageClosed.length === 0;
  const noQuotes = filteredOpen.length > 0 && candidateRows.length === 0;

  return (
    <div className="th">
      <div className="th__head">
        <div>
          <div className="th__title">Tax Harvesting</div>
          <div className="th__subtitle">
            Brokerage accounts only · running total assumes every row above is sold today
            at the listed Share Price
          </div>
        </div>
        <div className="th__head-actions">
          {overrides.size > 0 && (
            <button className="th__chip" onClick={resetAll}>Reset edits</button>
          )}
          <Button variant="primary" onClick={handleExport}>Export to Excel</Button>
        </div>
      </div>

      {(OWNERS.length > 1 || ACCOUNTS.length > 1) && (
        <div className="th__filters">
          {OWNERS.length > 1 && (
            <div className="th__filter-group">
              <span className="th__filter-label">Owner</span>
              <button className={`th__chip ${allOwnersSelected ? 'is-active' : ''}`} onClick={clearOwners}>All</button>
              {OWNERS.map(o => (
                <button
                  key={o}
                  className={`th__chip ${selectedOwners.has(o) ? 'is-active' : ''}`}
                  onClick={() => toggleOwner(o)}
                >{o}</button>
              ))}
            </div>
          )}
          {ACCOUNTS.length > 1 && (
            <div className="th__filter-group">
              <span className="th__filter-label">Account</span>
              <button className={`th__chip ${allAccountsSelected ? 'is-active' : ''}`} onClick={clearAccounts}>All</button>
              {ACCOUNTS.map(a => (
                <button
                  key={a}
                  className={`th__chip ${selectedAccounts.has(a) ? 'is-active' : ''}`}
                  onClick={() => toggleAccount(a)}
                >{a}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {noBrokerage && (
        <Card>
          <div className="th__empty">
            No brokerage accounts found. This tool is intentionally limited to taxable
            Brokerage — gain/loss harvesting has no tax effect inside Retirement, HSA,
            or ESA accounts.
          </div>
        </Card>
      )}

      {noQuotes && (
        <Card>
          <div className="th__empty">
            No quote data loaded for the open lots. Run <strong>Sync</strong> to fetch
            current prices, then return here.
          </div>
        </Card>
      )}

      {!noBrokerage && !noQuotes && (
        <>
          <div className="th__summary">
            <Card>
              <Stat
                label="YTD Net Realized"
                value={formatCurrency(ytdNet)}
                tone={ytdNet >= 0 ? 'pos' : 'neg'}
                sub={`ST ${formatCurrency(ytdSt)} · LT ${formatCurrency(ytdLt)}`}
              />
            </Card>
            <Card>
              <Stat
                label="Loss to reach -$3K"
                value={lossToReach3k > 0 ? formatCurrency(-lossToReach3k) : '—'}
                tone="neg"
                sub={
                  lossToReach3k > 0
                    ? 'Harvest this much to fully use the ordinary-income offset'
                    : ytdNet <= ORD_LOSS_LIMIT
                      ? 'Already at -$3K — extra losses carry forward'
                      : 'YTD already net loss — every $ helps'
                }
              />
            </Card>
            <Card>
              <Stat
                label="Tax-free gain headroom"
                value={ytdNet < 0 ? formatCurrency(-ytdNet) : '$0'}
                tone={ytdNet < 0 ? 'pos' : 'neutral'}
                sub={
                  ytdNet < 0
                    ? 'Gains up to here are sheltered by realized losses'
                    : 'Wipe out YTD gains first to open headroom'
                }
              />
            </Card>
            <Card>
              <Stat
                label="Plan net (active rows)"
                value={formatCurrency(planEndRunning)}
                tone={planEndRunning >= 0 ? 'pos' : 'neg'}
                sub={`${activeOptionCount} active · ${inactiveOptionCount} held back`}
              />
            </Card>
          </div>

          <div className="th__note">
            <strong>Reading this table.</strong> The plan walks through this year's
            realized closes and then your open brokerage lots in an interleaved harvest
            order: drop to <strong>-$3,000</strong> with losses, add the largest LT gain,
            refill losses back to -$3K, repeat. Edit <em>Shares to Sell</em> or
            <em> Share Price</em> on any row to model partial sales or different prices —
            the running total updates and the order keeps optimizing. The checkbox flips
            Shares to Sell between 0 and the full lot; rows stay in their position
            either way.
          </div>

          <Card>
            <PlanTable
              planRows={planRows}
              moats={moats}
              onChangeShares={setSharesToSell}
              onChangePrice={setRowPrice}
              onToggleCheck={toggleCheck}
            />
          </Card>

          {maturingSoon.length > 0 && (
            <Card>
              <div className="th__maturity-title">
                Almost long-term · {maturingSoon.length} ST lot{maturingSoon.length === 1 ? '' : 's'} turn LT within {MATURITY_WINDOW_DAYS} days
              </div>
              <div className="th__maturity-sub">
                Holding these a little longer drops the rate from ordinary income
                ({(taxRates.st * 100).toFixed(1)}%) to LT ({(taxRates.lt * 100).toFixed(1)}%).
              </div>
              <div className="th__maturity-list">
                {maturingSoon.slice(0, 6).map((r, i) => (
                  <div key={i} className="th__maturity-row">
                    <span className="th__sym">{r.symbol}</span>
                    <span className="th__dim">{r.account}</span>
                    <span className="th__num pos">{formatCurrency(r.potentialGL)}</span>
                    <span className="th__num">{r.daysToLT}d to LT</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan table — REALIZED then HARVEST OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

function PlanTable({ planRows, moats, onChangeShares, onChangePrice, onToggleCheck }) {
  if (planRows.length === 0) {
    return <div className="th__empty">No realized G/L this year and no open brokerage lots to harvest.</div>;
  }

  const realized = planRows.filter(r => r.kind === 'realized');
  const options  = planRows.filter(r => r.kind === 'option');
  const showSold = realized.length > 0;
  // Base cols: checkbox, status, term, symbol, owner, account, acquired,
  // gain%, shares, shares to sell, share price, gain $, est tax, moat, running total.
  // +1 if Sold column is present.
  const totalCols = 15 + (showSold ? 1 : 0);

  // Threshold-crossing dividers within HARVEST OPTIONS.
  const dividers = [];
  let lastRunning = realized.length > 0 ? realized[realized.length - 1].running : 0;
  if (lastRunning < 0) {
    dividers.push({
      afterIndex: -1,
      kind: 'pos',
      label: `↑ YTD already net loss · gains up to ${formatCurrency(-lastRunning)} are tax-free below`,
    });
  }
  options.forEach((r, idx) => {
    const cross = (threshold, dir) => (
      dir === 'down' ? lastRunning > threshold && r.running <= threshold
      :                lastRunning < threshold && r.running >= threshold
    );
    if (cross(0, 'down')) {
      dividers.push({ afterIndex: idx, kind: 'zero', label: '↑ Net $0 reached · YTD gains fully offset; losses below now reduce ordinary income (up to -$3K)' });
    }
    if (cross(0, 'up')) {
      dividers.push({ afterIndex: idx, kind: 'zero-up', label: '↑ Crossed back above $0 · further gains are taxable' });
    }
    if (cross(ORD_LOSS_LIMIT, 'down')) {
      dividers.push({ afterIndex: idx, kind: 'warn', label: '↑ -$3,000 reached · ordinary-income offset fully claimed; extra losses carry forward to next year' });
    }
    if (cross(-VIEW_CAP, 'down')) {
      dividers.push({ afterIndex: idx, kind: 'cap', label: `↑ -$${VIEW_CAP.toLocaleString()} reached · still valid carry-forward, just past display cap` });
    }
    lastRunning = r.running;
  });

  return (
    <div className="th__plan-wrap">
      <table className="th__plan">
        <thead>
          <tr>
            <th className="th__plan-check"></th>
            <th>Status</th>
            <th>Term</th>
            <th>Symbol</th>
            <th>Owner</th>
            <th>Account</th>
            <th>Acquired</th>
            {showSold && <th>Sold</th>}
            <th className="num">Gain %</th>
            <th className="num">Shares</th>
            <th className="num">Shares to Sell</th>
            <th className="num">Share Price</th>
            <th className="num">Gain $</th>
            <th className="num">Est. Tax</th>
            <th>Moat</th>
            <th className="num">Running Total</th>
          </tr>
        </thead>
        <tbody>
          {realized.length > 0 && (
            <tr className="th__section">
              <td colSpan={totalCols}>
                REALIZED · {realized.length} closed lot{realized.length === 1 ? '' : 's'} this year
              </td>
            </tr>
          )}
          {realized.map((r, i) => (
            <PlanRow
              key={`r${i}`}
              row={r}
              moats={moats}
              showSold={showSold}
            />
          ))}

          <tr className="th__section">
            <td colSpan={totalCols}>HARVEST OPTIONS · {options.length} open lot{options.length === 1 ? '' : 's'} (interleaved order)</td>
          </tr>

          {options.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="th__empty-row">No open brokerage lots with current quotes.</td>
            </tr>
          )}

          {dividers.filter(d => d.afterIndex === -1).map((d, i) => (
            <DividerRow key={`d-pre-${i}`} divider={d} colSpan={totalCols} />
          ))}

          {options.map((r, i) => (
            <Fragment key={lotKey(r)}>
              <PlanRow
                row={r}
                moats={moats}
                showSold={showSold}
                onChangeShares={onChangeShares}
                onChangePrice={onChangePrice}
                onToggleCheck={onToggleCheck}
              />
              {dividers
                .filter(d => d.afterIndex === i)
                .map((d, di) => (
                  <DividerRow key={`d-${i}-${di}`} divider={d} colSpan={totalCols} />
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanRow({ row, moats, showSold, onChangeShares, onChangePrice, onToggleCheck }) {
  const r = row;
  const isOption  = r.kind === 'option';
  const checked   = isOption ? r.sharesToSell > 0 : true;
  const inactive  = isOption && !checked;
  const inCarryForward = isOption && checked && r.running < ORD_LOSS_LIMIT;
  const beyondCap      = isOption && checked && r.running < -VIEW_CAP;

  const rowCls = [
    'th__row',
    inactive ? 'th__row--inactive' : '',
    beyondCap ? 'th__row--dim' : '',
    inCarryForward ? 'th__row--carry' : '',
  ].filter(Boolean).join(' ');

  // Display values
  const displayShares      = r.shares;
  const displaySharesSold  = isOption ? r.sharesToSell : (r.sharesSold ?? r.shares);
  const displayPrice       = isOption ? r.effectivePrice : (r.sellPrice ?? null);
  const displayGain        = isOption ? r.effectiveGL : r.gl;
  const displayGainPct     = isOption ? r.effectiveGLPct : r.glPct;

  return (
    <tr className={rowCls}>
      <td className="th__plan-check">
        {isOption && (
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleCheck(r)}
            aria-label={checked ? 'Set Shares to Sell to 0' : 'Restore full Shares to Sell'}
          />
        )}
      </td>
      <td>
        <span className={`th__status th__status--${r.status.toLowerCase()}`}>{r.status}</span>
      </td>
      <td>
        <span className={`th__term th__term--${r.term}`}>{r.term === 'long' ? 'LT' : 'ST'}</span>
        {isOption && r.term === 'short' && r.daysToLT > 0 && r.daysToLT <= MATURITY_WINDOW_DAYS && (
          <span className="th__maturing"> {r.daysToLT}d→LT</span>
        )}
      </td>
      <td className="th__sym">
        {r.symbol}
        {r.washSaleRisk && (
          <span className="th__wash th__wash--risk" title="Same symbol bought within last 30 days — wash-sale risk">
            ⚠
          </span>
        )}
      </td>
      <td className="th__dim">{r.owner || '—'}</td>
      <td className="th__dim">{r.account}</td>
      <td className="th__dim">{r.dateAcquired}</td>
      {showSold && <td className="th__dim">{r.dateSold || '—'}</td>}
      <td className={`num ${displayGain >= 0 ? 'pos' : 'neg'}`}>{formatPct(displayGainPct)}</td>
      <td className="num th__num-cell">{formatNumberCompact(displayShares)}</td>
      <td className="num th__input-cell">
        {isOption ? (
          <input
            type="number"
            min={0}
            max={r.shares}
            step="any"
            className="th__input"
            value={r.sharesToSell}
            onChange={e => onChangeShares(r, parseFloat(e.target.value))}
          />
        ) : (
          <span>{formatNumberCompact(displaySharesSold)}</span>
        )}
      </td>
      <td className="num th__input-cell">
        {isOption ? (
          <input
            type="number"
            min={0}
            step="any"
            className="th__input"
            value={r.effectivePrice}
            onChange={e => onChangePrice(r, parseFloat(e.target.value))}
          />
        ) : (
          <span>{displayPrice != null ? formatCurrency(displayPrice) : '—'}</span>
        )}
      </td>
      <td className={`num ${displayGain >= 0 ? 'pos' : 'neg'}`}>{formatCurrency(displayGain)}</td>
      <td className={`num ${r.taxImpact != null && r.taxImpact < 0 ? 'pos' : 'dim'}`}>
        {r.taxImpact != null ? formatCurrency(r.taxImpact) : '—'}
      </td>
      <td><MoatBadges moat={moats[r.symbol] || moats[(r.symbol || '').toUpperCase()]} /></td>
      <td className={`num th__running ${inactive ? 'dim' : (r.running >= 0 ? 'pos' : 'neg')}`}>
        {formatCurrency(r.running)}
      </td>
    </tr>
  );
}

function DividerRow({ divider, colSpan }) {
  return (
    <tr className={`th__divider th__divider--${divider.kind}`}>
      <td colSpan={colSpan}>{divider.label}</td>
    </tr>
  );
}

function formatNumberCompact(n) {
  if (n == null || isNaN(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Moat badges — size + direction, mirrors MoatCard's color logic.
// ─────────────────────────────────────────────────────────────────────────────

const MOAT_SIZE_TONE = { WIDE: 'pos', NARROW: 'warn', NONE: 'neg' };
const MOAT_DIR_TONE  = { WIDENING: 'pos', STABLE: 'dim', NARROWING: 'neg' };
const MOAT_DIR_GLYPH = { WIDENING: '↑', STABLE: '→', NARROWING: '↓' };

function moatKey(s) {
  if (!s) return '';
  const m = String(s).match(/[A-Za-z]+/);
  return m ? m[0].toUpperCase() : '';
}

function MoatBadges({ moat }) {
  if (!moat || (!moat.size && !moat.direction)) {
    return <span className="th__moat-none">—</span>;
  }
  const sizeKey = moatKey(moat.size);
  const dirKey  = moatKey(moat.direction);
  const sizeTone = MOAT_SIZE_TONE[sizeKey] || 'dim';
  const dirTone  = MOAT_DIR_TONE[dirKey] || 'dim';
  const dirGlyph = MOAT_DIR_GLYPH[dirKey] || '';
  return (
    <span className="th__moat" title={moat.sources || ''}>
      {sizeKey && (
        <span className={`th__moat-pill th__moat-pill--${sizeTone}`}>
          {sizeKey} MOAT
        </span>
      )}
      {dirKey && (
        <span className={`th__moat-pill th__moat-pill--${dirTone}`}>
          {dirGlyph} {dirKey}
        </span>
      )}
    </span>
  );
}
