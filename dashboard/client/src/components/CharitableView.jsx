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

  // YTD snapshot for the hero — always shows current calendar year regardless
  // of the time-range segment (which scopes the lower analytical sections).
  // Taxes saved approximates LT capital gains avoided by donating appreciated
  // stock instead of selling: (proceeds − cost basis) × LT rate, only counted
  // for lots held more than a year (donating short-term gains caps the
  // deduction at basis, so the tax benefit is much smaller).
  const ytd = useMemo(() => {
    const year = new Date().getFullYear();
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;
    const inYear = (e) => e.date >= yearStart && e.date <= yearEnd;

    const contribs = (data?.contributions || []).filter(inYear);
    const distribs = (data?.distributions || []).filter(inYear);

    const ONE_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
    let taxesSaved = 0;
    for (const c of contribs) {
      if (c.costBasis == null || !c.dateAcquired) continue;
      const heldMs = new Date(c.date) - new Date(c.dateAcquired);
      const isLT = heldMs >= ONE_YEAR_MS;
      const gain = c.amount - c.costBasis;
      if (gain <= 0 || !isLT) continue;
      taxesSaved += gain * DEFAULT_TAX_RATES.lt;
    }

    return {
      year,
      contribTotal: contribs.reduce((s, e) => s + (e.amount || 0), 0),
      contribCount: contribs.length,
      distribTotal: distribs.reduce((s, e) => s + (e.amount || 0), 0),
      distribCount: distribs.length,
      taxesSaved,
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

  // Sector pie data — only distributions, since contributions don't carry a
  // sector. Slice colors come from the series tokens so the chart restyles
  // when the accent palette changes.
  const sectorData = useMemo(() => {
    const bySector = new Map();
    for (const d of filtered.distributions) {
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
  }, [filtered.distributions]);

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
      })
      .sort((a, b) => b.total - a.total);
    const yearTotals = {};
    for (const y of yearList) {
      yearTotals[y] = orgRows.reduce((s, r) => s + (r.cells[y] || 0), 0);
    }
    const grandTotal = orgRows.reduce((s, r) => s + r.total, 0);
    return { years: yearList, rows: orgRows, yearTotals, grandTotal };
  }, [filtered.distributions]);

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
  const subtitle = earliestDate
    ? `Activity since ${earliestDate}`
    : 'No charitable activity yet';

  return (
    <div className="ch">
      <div className="ch__head">
        <div>
          <div className="ch__title">Charitable Tracking</div>
          <div className="ch__subtitle">{subtitle}</div>
        </div>
        <div className="ch__head-right">
          <Button variant="ghost" onClick={reload}>Reload from sheet</Button>
        </div>
      </div>

      <Card variant="grad" className="ch__hero">
        <div className="ch__hero-head">
          <div className="ch__hero-eyebrow">YTD Activity</div>
          <div className="ch__hero-year">{ytd.year}</div>
        </div>
        <div className="ch__hero-grid">
          <Stat
            label="Contributions"
            value={fmtUSD(ytd.contribTotal)}
            sub={`${ytd.contribCount} contribution${ytd.contribCount === 1 ? '' : 's'}`}
            size="lg"
            tone={ytd.contribTotal > 0 ? 'pos' : 'neutral'}
          />
          <div className="ch__hero-divider" />
          <Stat
            label="Taxes saved"
            value={fmtUSD(ytd.taxesSaved)}
            sub={`Est. LT cap-gains @ ${(DEFAULT_TAX_RATES.lt * 100).toFixed(1)}%`}
            size="lg"
            tone={ytd.taxesSaved > 0 ? 'pos' : 'neutral'}
          />
          <div className="ch__hero-divider" />
          <Stat
            label="Distributions"
            value={fmtUSD(ytd.distribTotal)}
            sub={`${ytd.distribCount} grant${ytd.distribCount === 1 ? '' : 's'}`}
            size="lg"
            tone={ytd.distribTotal > 0 ? 'neg' : 'neutral'}
          />
        </div>
      </Card>

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
          <div className="ch__split">
            <Card className="ch__pie-card">
              <div className="ch__section-title">Distributions by sector</div>
              {sectorData.length === 0 ? (
                <div className="ch__empty">No distributions in the selected range.</div>
              ) : (
                <div className="ch__pie-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectorData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        innerRadius={60}
                        paddingAngle={1}
                        label={({ name, value }) =>
                          distribTotal ? `${name} · ${(value / distribTotal * 100).toFixed(0)}%` : name
                        }
                      >
                        {sectorData.map((slice) => (
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

            <Card>
              <div className="ch__section-title">Top organizations</div>
              {orgTable.rows.length === 0 ? (
                <div className="ch__empty">No distributions in the selected range.</div>
              ) : (
                <div className="ch__table-scroll">
                  <table className="ch__table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        {orgTable.years.map(y => (
                          <th key={y} className="ch__num">{y}</th>
                        ))}
                        <th className="ch__num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgTable.rows.map(r => (
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
          </div>

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

          {stockTable.rows.length > 0 && (
            <Card>
              <div className="ch__section-title">Stock contributions by ticker</div>
              <div className="ch__table-scroll">
                <table className="ch__table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      {stockTable.years.map(y => (
                        <th key={y} className="ch__num">{y}</th>
                      ))}
                      <th className="ch__num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockTable.rows.map(r => (
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
