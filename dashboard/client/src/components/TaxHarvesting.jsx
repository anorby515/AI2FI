import { Fragment, useMemo, useState } from 'react';
import { Card, Stat } from '../ui';
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
 *   [HARVEST OPTIONS] — checked open lots, ordered by an interleaved strategy:
 *                         Phase 1 — drop to -$3,000 with losses (ST→LT, biggest first)
 *                         Phase 2 — add largest LT gain, refill losses back to -$3K, repeat
 *                         Phase 3 — any remaining losses (carry-forward)
 *   [EXCLUDED]        — open lots the user has unchecked
 *
 * Running Total column shows where the user lands if every checked row above
 * is sold today. Unchecking a row re-runs Phases 1-3 over the remaining set.
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

// Stable per-lot key for selection state.
function lotKey(r) {
  return [r.symbol, r.account, r.owner || '', r.dateAcquired, r.shares, r.costPerShare].join('|');
}

// Interleaved harvest-order algorithm. Returns the rows in display order.
// Each row keeps its original fields; running total is added downstream.
function buildHarvestOrder(rows, ytdNet, target = ORD_LOSS_LIMIT) {
  const losses = rows.filter(r => r.gl < 0).slice().sort((a, b) => {
    if (a.term !== b.term) return a.term === 'short' ? -1 : 1; // ST first
    return a.gl - b.gl;                                          // most negative first
  });
  const gains = rows.filter(r => r.gl >= 0).slice().sort((a, b) => {
    if (a.term !== b.term) return a.term === 'long' ? -1 : 1;   // LT first
    return b.gl - a.gl;                                          // largest first
  });

  let current = ytdNet;
  const order = [];

  // Phase 1 — drop to target with losses (or exhaust losses).
  while (losses.length > 0 && current > target) {
    const loss = losses.shift();
    order.push(loss);
    current += loss.gl;
  }

  // Phase 2 — interleave: add largest gain, refill losses back to target.
  while (gains.length > 0) {
    const gain = gains.shift();
    order.push(gain);
    current += gain.gl;
    while (losses.length > 0 && current > target) {
      const loss = losses.shift();
      order.push(loss);
      current += loss.gl;
    }
  }

  // Phase 3 — any remaining losses (carry-forward).
  while (losses.length > 0) {
    const loss = losses.shift();
    order.push(loss);
    current += loss.gl;
  }

  return order;
}

export default function TaxHarvesting() {
  const { openLots, closedLots, quotes, loading, emptyState } = usePortfolio();
  const moats = useMoatSummaries();

  const [selectedOwners, setSelectedOwners]     = useState(() => new Set());   // empty = All
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());   // empty = All
  const [excluded, setExcluded]                 = useState(() => new Set());   // lot keys
  const taxRates = DEFAULT_TAX_RATES;

  // Date references — memoized so render purity is stable and deps don't churn.
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

  // Brokerage-only — this tool doesn't apply to tax-deferred accounts.
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

  // Wash-sale lookahead — most-recent purchase per symbol across the open set.
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
      rows.push({
        kind: 'realized',
        status: 'CLOSED',
        symbol: lot.symbol,
        owner: lot.owner,
        account: lot.account,
        dateAcquired: lot.dateAcquired,
        dateSold: lot.dateSold,
        shares: ds(lot),
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

  // ── HARVEST OPTION candidates ──────────────────────────────────────────────
  const candidateRows = useMemo(() => {
    const rows = [];
    for (const lot of filteredOpen) {
      const price = quotes[lot.symbol]?.price;
      if (price == null) continue;
      const shares = ds(lot);
      const cost = dc(lot);
      const totalCost = shares * cost;
      const currentValue = shares * price;
      const gl = currentValue - totalCost;
      const term = taxTerm(lot.dateAcquired, today);
      const daysToLT = term === 'short' ? daysUntilLT(lot.dateAcquired, new Date(todayMs)) : 0;
      const taxImpact = gl >= 0
        ? estimatedTax(gl, term, taxRates)
        : -(harvestSavings(gl, term, taxRates) || 0);
      const mostRecentBuy = recentPurchaseMap[lot.symbol];
      const washSaleRisk = gl < 0
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
        term,
        gl,
        glPct: totalCost > 0 ? gl / totalCost : 0,
        taxImpact,
        daysToLT,
        washSaleRisk,
      });
    }
    return rows;
  }, [filteredOpen, quotes, today, todayMs, taxRates, recentPurchaseMap, thirtyDaysAgo]);

  const ytdNet = realizedRows.reduce((s, r) => s + r.gl, 0);
  const ytdSt = realizedRows.filter(r => r.term === 'short').reduce((s, r) => s + r.gl, 0);
  const ytdLt = realizedRows.filter(r => r.term === 'long').reduce((s, r) => s + r.gl, 0);

  // Split candidates into checked (in-plan) and unchecked (excluded).
  const { checkedCandidates, excludedCandidates } = useMemo(() => {
    const inPlan = [];
    const out = [];
    for (const r of candidateRows) {
      if (excluded.has(lotKey(r))) out.push(r);
      else inPlan.push(r);
    }
    return { checkedCandidates: inPlan, excludedCandidates: out };
  }, [candidateRows, excluded]);

  // Build the harvest order over checked candidates.
  const orderedOptions = useMemo(
    () => buildHarvestOrder(checkedCandidates, ytdNet, ORD_LOSS_LIMIT),
    [checkedCandidates, ytdNet]
  );

  // Compose plan rows with running total.
  const planRows = useMemo(() => {
    const all = [...realizedRows, ...orderedOptions];
    return all.reduce((acc, r) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].running : 0;
      acc.push({ ...r, running: prev + r.gl });
      return acc;
    }, []);
  }, [realizedRows, orderedOptions]);

  const planEndRunning = planRows.length > 0
    ? planRows[planRows.length - 1].running
    : ytdNet;

  // ST lots maturing into LT soon — useful "wait a bit longer" callout.
  const maturingSoon = useMemo(() => {
    return candidateRows
      .filter(r => r.term === 'short' && r.gl > 0 && r.daysToLT > 0 && r.daysToLT <= MATURITY_WINDOW_DAYS);
  }, [candidateRows]);

  // Loss-harvest target to hit -$3K from current YTD position.
  const lossToReach3k = ytdNet > ORD_LOSS_LIMIT ? ytdNet - ORD_LOSS_LIMIT : 0;

  function toggleExclude(row) {
    const k = lotKey(row);
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
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
            Brokerage accounts only · running total assumes every checked row above is sold today
          </div>
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
                label="Plan net (checked rows only)"
                value={formatCurrency(planEndRunning)}
                tone={planEndRunning >= 0 ? 'pos' : 'neg'}
                sub={`${orderedOptions.length} option${orderedOptions.length === 1 ? '' : 's'} · ${excludedCandidates.length} excluded`}
              />
            </Card>
          </div>

          <div className="th__note">
            <strong>Reading this table.</strong> The plan starts with this year's realized
            closes and then walks through your open brokerage lots in an interleaved
            harvest order: drop to <strong>-$3,000</strong> with losses, add the largest
            LT gain, refill losses back to -$3K, and repeat. The
            <strong> Running Total</strong> column shows where you land if every checked
            row above is sold today. Uncheck a row to send it to <em>Excluded</em> — the
            remaining rows re-order automatically.
          </div>

          <Card>
            <PlanTable
              planRows={planRows}
              excludedCandidates={excludedCandidates}
              moats={moats}
              onToggleExclude={toggleExclude}
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
                    <span className="th__num pos">{formatCurrency(r.gl)}</span>
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
// Unified Plan table
// ─────────────────────────────────────────────────────────────────────────────

function PlanTable({ planRows, excludedCandidates, moats, onToggleExclude }) {
  if (planRows.length === 0 && excludedCandidates.length === 0) {
    return <div className="th__empty">No realized G/L this year and no open brokerage lots to harvest.</div>;
  }

  const realized = planRows.filter(r => r.kind === 'realized');
  const options  = planRows.filter(r => r.kind === 'option');
  const showSold = realized.length > 0;
  // 12 base columns: checkbox, status, term, symbol, owner, account, acquired,
  // gain %, gain $, est. tax, moat, running total. +1 if Sold column is shown.
  const totalCols = 12 + (showSold ? 1 : 0);

  // Threshold-crossing dividers within HARVEST OPTIONS.
  // afterIndex = options[] index AFTER which the divider goes (-1 = before first).
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
      dividers.push({ afterIndex: idx, kind: 'zero', label: '↑ Net $0 reached · further losses dip into carry-forward space' });
    }
    if (cross(0, 'up')) {
      dividers.push({ afterIndex: idx, kind: 'zero-up', label: '↑ Crossed back above $0 · further gains are taxable' });
    }
    if (cross(ORD_LOSS_LIMIT, 'down')) {
      dividers.push({ afterIndex: idx, kind: 'warn', label: '↑ -$3,000 reached · this is the full ordinary-income offset; extra losses carry forward' });
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
              showCheckbox={false}
            />
          ))}

          <tr className="th__section">
            <td colSpan={totalCols}>
              HARVEST OPTIONS · {options.length} open lot{options.length === 1 ? '' : 's'} (interleaved order)
            </td>
          </tr>

          {options.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="th__empty-row">
                {excludedCandidates.length > 0
                  ? 'All harvest candidates are excluded — re-include rows below to build a plan.'
                  : 'No open brokerage lots with current quotes.'}
              </td>
            </tr>
          )}

          {dividers.filter(d => d.afterIndex === -1).map((d, i) => (
            <DividerRow key={`d-pre-${i}`} divider={d} colSpan={totalCols} />
          ))}

          {options.map((r, i) => (
            <Fragment key={`o${i}`}>
              <PlanRow
                row={r}
                moats={moats}
                showSold={showSold}
                showCheckbox={true}
                checked={true}
                onToggle={() => onToggleExclude(r)}
              />
              {dividers
                .filter(d => d.afterIndex === i)
                .map((d, di) => (
                  <DividerRow key={`d-${i}-${di}`} divider={d} colSpan={totalCols} />
                ))}
            </Fragment>
          ))}

          {excludedCandidates.length > 0 && (
            <tr className="th__section th__section--excluded">
              <td colSpan={totalCols}>
                EXCLUDED · {excludedCandidates.length} lot{excludedCandidates.length === 1 ? '' : 's'} held back from the plan
              </td>
            </tr>
          )}
          {excludedCandidates.map((r, i) => (
            <PlanRow
              key={`x${i}`}
              row={r}
              moats={moats}
              showSold={showSold}
              showCheckbox={true}
              checked={false}
              onToggle={() => onToggleExclude(r)}
              excluded={true}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanRow({ row, moats, showSold, showCheckbox, checked, onToggle, excluded = false }) {
  const r = row;
  const isLoss = r.gl < 0;
  const inCarryForward = r.kind === 'option' && !excluded && r.running < ORD_LOSS_LIMIT;
  const beyondCap      = r.kind === 'option' && !excluded && r.running < -VIEW_CAP;
  const rowCls = [
    'th__row',
    excluded ? 'th__row--excluded' : '',
    beyondCap ? 'th__row--dim' : '',
    inCarryForward ? 'th__row--carry' : '',
  ].filter(Boolean).join(' ');

  return (
    <tr className={rowCls}>
      <td className="th__plan-check">
        {showCheckbox && (
          <input
            type="checkbox"
            checked={!!checked}
            onChange={onToggle}
            aria-label={checked ? 'Exclude this lot' : 'Include this lot'}
          />
        )}
      </td>
      <td>
        <span className={`th__status th__status--${r.status.toLowerCase()}`}>{r.status}</span>
      </td>
      <td>
        <span className={`th__term th__term--${r.term}`}>{r.term === 'long' ? 'LT' : 'ST'}</span>
        {r.kind === 'option' && r.term === 'short' && r.daysToLT > 0 && r.daysToLT <= MATURITY_WINDOW_DAYS && (
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
      <td className={`num ${isLoss ? 'neg' : 'pos'}`}>{formatPct(r.glPct)}</td>
      <td className={`num ${isLoss ? 'neg' : 'pos'}`}>{formatCurrency(r.gl)}</td>
      <td className={`num ${r.taxImpact != null && r.taxImpact < 0 ? 'pos' : 'dim'}`}>
        {r.taxImpact != null ? formatCurrency(r.taxImpact) : '—'}
      </td>
      <td><MoatBadges moat={moats[r.symbol]} /></td>
      <td className={`num th__running ${excluded ? 'dim' : (r.running >= 0 ? 'pos' : 'neg')}`}>
        {excluded ? '—' : formatCurrency(r.running)}
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
