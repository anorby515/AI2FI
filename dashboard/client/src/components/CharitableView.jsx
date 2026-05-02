import { useCallback, useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, Stat, Button, Segment } from '../ui';
import { DEFAULT_TAX_RATES } from '../utils/calculations';
import './CharitableView.css';

// Charitable Tracking — pairs Brokerage Ledger charitable stock sales
// (contributions INTO the trust) with the Charitable Trust tab
// (distributions OUT to organizations).

const RANGE_OPTIONS = [
  { label: 'YTD',    value: 'YTD' },
  { label: '1 Year', value: '1Y' },
  { label: '3 Year', value: '3Y' },
  { label: 'All',    value: 'All' },
];

// Reuse the design system's series tokens so the pie restyles when the
// accent palette changes.
const SECTOR_COLORS = [
  'var(--accent)',
  'var(--accent-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
];

function fmtUSD(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(v);
}

function fmtUSDSigned(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return sign + new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Math.abs(v));
}

function fmtUSDK(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1_000_000) return s + '$' + (a / 1_000_000).toFixed(2) + 'M';
  if (a >= 1_000) return s + '$' + Math.round(a / 1000) + 'k';
  return s + '$' + Math.round(a);
}

function fmtShares(n) {
  if (!Number.isFinite(n) || n === 0) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '');
}

function quarterKey(iso) {
  const [y, m] = iso.split('-').map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y} Q${q}`;
}

function rangeStartISO(range) {
  const now = new Date();
  if (range === 'YTD') return `${now.getFullYear()}-01-01`;
  if (range === '1Y') {
    const d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    return d.toISOString().slice(0, 10);
  }
  if (range === '3Y') {
    const d = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// Generate every quarter key between the earliest and latest date so the
// quarter-by-quarter table has zero-filled gaps for empty quarters in the
// middle of the range.
function quartersBetween(startISO, endISO) {
  if (!startISO || !endISO || startISO > endISO) return [];
  const [sy, sm] = startISO.split('-').map(Number);
  const [ey, em] = endISO.split('-').map(Number);
  let y = sy, q = Math.floor((sm - 1) / 3) + 1;
  const endQ = Math.floor((em - 1) / 3) + 1;
  const out = [];
  while (y < ey || (y === ey && q <= endQ)) {
    out.push(`${y} Q${q}`);
    q += 1;
    if (q > 4) { q = 1; y += 1; }
  }
  return out;
}

export default function CharitableView() {
  const [data, setData] = useState(null);
  const [errorBody, setErrorBody] = useState(null);
  // Default to All so the explore tables show every ticker/org out of the box;
  // the YTD hero is locked to current calendar year regardless.
  const [range, setRange] = useState('All');

  // Per-table sort state. Numeric columns default to desc on first click,
  // text columns to asc. Clicking the active column toggles direction.
  const [orgSort, setOrgSort] = useState({ col: 'total', dir: 'desc' });
  const [stockSort, setStockSort] = useState({ col: 'total', dir: 'desc' });

  function toggleSort(setter, prevState, col, isText = false) {
    if (prevState.col === col) {
      setter({ col, dir: prevState.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setter({ col, dir: isText ? 'asc' : 'desc' });
    }
  }

  const reload = useCallback(() => {
    setErrorBody(null);
    fetch('/api/charitable')
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) { setErrorBody({ status: r.status, ...body }); return null; }
        return body;
      })
      .then((body) => { if (body) setData(body); })
      .catch((e) => setErrorBody({ status: 0, error: e.message }));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Apply the time filter to both contributions and distributions.
  const filtered = useMemo(() => {
    if (!data) return { contributions: [], distributions: [] };
    const start = rangeStartISO(range);
    const inRange = (e) => !start || e.date >= start;
    return {
      contributions: (data.contributions || []).filter(inRange),
      distributions: (data.distributions || []).filter(inRange),
    };
  }, [data, range]);

  const contribTotal = useMemo(
    () => filtered.contributions.reduce((s, e) => s + (e.amount || 0), 0),
    [filtered.contributions],
  );
  const distribTotal = useMemo(
    () => filtered.distributions.reduce((s, e) => s + (e.amount || 0), 0),
    [filtered.distributions],
  );
  const netInTrust = contribTotal - distribTotal;

  // Earliest event date — drives the subtitle.
  const earliestDate = useMemo(() => {
    const all = [...(data?.contributions || []), ...(data?.distributions || [])];
    if (!all.length) return null;
    return all.reduce((min, e) => (min == null || e.date < min) ? e.date : min, null);
  }, [data]);

  // Activity aggregates for the hero — fixed time scopes (lifetime, YTD,
  // last year) independent of the time-range segment filter below.
  const activity = useMemo(() => {
    const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    function aggregate(startISO, endISO) {
      const inRange = (e) => e.date >= startISO && e.date <= endISO;
      const contribs = (data?.contributions || []).filter(inRange);
      const distribs = (data?.distributions || []).filter(inRange);
      let taxesAvoided = 0;
      for (const c of contribs) {
        if (c.costBasis == null || !c.dateAcquired) continue;
        const heldMs = new Date(c.date) - new Date(c.dateAcquired);
        if (heldMs < ONE_YEAR_MS) continue;
        const gain = c.amount - c.costBasis;
        if (gain <= 0) continue;
        taxesAvoided += gain * DEFAULT_TAX_RATES.lt;
      }
      return {
        contribTotal: contribs.reduce((s, e) => s + (e.amount || 0), 0),
        contribCount: contribs.length,
        distribTotal: distribs.reduce((s, e) => s + (e.amount || 0), 0),
        distribCount: distribs.length,
        taxesAvoided,
      };
    }
    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;
    return {
      lifetime: aggregate('0000-01-01', '9999-12-31'),
      ytd:      { year: thisYear, ...aggregate(`${thisYear}-01-01`, `${thisYear}-12-31`) },
      lastYear: { year: lastYear, ...aggregate(`${lastYear}-01-01`, `${lastYear}-12-31`) },
    };
  }, [data]);

  // Quarter-by-quarter pivot. Every quarter between the earliest and latest
  // event in the filtered window gets a column so empty quarters render as $0
  // instead of disappearing.
  const quarterTable = useMemo(() => {
    const all = [...filtered.contributions, ...filtered.distributions];
    if (!all.length) return { quarters: [], contribByQuarter: {}, distribByQuarter: {} };
    all.sort((a, b) => a.date.localeCompare(b.date));
    const quarters = quartersBetween(all[0].date, all[all.length - 1].date);
    const contribByQuarter = {};
    const distribByQuarter = {};
    for (const q of quarters) { contribByQuarter[q] = 0; distribByQuarter[q] = 0; }
    for (const e of filtered.contributions) {
      const q = quarterKey(e.date);
      if (q in contribByQuarter) contribByQuarter[q] += e.amount;
    }
    for (const e of filtered.distributions) {
      const q = quarterKey(e.date);
      if (q in distribByQuarter) distribByQuarter[q] += e.amount;
    }
    return { quarters, contribByQuarter, distribByQuarter };
  }, [filtered]);

  // Stock Contributions pivot: rows = ticker, columns = calendar years.
  const stockTable = useMemo(() => {
    const years = new Set();
    const bySymYear = new Map();
    for (const c of filtered.contributions) {
      const y = Number(c.date.slice(0, 4));
      if (!Number.isFinite(y)) continue;
      years.add(y);
      const sym = c.symbol || '(unknown)';
      if (!bySymYear.has(sym)) bySymYear.set(sym, {});
      const cells = bySymYear.get(sym);
      if (!cells[y]) cells[y] = { amount: 0, shares: 0 };
      cells[y].amount += c.amount || 0;
      cells[y].shares += Number(c.shares) || 0;
    }
    const yearList = [...years].sort((a, b) => a - b);
    const symRows = [...bySymYear.entries()]
      .map(([symbol, cells]) => {
        const total = yearList.reduce(
          (acc, y) => ({
            amount: acc.amount + (cells[y]?.amount || 0),
            shares: acc.shares + (cells[y]?.shares || 0),
          }),
          { amount: 0, shares: 0 },
        );
        return { symbol, cells, total };
      })
      .sort((a, b) => b.total.amount - a.total.amount);
    const yearTotals = {};
    for (const y of yearList) {
      yearTotals[y] = symRows.reduce(
        (acc, r) => ({
          amount: acc.amount + (r.cells[y]?.amount || 0),
          shares: acc.shares + (r.cells[y]?.shares || 0),
        }),
        { amount: 0, shares: 0 },
      );
    }
    const grandTotal = symRows.reduce(
      (acc, r) => ({ amount: acc.amount + r.total.amount, shares: acc.shares + r.total.shares }),
      { amount: 0, shares: 0 },
    );
    return { years: yearList, rows: symRows, yearTotals, grandTotal };
  }, [filtered.contributions]);

  // Lifetime sector pie — pinned to the overview block so it reads as a
  // top-level snapshot, not affected by the time-range segment.
  const sectorDataLifetime = useMemo(() => {
    const bySector = new Map();
    for (const d of (data?.distributions || [])) {
      const k = d.sector || 'Uncategorized';
      bySector.set(k, (bySector.get(k) || 0) + d.amount);
    }
    return [...bySector.entries()]
      .map(([name, value], i) => ({
        name,
        value,
        color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);
  const lifetimeDistribTotal = useMemo(
    () => sectorDataLifetime.reduce((s, x) => s + x.value, 0),
    [sectorDataLifetime],
  );

  // Organization × Calendar-Year pivot for the donations summary.
  const orgTable = useMemo(() => {
    const years = new Set();
    const byOrgYear = new Map();
    for (const d of filtered.distributions) {
      const y = Number(d.date.slice(0, 4));
      if (!Number.isFinite(y)) continue;
      years.add(y);
      const org = d.organization || '(unspecified)';
      if (!byOrgYear.has(org)) byOrgYear.set(org, {});
      const cells = byOrgYear.get(org);
      cells[y] = (cells[y] || 0) + d.amount;
    }
    const yearList = [...years].sort((a, b) => a - b);
    const orgRows = [...byOrgYear.entries()]
      .map(([org, cells]) => {
        const total = yearList.reduce((s, y) => s + (cells[y] || 0), 0);
        return { org, cells, total };
      });
    const yearTotals = {};
    for (const y of yearList) {
      yearTotals[y] = orgRows.reduce((s, r) => s + (r.cells[y] || 0), 0);
    }
    const grandTotal = orgRows.reduce((s, r) => s + r.total, 0);
    return { years: yearList, rows: orgRows, yearTotals, grandTotal };
  }, [filtered.distributions]);

  const sortedOrgRows = useMemo(() => {
    const rows = [...orgTable.rows];
    const dir = orgSort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av, bv;
      if (orgSort.col === 'org') { av = a.org.toLowerCase(); bv = b.org.toLowerCase(); }
      else if (orgSort.col === 'total') { av = a.total; bv = b.total; }
      else { av = a.cells[orgSort.col] || 0; bv = b.cells[orgSort.col] || 0; }
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });
    return rows;
  }, [orgTable.rows, orgSort]);

  const sortedStockRows = useMemo(() => {
    const rows = [...stockTable.rows];
    const dir = stockSort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av, bv;
      if (stockSort.col === 'symbol') { av = a.symbol.toLowerCase(); bv = b.symbol.toLowerCase(); }
      else if (stockSort.col === 'total') { av = a.total.amount; bv = b.total.amount; }
      else { av = a.cells[stockSort.col]?.amount || 0; bv = b.cells[stockSort.col]?.amount || 0; }
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });
    return rows;
  }, [stockTable.rows, stockSort]);

  if (errorBody) {
    return (
      <div className="ch">
        <div className="ch__head">
          <div>
            <div className="ch__title">Charitable Tracking</div>
          </div>
          <div className="ch__head-right">
            <Button variant="ghost" onClick={reload}>Reload from sheet</Button>
          </div>
        </div>
        <Card>
          <div className="ch__error">{errorBody.error || `Failed to load (status ${errorBody.status}).`}</div>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ch">
        <div className="ch__head">
          <div>
            <div className="ch__title">Charitable Tracking</div>
          </div>
          <div className="ch__head-right">
            <Button variant="ghost" onClick={reload}>Reload from sheet</Button>
          </div>
        </div>
        <div className="ch__loading">Loading…</div>
      </div>
    );
  }

  const tabMissing = data.distributionsTabFound === false;
  const noData = !filtered.contributions.length && !filtered.distributions.length;
  const meta = data.meta || {};
  const timeframe = meta.timeframe
    || (earliestDate ? `Activity since ${earliestDate}` : 'No charitable activity yet');

  // "<Account> | Current Balance $X (as of date)" — surfaced directly from
  // the spreadsheet's Charitable Trust header rows when present.
  const accountStrip = (meta.account || meta.currentBalance != null) ? (
    <div className="ch__account-strip">
      {meta.account && <span className="ch__account-name">{meta.account}</span>}
      {meta.account && meta.currentBalance != null && <span className="ch__pipe">|</span>}
      {meta.currentBalance != null && (
        <>
          <span className="ch__balance-label">Current Balance</span>
          <span className="ch__balance-value">{fmtUSD(meta.currentBalance)}</span>
          {meta.currentBalanceAsOf && (
            <span className="ch__balance-asof">(as of {meta.currentBalanceAsOf})</span>
          )}
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="ch">
      <div className="ch__head">
        <div className="ch__head-left">
          <div className="ch__title">Charitable Tracking</div>
          {accountStrip}
          <div className="ch__subtitle">{timeframe}</div>
        </div>
        <div className="ch__head-right">
          <Button variant="ghost" onClick={reload}>Reload from sheet</Button>
        </div>
      </div>

      <div className="ch__overview">
        <Card variant="grad" className="ch__hero">
          <ActivityRow eyebrow="Lifetime Activity" tag={earliestDate ? `since ${earliestDate.slice(0, 4)}` : null} agg={activity.lifetime} />
          <div className="ch__hero-sep" />
          <ActivityRow eyebrow="YTD" tag={String(activity.ytd.year)} agg={activity.ytd} />
          <div className="ch__hero-sep" />
          <ActivityRow eyebrow="Last Year" tag={String(activity.lastYear.year)} agg={activity.lastYear} />
        </Card>

        <Card className="ch__pie-card">
          <div className="ch__section-title">Distributions by sector · lifetime</div>
          {sectorDataLifetime.length === 0 ? (
            <div className="ch__empty">No distributions recorded yet.</div>
          ) : (
            <div className="ch__pie-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorDataLifetime}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    innerRadius={55}
                    paddingAngle={1}
                    label={({ name, value }) =>
                      lifetimeDistribTotal ? `${name} · ${(value / lifetimeDistribTotal * 100).toFixed(0)}%` : name
                    }
                  >
                    {sectorDataLifetime.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} stroke="var(--card)" strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--card-hi)', border: '1px solid var(--rule-3)', fontSize: 12 }}
                    formatter={(v, name) => [fmtUSD(v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="ch__filter-bar">
        <span className="ch__filter-label">Explore activity over</span>
        <Segment options={RANGE_OPTIONS} value={range} onChange={setRange} mono />
        <span className="ch__filter-tag">{rangeLabel(range)} · net {fmtUSDSigned(netInTrust)}</span>
      </div>

      {tabMissing && (
        <Card>
          <div className="ch__schema-hint">
            <strong>No <code>Charitable Trust</code> tab in the spreadsheet yet.</strong>{' '}
            Distributions will be empty until one exists. Expected columns:
            {' '}<code>Date</code>, <code>Organization</code>, <code>Sector</code>, <code>Amount</code>.
            {' '}Contributions are still pulled from <code>Brokerage Ledger</code> rows where
            {' '}<code>Charitable Donation = Yes</code>.
          </div>
        </Card>
      )}

      {noData ? (
        <Card>
          <div className="ch__empty">No charitable activity in the selected range.</div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="ch__section-title">Quarterly cash flow</div>
            <div className="ch__table-scroll">
              <table className="ch__table">
                <thead>
                  <tr>
                    <th>Flow</th>
                    {quarterTable.quarters.map(q => (
                      <th key={q} className="ch__num">{q}</th>
                    ))}
                    <th className="ch__num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="ch__row-label">
                      <span className="ch__bullet ch__bullet--pos" /> Contributions
                    </td>
                    {quarterTable.quarters.map(q => (
                      <td
                        key={q}
                        className={`ch__num ${quarterTable.contribByQuarter[q] > 0 ? 'ch__pos' : 'ch__dim'}`}
                      >
                        {quarterTable.contribByQuarter[q] > 0
                          ? fmtUSD(quarterTable.contribByQuarter[q])
                          : '—'}
                      </td>
                    ))}
                    <td className="ch__num ch__pos ch__strong">{fmtUSD(contribTotal)}</td>
                  </tr>
                  <tr>
                    <td className="ch__row-label">
                      <span className="ch__bullet ch__bullet--neg" /> Distributions
                    </td>
                    {quarterTable.quarters.map(q => (
                      <td
                        key={q}
                        className={`ch__num ${quarterTable.distribByQuarter[q] > 0 ? 'ch__neg' : 'ch__dim'}`}
                      >
                        {quarterTable.distribByQuarter[q] > 0
                          ? fmtUSD(quarterTable.distribByQuarter[q])
                          : '—'}
                      </td>
                    ))}
                    <td className="ch__num ch__neg ch__strong">{fmtUSD(distribTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="ch__section-title">Top organizations</div>
            {orgTable.rows.length === 0 ? (
              <div className="ch__empty">No distributions in the selected range.</div>
            ) : (
              <div className="ch__table-scroll">
                <table className="ch__table">
                  <thead>
                    <tr>
                      <SortableTh
                        col="org"
                        label="Organization"
                        sort={orgSort}
                        onSort={(c) => toggleSort(setOrgSort, orgSort, c, true)}
                      />
                      {orgTable.years.map(y => (
                        <SortableTh
                          key={y}
                          col={y}
                          label={y}
                          numeric
                          sort={orgSort}
                          onSort={(c) => toggleSort(setOrgSort, orgSort, c)}
                        />
                      ))}
                      <SortableTh
                        col="total"
                        label="Total"
                        numeric
                        sort={orgSort}
                        onSort={(c) => toggleSort(setOrgSort, orgSort, c)}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOrgRows.map(r => (
                      <tr key={r.org}>
                        <td className="ch__org">{r.org}</td>
                        {orgTable.years.map(y => (
                          <td key={y} className={`ch__num ${r.cells[y] ? '' : 'ch__dim'}`}>
                            {r.cells[y] ? fmtUSD(r.cells[y]) : '—'}
                          </td>
                        ))}
                        <td className="ch__num ch__strong">{fmtUSD(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="ch__totals-row">
                      <td>Total</td>
                      {orgTable.years.map(y => (
                        <td key={y} className="ch__num">{fmtUSD(orgTable.yearTotals[y])}</td>
                      ))}
                      <td className="ch__num">{fmtUSD(orgTable.grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {stockTable.rows.length > 0 && (
            <Card>
              <div className="ch__section-title">Stock contributions by ticker</div>
              <div className="ch__table-scroll">
                <table className="ch__table">
                  <thead>
                    <tr>
                      <SortableTh
                        col="symbol"
                        label="Ticker"
                        sort={stockSort}
                        onSort={(c) => toggleSort(setStockSort, stockSort, c, true)}
                      />
                      {stockTable.years.map(y => (
                        <SortableTh
                          key={y}
                          col={y}
                          label={y}
                          numeric
                          sort={stockSort}
                          onSort={(c) => toggleSort(setStockSort, stockSort, c)}
                        />
                      ))}
                      <SortableTh
                        col="total"
                        label="Total"
                        numeric
                        sort={stockSort}
                        onSort={(c) => toggleSort(setStockSort, stockSort, c)}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStockRows.map(r => (
                      <tr key={r.symbol}>
                        <td className="ch__ticker">{r.symbol}</td>
                        {stockTable.years.map(y => {
                          const cell = r.cells[y];
                          return (
                            <td key={y} className={`ch__num ${cell?.amount ? '' : 'ch__dim'}`}>
                              {cell?.amount ? (
                                <>
                                  {fmtUSD(cell.amount)}
                                  <span className="ch__shares"> · {fmtShares(cell.shares)} sh</span>
                                </>
                              ) : '—'}
                            </td>
                          );
                        })}
                        <td className="ch__num ch__strong">
                          {fmtUSD(r.total.amount)}
                          <span className="ch__shares"> · {fmtShares(r.total.shares)} sh</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="ch__totals-row">
                      <td>Total</td>
                      {stockTable.years.map(y => {
                        const t = stockTable.yearTotals[y];
                        return (
                          <td key={y} className="ch__num">
                            {fmtUSD(t.amount)}
                            <span className="ch__shares"> · {fmtShares(t.shares)} sh</span>
                          </td>
                        );
                      })}
                      <td className="ch__num">
                        {fmtUSD(stockTable.grandTotal.amount)}
                        <span className="ch__shares"> · {fmtShares(stockTable.grandTotal.shares)} sh</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function rangeLabel(r) {
  switch (r) {
    case 'YTD': return 'Year to date';
    case '1Y':  return 'Last 12 months';
    case '3Y':  return 'Last 3 years';
    default:    return 'Since inception';
  }
}

function SortableTh({ col, label, numeric = false, sort, onSort }) {
  const active = sort.col === col;
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : '';
  return (
    <th
      className={`${numeric ? 'ch__num ' : ''}ch__sortable${active ? ' ch__sortable--active' : ''}`}
      onClick={() => onSort(col)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(col); } }}
    >
      <span className="ch__sort-label">
        {label}
        <span className="ch__sort-arrow">{arrow || '⇅'}</span>
      </span>
    </th>
  );
}

function ActivityRow({ eyebrow, tag, agg }) {
  return (
    <div className="ch__hero-section">
      <div className="ch__hero-head">
        <div className="ch__hero-eyebrow">{eyebrow}</div>
        {tag && <div className="ch__hero-year">{tag}</div>}
      </div>
      <div className="ch__hero-grid">
        <Stat
          label="Contributions"
          value={fmtUSD(agg.contribTotal)}
          sub={`${agg.contribCount} contribution${agg.contribCount === 1 ? '' : 's'}`}
          tone={agg.contribTotal > 0 ? 'pos' : 'neutral'}
        />
        <div className="ch__hero-divider" />
        <Stat
          label="Taxes avoided"
          value={fmtUSD(agg.taxesAvoided)}
          sub={`Est. LT cap-gains @ ${(DEFAULT_TAX_RATES.lt * 100).toFixed(1)}%`}
          tone={agg.taxesAvoided > 0 ? 'pos' : 'neutral'}
        />
        <div className="ch__hero-divider" />
        <Stat
          label="Distributions"
          value={fmtUSD(agg.distribTotal)}
          sub={`${agg.distribCount} grant${agg.distribCount === 1 ? '' : 's'}`}
          tone={agg.distribTotal > 0 ? 'neg' : 'neutral'}
        />
      </div>
    </div>
  );
}
