import { Fragment, useMemo, useState } from 'react';
import { Card, Stat, Segment } from '../ui';
import { usePortfolio, useMoatSummaries } from '../hooks/usePortfolio';
import {
  ds, dc, lotProceeds, taxTerm, harvestSavings, estimatedTax,
  formatCurrency, formatPct, DEFAULT_TAX_RATES,
} from '../utils/calculations';
import './TaxHarvesting.css';

/**
 * Tax-Harvesting tool — Brokerage-only.
 *
 * Single ordered table:
 *   [REALIZED]       — closed lots from this year, oldest sale first.
 *   [HARVEST OPTIONS] — open brokerage lots in a recommended order:
 *                         ST losses (biggest first) → LT losses
 *                         → LT gains → ST gains.
 *
 * The running-total column shows the net realized G/L if every row above
 * is committed. Inline dividers flag the $0 / -$3K / -$10K crossings so
 * the reader can pick a stopping point that fits their tax plan.
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

export default function TaxHarvesting() {
  const { openLots, closedLots, quotes, loading, emptyState } = usePortfolio();
  const moats = useMoatSummaries();
  const [accountFilter, setAccountFilter] = useState('All');
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

  const brokerageAccounts = useMemo(() => {
    const set = new Set();
    for (const l of brokerageOpen) set.add(l.account);
    for (const l of brokerageClosed) set.add(l.account);
    return ['All', ...[...set].sort()];
  }, [brokerageOpen, brokerageClosed]);

  const filteredOpen = useMemo(
    () => (accountFilter === 'All' ? brokerageOpen : brokerageOpen.filter(l => l.account === accountFilter)),
    [brokerageOpen, accountFilter]
  );
  const filteredClosed = useMemo(
    () => (accountFilter === 'All' ? brokerageClosed : brokerageClosed.filter(l => l.account === accountFilter)),
    [brokerageClosed, accountFilter]
  );

  // Wash-sale lookahead — most-recent purchase per symbol across the open set.
  const recentPurchaseMap = useMemo(() => {
    const m = {};
    for (const l of filteredOpen) {
      if (!m[l.symbol] || l.dateAcquired > m[l.symbol]) m[l.symbol] = l.dateAcquired;
    }
    return m;
  }, [filteredOpen]);

  // ── REALIZED rows ──────────────────────────────────────────────────────────
  // Closed lots dated this year, oldest sold first.
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
        ? estimatedTax(gl, term, taxRates)            // tax owed (positive)
        : -(harvestSavings(gl, term, taxRates) || 0); // savings (negative)
      rows.push({
        kind: 'realized',
        status: 'CLOSED',
        symbol: lot.symbol,
        account: lot.account,
        dateAcquired: lot.dateAcquired,
        dateSold: lot.dateSold,
        term,
        gl,
        glPct: cost > 0 ? gl / cost : 0,
        taxImpact,
      });
    }
    rows.sort((a, b) => a.dateSold.localeCompare(b.dateSold));
    return rows;
  }, [filteredClosed, yearStart, taxRates]);

  // ── HARVEST OPTIONS rows ───────────────────────────────────────────────────
  // Open lots ordered to maximize gain-harvesting headroom:
  //   1) Losses, ST first (offsets ordinary-rate gains), biggest first.
  //   2) Losses, LT next, biggest first.
  //   3) Gains, LT first (preferential rate), biggest first.
  //   4) Gains, ST last (ordinary rate — generally avoid harvesting).
  const harvestOptionRows = useMemo(() => {
    const enriched = [];
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
      enriched.push({
        kind: 'option',
        status: 'OPEN',
        symbol: lot.symbol,
        account: lot.account,
        dateAcquired: lot.dateAcquired,
        term,
        gl,
        glPct: totalCost > 0 ? gl / totalCost : 0,
        taxImpact,
        daysToLT,
        washSaleRisk,
      });
    }
    // Bucketed sort: losses first (ST→LT, biggest abs first), gains after (LT→ST, biggest first).
    function bucket(r) {
      if (r.gl < 0 && r.term === 'short') return 0;
      if (r.gl < 0 && r.term === 'long')  return 1;
      if (r.gl >= 0 && r.term === 'long') return 2;
      return 3; // ST gains
    }
    enriched.sort((a, b) => {
      const ba = bucket(a);
      const bb = bucket(b);
      if (ba !== bb) return ba - bb;
      // Inside losses: most negative first. Inside gains: largest first.
      if (a.gl < 0) return a.gl - b.gl;
      return b.gl - a.gl;
    });
    return enriched;
  }, [filteredOpen, quotes, today, todayMs, taxRates, recentPurchaseMap, thirtyDaysAgo]);

  // ── Plan rows: REALIZED + OPTIONS, with running total ──────────────────────
  const planRows = useMemo(() => {
    const all = [...realizedRows, ...harvestOptionRows];
    return all.reduce((acc, r) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].running : 0;
      acc.push({ ...r, running: prev + r.gl });
      return acc;
    }, []);
  }, [realizedRows, harvestOptionRows]);

  // YTD totals (from realized only).
  const ytdNet = realizedRows.reduce((s, r) => s + r.gl, 0);
  const ytdSt = realizedRows.filter(r => r.term === 'short').reduce((s, r) => s + r.gl, 0);
  const ytdLt = realizedRows.filter(r => r.term === 'long').reduce((s, r) => s + r.gl, 0);

  // Plan endpoints — what running total would be if everything is harvested.
  const planEndRunning = planRows.length > 0 ? planRows[planRows.length - 1].running : ytdNet;

  // ST lots maturing into LT soon — useful "wait a bit longer" callout.
  const maturingSoon = useMemo(() => {
    return harvestOptionRows
      .filter(r => r.term === 'short' && r.gl > 0 && r.daysToLT > 0 && r.daysToLT <= MATURITY_WINDOW_DAYS);
  }, [harvestOptionRows]);

  // Loss-harvest target to hit -$3K from current YTD position.
  const lossToReach3k = ytdNet > ORD_LOSS_LIMIT ? ytdNet - ORD_LOSS_LIMIT : 0;

  if (loading) return <div className="th__loading">Loading portfolio…</div>;
  if (emptyState) return <div className="th__loading">No portfolio data yet — load a profile first.</div>;

  const noBrokerage = brokerageOpen.length === 0 && brokerageClosed.length === 0;
  const noQuotes = filteredOpen.length > 0 && harvestOptionRows.length === 0;

  return (
    <div className="th">
      <div className="th__head">
        <div>
          <div className="th__title">Tax Harvesting</div>
          <div className="th__subtitle">
            Brokerage accounts only · running total assumes every row above is sold today
          </div>
        </div>
        {brokerageAccounts.length > 1 && (
          <Segment
            options={brokerageAccounts.map(a => ({ label: a, value: a }))}
            value={accountFilter}
            onChange={setAccountFilter}
            mono
          />
        )}
      </div>

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
                label="Plan net (if all harvested)"
                value={formatCurrency(planEndRunning)}
                tone={planEndRunning >= 0 ? 'pos' : 'neg'}
                sub={`${planRows.length} lot${planRows.length === 1 ? '' : 's'} in plan`}
              />
            </Card>
          </div>

          <div className="th__note">
            <strong>Reading this table.</strong> The plan starts with realized closes from
            this year, then walks through open lots in a suggested harvest order
            (losses first, ST before LT; then gains, LT before ST). The
            <strong> Running Total</strong> column shows the net realized G/L if every row
            above is committed. Pick a stopping point — the marker rows flag where the
            plan crosses <strong>$0</strong>, <strong>-$3,000</strong> (ordinary-income
            offset cap), and <strong>-$10,000</strong>.
          </div>

          <Card>
            <PlanTable rows={planRows} ytdNet={ytdNet} moats={moats} />
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
// Unified Plan table — REALIZED then HARVEST OPTIONS, with running-total column
// ─────────────────────────────────────────────────────────────────────────────

function PlanTable({ rows, ytdNet, moats }) {
  if (rows.length === 0) {
    return <div className="th__empty">No realized G/L this year and no open brokerage lots to harvest.</div>;
  }

  const realized = rows.filter(r => r.kind === 'realized');
  const options  = rows.filter(r => r.kind === 'option');

  // Find the index in `options` where running total crosses each threshold.
  // Crossings are computed against the OPTIONS section so the dividers fall
  // between option rows, not between realized rows.
  const optionsStartRunning = realized.length > 0 ? realized[realized.length - 1].running : 0;

  const dividers = []; // { afterIndex (0-based in options, -1 = before first), kind, label }
  // Pre-options divider when YTD already crossed something.
  if (ytdNet < 0) {
    dividers.push({
      afterIndex: -1,
      kind: 'pos',
      label: `↑ YTD already net loss · gains up to ${formatCurrency(-ytdNet)} are tax-free below`,
    });
  }
  let lastRunning = optionsStartRunning;
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

  const colSpan = 10 + (realized.length > 0 ? 1 : 0);

  return (
    <div className="th__plan-wrap">
      <table className="th__plan">
        <thead>
          <tr>
            <th>Status</th>
            <th>Term</th>
            <th>Symbol</th>
            <th className="num">Gain %</th>
            <th className="num">Gain $</th>
            <th className="num">Est. Tax</th>
            <th>Acquired</th>
            {realized.length > 0 && <th>Sold</th>}
            <th>Account</th>
            <th>Moat</th>
            <th className="num">Running Total</th>
          </tr>
        </thead>
        <tbody>
          {realized.length > 0 && (
            <tr className="th__section">
              <td colSpan={colSpan}>
                REALIZED · {realized.length} closed lot{realized.length === 1 ? '' : 's'} this year
              </td>
            </tr>
          )}
          {realized.map((r, i) => (
            <PlanRow key={`r${i}`} row={r} moats={moats} showSold={true} />
          ))}

          <tr className="th__section">
            <td colSpan={colSpan}>
              HARVEST OPTIONS · {options.length} open lot{options.length === 1 ? '' : 's'} (suggested order)
            </td>
          </tr>

          {dividers.filter(d => d.afterIndex === -1).map((d, i) => (
            <DividerRow key={`d-pre-${i}`} divider={d} colSpan={colSpan} />
          ))}

          {options.map((r, i) => (
            <Fragment key={`o${i}`}>
              <PlanRow row={r} moats={moats} showSold={realized.length > 0} />
              {dividers
                .filter(d => d.afterIndex === i)
                .map((d, di) => (
                  <DividerRow key={`d-${i}-${di}`} divider={d} colSpan={colSpan} />
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanRow({ row, moats, showSold }) {
  const r = row;
  const isLoss = r.gl < 0;
  const inCarryForward = r.kind === 'option' && r.running < ORD_LOSS_LIMIT;
  const beyondCap      = r.kind === 'option' && r.running < -VIEW_CAP;
  return (
    <tr className={`th__row ${beyondCap ? 'th__row--dim' : ''} ${inCarryForward ? 'th__row--carry' : ''}`}>
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
      <td className={`num ${isLoss ? 'neg' : 'pos'}`}>{formatPct(r.glPct)}</td>
      <td className={`num ${isLoss ? 'neg' : 'pos'}`}>{formatCurrency(r.gl)}</td>
      <td className={`num ${r.taxImpact < 0 ? 'pos' : 'dim'}`}>
        {r.taxImpact != null ? formatCurrency(r.taxImpact) : '—'}
      </td>
      <td className="th__dim">{r.dateAcquired}</td>
      {showSold && <td className="th__dim">{r.dateSold || '—'}</td>}
      <td className="th__dim">{r.account}</td>
      <td><MoatBadges moat={moats[r.symbol]} /></td>
      <td className={`num th__running ${r.running >= 0 ? 'pos' : 'neg'}`}>
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

// ─────────────────────────────────────────────────────────────────────────────
// Moat badges — size + direction, mirrors MoatCard's color logic.
// ─────────────────────────────────────────────────────────────────────────────

const MOAT_SIZE_TONE = { WIDE: 'pos', NARROW: 'warn', NONE: 'neg' };
const MOAT_DIR_TONE  = { WIDENING: 'pos', STABLE: 'dim', NARROWING: 'neg' };
const MOAT_DIR_GLYPH = { WIDENING: '↑', STABLE: '→', NARROWING: '↓' };

// Moat values from the markdown files often include decorative emoji
// (e.g. "Wide 🛡️", "Stable ➡️"). Pull the first alphabetic token so the
// lookup is robust to that.
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
