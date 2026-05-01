import { Fragment, useMemo, useState } from 'react';
import { Card, Stat, Segment } from '../ui';
import { usePortfolio, useMoatSummaries } from '../hooks/usePortfolio';
import {
  ds, dc, lotProceeds, taxTerm, harvestSavings, estimatedTax,
  formatCurrency, formatPct, formatShares, DEFAULT_TAX_RATES,
} from '../utils/calculations';
import './TaxHarvesting.css';

/**
 * Tax-Harvesting tool — Brokerage-only.
 *
 * Two-column layout:
 *   Left  → highest-gain open lots (gain harvesting; LT-preferred)
 *   Right → highest-loss open lots (loss harvesting; ST-preferred)
 *
 * Both columns share a YTD-realized header and cumulative running totals.
 * The loss side shows the IRS -$3,000 ordinary-income offset marker and
 * the carry-forward zone out to -$10,000.
 */

const ORD_LOSS_LIMIT = -3000;        // IRS net cap-loss offset against ordinary income
const VIEW_CAP = 10000;              // ±$10K cumulative display cap (gain/loss sides)
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

  // YTD realized G/L from closed lots, split by term.
  const ytdRealized = useMemo(() => {
    let stGain = 0, stLoss = 0, ltGain = 0, ltLoss = 0;
    for (const lot of filteredClosed) {
      if (!lot.dateSold || lot.dateSold < yearStart) continue;
      const proceeds = lotProceeds(lot);
      const cost = ds(lot) * dc(lot);
      if (!proceeds || !cost) continue;
      const gl = proceeds - cost;
      const term = taxTerm(lot.dateAcquired, lot.dateSold);
      if (term === 'long') {
        if (gl >= 0) ltGain += gl; else ltLoss += gl;
      } else {
        if (gl >= 0) stGain += gl; else stLoss += gl;
      }
    }
    const stNet = stGain + stLoss;
    const ltNet = ltGain + ltLoss;
    const totalNet = stNet + ltNet;
    return { stGain, stLoss, ltGain, ltLoss, stNet, ltNet, totalNet };
  }, [filteredClosed, yearStart]);

  // Build harvestable open-lot rows with current value + term + gain/loss + tax impact.
  const enrichedOpen = useMemo(() => {
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
      const daysHeld = Math.floor((todayMs - new Date(lot.dateAcquired).getTime()) / MS_PER_DAY);
      const daysToLT = term === 'short' ? daysUntilLT(lot.dateAcquired, new Date(todayMs)) : 0;
      rows.push({
        lot,
        symbol: lot.symbol,
        description: lot.description,
        account: lot.account,
        dateAcquired: lot.dateAcquired,
        shares,
        costPerShare: cost,
        totalCost,
        price,
        currentValue,
        gl,
        glPct: totalCost > 0 ? gl / totalCost : 0,
        term,
        daysHeld,
        daysToLT,
      });
    }
    return rows;
  }, [filteredOpen, quotes, today, todayMs]);

  // Gain side — sort LT first, then largest gain. Tax estimated as cost.
  const gainRows = useMemo(() => {
    const gains = enrichedOpen
      .filter(r => r.gl > 0)
      .map(r => ({
        ...r,
        estTax: estimatedTax(r.gl, r.term, taxRates),
      }))
      .sort((a, b) => {
        if (a.term !== b.term) return a.term === 'long' ? -1 : 1;
        return b.gl - a.gl;
      });
    return gains.reduce((acc, r) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].cumGain : 0;
      acc.push({ ...r, cumGain: prev + r.gl });
      return acc;
    }, []);
  }, [enrichedOpen, taxRates]);

  // Loss side — sort ST first, then largest loss (most negative). Loss is a "savings" opportunity.
  // Wash-sale check: another lot of same symbol bought within last 30d.
  const lossRows = useMemo(() => {
    const losses = enrichedOpen
      .filter(r => r.gl < 0)
      .map(r => {
        const mostRecentBuy = recentPurchaseMap[r.symbol];
        const washSaleRisk = mostRecentBuy >= thirtyDaysAgo && mostRecentBuy !== r.dateAcquired;
        return {
          ...r,
          savings: harvestSavings(r.gl, r.term, taxRates),
          washSaleRisk,
        };
      })
      .sort((a, b) => {
        if (a.term !== b.term) return a.term === 'short' ? -1 : 1;
        return a.gl - b.gl;
      });
    return losses.reduce((acc, r) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].cumLoss : 0;
      acc.push({ ...r, cumLoss: prev + r.gl });
      return acc;
    }, []);
  }, [enrichedOpen, taxRates, recentPurchaseMap, thirtyDaysAgo]);

  // ST lots that turn LT within MATURITY_WINDOW_DAYS — worth waiting on for gain harvesting.
  const maturingSoon = useMemo(() => {
    return enrichedOpen
      .filter(r => r.term === 'short' && r.gl > 0 && r.daysToLT > 0 && r.daysToLT <= MATURITY_WINDOW_DAYS)
      .sort((a, b) => a.daysToLT - b.daysToLT);
  }, [enrichedOpen]);

  // Free-zone gain budget: how much LT/ST gain can be harvested while still net ≤ 0.
  // (Gains harvested up to abs(YTD net loss) are fully sheltered $-for-$.)
  const freeGainBudget = ytdRealized.totalNet < 0 ? Math.abs(ytdRealized.totalNet) : 0;
  const lossBufferTo3k = ytdRealized.totalNet > ORD_LOSS_LIMIT
    ? ytdRealized.totalNet - ORD_LOSS_LIMIT // amount of additional NET loss needed to reach -$3K
    : 0;

  if (loading) return <div className="th__loading">Loading portfolio…</div>;
  if (emptyState) return <div className="th__loading">No portfolio data yet — load a profile first.</div>;

  const noQuotes = filteredOpen.length > 0 && enrichedOpen.length === 0;
  const noBrokerage = brokerageOpen.length === 0 && brokerageClosed.length === 0;

  return (
    <div className="th">
      <div className="th__head">
        <div>
          <div className="th__title">Tax Harvesting</div>
          <div className="th__subtitle">Brokerage accounts only · open lots vs. last cached quote</div>
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
            No brokerage accounts found in the portfolio. This tool is intentionally
            limited to taxable Brokerage accounts — gain/loss harvesting has no
            tax effect inside Retirement, HSA, or ESA accounts.
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
                label="YTD Realized · ST"
                value={formatCurrency(ytdRealized.stNet)}
                tone={ytdRealized.stNet >= 0 ? 'pos' : 'neg'}
                sub={`Gains ${formatCurrency(ytdRealized.stGain)} · Losses ${formatCurrency(ytdRealized.stLoss)}`}
              />
            </Card>
            <Card>
              <Stat
                label="YTD Realized · LT"
                value={formatCurrency(ytdRealized.ltNet)}
                tone={ytdRealized.ltNet >= 0 ? 'pos' : 'neg'}
                sub={`Gains ${formatCurrency(ytdRealized.ltGain)} · Losses ${formatCurrency(ytdRealized.ltLoss)}`}
              />
            </Card>
            <Card>
              <Stat
                label="YTD Net Realized"
                value={formatCurrency(ytdRealized.totalNet)}
                tone={ytdRealized.totalNet >= 0 ? 'pos' : 'neg'}
                sub={
                  freeGainBudget > 0
                    ? `${formatCurrency(freeGainBudget)} of gains still tax-free`
                    : ytdRealized.totalNet > 0
                      ? `Need ${formatCurrency(ytdRealized.totalNet)} of losses to wipe out`
                      : 'No realized G/L this year'
                }
                subTone={freeGainBudget > 0 ? 'pos' : 'neutral'}
              />
            </Card>
            <Card>
              <Stat
                label="Loss Buffer to -$3K"
                value={lossBufferTo3k > 0 ? formatCurrency(-lossBufferTo3k) : '—'}
                tone="neg"
                sub={
                  lossBufferTo3k > 0
                    ? 'Additional NET loss needed to fully use the ordinary-income offset'
                    : ytdRealized.totalNet <= ORD_LOSS_LIMIT
                      ? 'Already at -$3K — additional losses will carry forward'
                      : 'Net is already a gain; losses offset gains first'
                }
              />
            </Card>
          </div>

          <div className="th__note">
            <strong>How tax-loss flows work:</strong> losses first offset gains $-for-$
            (ST losses → ST gains, LT losses → LT gains, then cross-over). Only the
            <em> net</em> loss after that is capped at $3,000 against ordinary income.
            Anything beyond carries forward indefinitely. <strong>Gain harvesting</strong>
            has no wash-sale rule — sell + immediately rebuy resets cost basis.
          </div>

          <div className="th__split">
            <HarvestColumn
              side="gain"
              title="Harvest Gains"
              subtitle="Long-term first · no wash-sale rule on gains"
              rows={gainRows}
              freeBudget={freeGainBudget}
              cap={VIEW_CAP}
              moats={moats}
            />
            <HarvestColumn
              side="loss"
              title="Harvest Losses"
              subtitle="Short-term first · watch the 30-day wash-sale window"
              rows={lossRows}
              ordLossLimit={ORD_LOSS_LIMIT}
              cap={VIEW_CAP}
              moats={moats}
            />
          </div>

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
// Column: cumulative chart + table
// ─────────────────────────────────────────────────────────────────────────────

function HarvestColumn({ side, title, subtitle, rows, freeBudget = 0, ordLossLimit = 0, cap, moats = {} }) {
  const isLoss = side === 'loss';
  const cumKey = isLoss ? 'cumLoss' : 'cumGain';

  const totalGL = rows.reduce((s, r) => s + r.gl, 0);
  const stCount = rows.filter(r => r.term === 'short').length;
  const ltCount = rows.filter(r => r.term === 'long').length;
  const totalSavings = rows.reduce((s, r) => s + (r.savings || 0), 0);
  const totalEstTax = rows.reduce((s, r) => s + (r.estTax || 0), 0);

  return (
    <Card className={`th__col th__col--${side}`}>
      <div className="th__col-head">
        <div>
          <div className="th__col-title">{title}</div>
          <div className="th__col-sub">{subtitle}</div>
        </div>
        <div className="th__col-stat">
          <div className={`th__col-stat-val ${isLoss ? 'neg' : 'pos'}`}>
            {formatCurrency(totalGL)}
          </div>
          <div className="th__col-stat-sub">
            {rows.length} lot{rows.length === 1 ? '' : 's'} · {ltCount} LT · {stCount} ST
            {isLoss
              ? ` · Est. savings ${formatCurrency(totalSavings)}`
              : ` · Est. tax ${formatCurrency(totalEstTax)}`}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="th__empty">
          {isLoss
            ? 'No open positions currently at a loss in brokerage accounts.'
            : 'No open positions currently at a gain in brokerage accounts.'}
        </div>
      ) : (
        <>
          <CumulativeChart
            rows={rows}
            cumKey={cumKey}
            cap={cap}
            isLoss={isLoss}
            ordLossLimit={ordLossLimit}
            freeBudget={freeBudget}
          />

          <div className="th__table-wrap">
            <table className="th__table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Moat</th>
                  <th>Acct</th>
                  <th>Acq.</th>
                  <th>Term</th>
                  <th className="num">Shares</th>
                  <th className="num">Cost</th>
                  <th className="num">Price</th>
                  <th className="num">{isLoss ? 'Loss $' : 'Gain $'}</th>
                  <th className="num">{isLoss ? 'Loss %' : 'Gain %'}</th>
                  <th className="num">Cum.</th>
                  <th className="num">{isLoss ? 'Savings' : 'Est. Tax'}</th>
                  {isLoss && <th>Wash</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cum = r[cumKey];
                  const crossesOrd = isLoss && cum <= ordLossLimit && (i === 0 || rows[i - 1][cumKey] > ordLossLimit);
                  const crossesCap = isLoss && cum <= -cap && (i === 0 || rows[i - 1][cumKey] > -cap);
                  const crossesFree = !isLoss && freeBudget > 0 && cum >= freeBudget && (i === 0 || rows[i - 1][cumKey] < freeBudget);
                  const inCarryForward = isLoss && cum < ordLossLimit;
                  const beyondCap = isLoss && cum < -cap;

                  return (
                    <Fragment key={i}>
                      {crossesFree && (
                        <tr className="th__divider th__divider--pos">
                          <td colSpan={12}>
                            ↑ Free zone (offsets YTD net losses) · ↓ Taxable beyond {formatCurrency(freeBudget)}
                          </td>
                        </tr>
                      )}
                      {crossesOrd && (
                        <tr className="th__divider th__divider--warn">
                          <td colSpan={13}>
                            ↑ Up to -$3,000 offsets ordinary income this year · ↓ Carry-forward zone
                          </td>
                        </tr>
                      )}
                      {crossesCap && (
                        <tr className="th__divider">
                          <td colSpan={13}>
                            ↓ Beyond -${cap.toLocaleString()} display cap (still valid carry-forward)
                          </td>
                        </tr>
                      )}
                      <tr className={`th__row ${beyondCap ? 'th__row--dim' : ''} ${inCarryForward ? 'th__row--carry' : ''}`}>
                        <td className="th__sym">{r.symbol}</td>
                        <td><MoatBadges moat={moats[r.symbol]} /></td>
                        <td className="th__dim">{r.account}</td>
                        <td className="th__dim">{r.dateAcquired}</td>
                        <td>
                          <span className={`th__term th__term--${r.term}`}>
                            {r.term === 'long' ? 'LT' : 'ST'}
                          </span>
                          {r.term === 'short' && r.daysToLT > 0 && r.daysToLT <= 90 && (
                            <span className="th__maturing"> {r.daysToLT}d→LT</span>
                          )}
                        </td>
                        <td className="num">{formatShares(r.shares)}</td>
                        <td className="num">{formatCurrency(r.costPerShare)}</td>
                        <td className="num">{formatCurrency(r.price)}</td>
                        <td className={`num ${isLoss ? 'neg' : 'pos'}`}>{formatCurrency(r.gl)}</td>
                        <td className={`num ${isLoss ? 'neg' : 'pos'}`}>{formatPct(r.glPct)}</td>
                        <td className={`num ${isLoss ? 'neg' : 'pos'}`}>{formatCurrency(cum)}</td>
                        <td className={`num ${isLoss ? 'pos' : 'dim'}`}>
                          {isLoss
                            ? r.savings != null ? formatCurrency(r.savings) : '—'
                            : r.estTax != null ? formatCurrency(r.estTax) : '—'}
                        </td>
                        {isLoss && (
                          <td>
                            {r.washSaleRisk
                              ? <span className="th__wash th__wash--risk">⚠</span>
                              : <span className="th__wash th__wash--ok">OK</span>}
                          </td>
                        )}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Moat badges — size + direction, mirrors MoatCard's color logic.
// ─────────────────────────────────────────────────────────────────────────────

const MOAT_SIZE_TONE = { WIDE: 'pos', NARROW: 'warn', NONE: 'neg' };
const MOAT_DIR_TONE  = { WIDENING: 'pos', STABLE: 'dim', NARROWING: 'neg' };
const MOAT_DIR_GLYPH = { WIDENING: '↑', STABLE: '→', NARROWING: '↓' };

// Moat values from the markdown files often include decorative emoji
// (e.g. "Wide 🛡️", "Stable ➡️"). Pull out the first alphabetic token so the
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

// ─────────────────────────────────────────────────────────────────────────────
// Inline cumulative SVG chart with marker lines.
// X axis = lot index, Y axis = running total. Capped at ±cap for display.
// ─────────────────────────────────────────────────────────────────────────────

function CumulativeChart({ rows, cumKey, cap, isLoss, ordLossLimit, freeBudget }) {
  const width = 600;
  const height = 160;
  const pad = { t: 16, r: 16, b: 22, l: 64 };

  if (rows.length === 0) return null;

  const yMin = isLoss ? -cap : 0;
  const yMax = isLoss ? 0 : cap;
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const x = (i) => pad.l + (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
  const clamp = (v) => Math.max(yMin, Math.min(yMax, v));
  const y = (v) => pad.t + (1 - (clamp(v) - yMin) / (yMax - yMin)) * plotH;

  const points = rows.map((r, i) => [x(i), y(r[cumKey])]);
  const baselineY = y(0);
  const path = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const areaPath = `${path} L ${x(rows.length - 1)} ${baselineY} L ${x(0)} ${baselineY} Z`;

  const stroke = isLoss ? 'var(--neg)' : 'var(--pos)';

  // Marker lines
  const markers = [];
  if (isLoss) {
    if (ordLossLimit > yMin) {
      markers.push({ value: ordLossLimit, label: '-$3K · ord. income limit', cls: 'warn' });
    }
    markers.push({ value: -cap, label: `-$${(cap / 1000).toFixed(0)}K · cap`, cls: 'dim' });
  } else if (freeBudget > 0 && freeBudget < yMax) {
    markers.push({ value: freeBudget, label: `${formatCurrency(freeBudget)} · free zone`, cls: 'pos' });
  }

  return (
    <div className="th__chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="th__chart-svg">
        {/* Y grid (3 ticks) */}
        {[0, 0.5, 1].map(t => {
          const v = yMin + (yMax - yMin) * t;
          const yy = y(v);
          return (
            <g key={t}>
              <line x1={pad.l} y1={yy} x2={width - pad.r} y2={yy} className="th__grid" />
              <text x={pad.l - 8} y={yy + 3} textAnchor="end" className="th__axis">
                {formatCurrency(v)}
              </text>
            </g>
          );
        })}

        {/* Marker lines */}
        {markers.map((m, i) => {
          const yy = y(m.value);
          return (
            <g key={`m${i}`}>
              <line x1={pad.l} y1={yy} x2={width - pad.r} y2={yy} className={`th__marker th__marker--${m.cls}`} />
              <text x={width - pad.r - 4} y={yy - 4} textAnchor="end" className={`th__marker-lbl th__marker-lbl--${m.cls}`}>
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Area + line */}
        <path d={areaPath} fill={stroke} fillOpacity="0.12" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Lot dots */}
        {points.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r="2.5" fill={stroke} />
        ))}

        {/* X axis label */}
        <text x={pad.l} y={height - 4} className="th__axis">lot 1</text>
        <text x={width - pad.r} y={height - 4} textAnchor="end" className="th__axis">
          lot {rows.length}
        </text>
      </svg>
    </div>
  );
}
