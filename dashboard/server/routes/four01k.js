// /api/401k — read-only parser for the 401k Ledger and 401k Ticker Map tabs.
//
// ── DEDUP INVARIANT (Phase 5) ─────────────────────────────────────────────
// Some Exchange Out rows here represent dollars leaving the main 401k for the
// BrokerageLink account (652488644). Those same dollars appear in the
// BrokerageLink ledger as TRANSFERRED FROM. A future Retirement rollup that
// naively sums dollar flows across both ledgers will double-count.
//
// Contract for any consumer rolling up the Retirement section:
//   1. PREFER summing current balances per account, not transaction flows.
//   2. If you must sum flows, treat rows where transactionType === 'Exchange
//      In' or 'Exchange Out' as INTRA-401K (cancels within account 89551) and
//      rows on BrokerageLink with actionType === 'TRANSFER' as already
//      reflected in the 401k Ledger Exchange Out — DO NOT count them again.
//   3. Outside-money contributions = sum of `Contributions` rows ONLY.
//
// See dashboard/server/routes/RETIREMENT_ROLLUP.md for the full contract.
// ──────────────────────────────────────────────────────────────────────────
//
// The spreadsheet has two relevant tabs:
//   - "401k Ledger": columns Account, Date, Investment, Transaction Type,
//     Amount, Shares/Unit. Two distinct accounts:
//       89551 → main 401k (Account Name "401k")
//       35750 → Restoration 401k (Account Name "Restoration 401k")
//     They share the same fund menu. Transaction types observed:
//       Contributions, Exchange In, Exchange Out, Change In Market Value,
//       SHORT TERM TRADING FEE, RECORDKEEPING FEE
//     Date is an Excel serial number.
//   - "401k Ticker Map": columns Investment, Ticker, Proxy ('yes'/'no'),
//     Fallback (secondary ticker for Yahoo-spotty K-share funds), Notes.
//
// Aggregation per Investment+Account:
//   - currentShares = Σ(Shares/Unit) excluding Change In Market Value rows
//     (the user confirmed those are reconciliation marks, Shares/Unit is 0
//     anyway but skip defensively).
//   - totalContributions = Σ(Amount) for Contributions rows only.
//   - costBasis = Σ(Amount) for Contributions, Exchange In, and Exchange Out
//     rows only — i.e. net cash that flowed into this fund. Excludes Change
//     In Market Value (NAV marks aren't always present; Fidelity stops
//     recording them on actively-held funds, so trusting them produces a
//     mix of cost basis and market value depending on the fund. Excluded
//     for consistency.) Also excludes Fees.
//   - firstTransactionDate / lastTransactionDate bracket the holding period.
//   - isOpen = currentShares > 0.001
//
// IMPORTANT: This route does NOT compute current market value. It returns
// shares + ticker + costBasis. The frontend calls /api/quotes/live with the
// distinct tickers and computes currentValue = currentShares × price client-
// side. This matches usePortfolio.js's useCurrentQuotes pattern.
//
// Read-only: never writes the xlsx.

const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

const LEDGER_TAB = '401k Ledger';
const TICKER_MAP_TAB = '401k Ticker Map';

// Same logic as portfolio.js:formatDate. Inlined here to keep this route
// self-contained (could be promoted to a shared util later if a third route
// needs it).
function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  if (typeof val === 'number' && val > 10000 && val < 200000) {
    const d = new Date((val - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  return null;
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Same logic as portfolio.js:parseAccountsTab — reads the Accounts sheet and
// returns a Map<accountNumber → accountName>. Duplicated rather than imported
// to keep this route's dependencies explicit; if a third route needs it, lift
// to a shared util.
function parseAccountsTab(wb) {
  const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase().startsWith('account'));
  if (!sheetName) return new Map();
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const norm = (v) => String(v ?? '').trim().toLowerCase();

  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i] && rows[i].some(c => norm(c) === 'account')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return new Map();
  const headers = rows[headerIdx].map(norm);
  const acctIdx = headers.indexOf('account');
  const nameIdx = headers.indexOf('account name');
  if (acctIdx < 0 || nameIdx < 0) return new Map();
  const map = new Map();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const a = r[acctIdx];
    const n = r[nameIdx];
    if (a != null && n) map.set(String(a).trim(), String(n).trim());
  }
  return map;
}

// Build a Map<Investment → { ticker, proxy:boolean, fallback, notes }> from
// the 401k Ticker Map tab. Investment string is matched verbatim (after trim)
// against the Investment column in 401k Ledger.
function parseTickerMap(wb) {
  const ws = wb.Sheets[TICKER_MAP_TAB];
  if (!ws) return new Map();
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const header = rows[0] || [];
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const idx = {};
  header.forEach((h, i) => { if (h) idx[norm(h)] = i; });
  const get = (row, name) => {
    const i = idx[norm(name)];
    return i == null ? undefined : row[i];
  };

  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const inv = get(r, 'Investment');
    if (!inv) continue;
    const ticker = get(r, 'Ticker') || '';
    const proxyRaw = get(r, 'Proxy');
    const fallback = get(r, 'Fallback') || '';
    const notes = get(r, 'Notes') || '';
    map.set(String(inv).trim(), {
      ticker: String(ticker).trim(),
      proxy: String(proxyRaw ?? '').trim().toLowerCase() === 'yes',
      fallback: String(fallback).trim(),
      notes: String(notes).trim(),
    });
  }
  return map;
}

// Find the row index of the transaction header (row that contains
// `Investment` AND `Transaction Type`). Tolerates a holdings snapshot at the
// top of the tab (which has its own different header — Account Number, Symbol,
// Quantity, Current Value, etc.) plus a blank separator row in between.
// Returns -1 if not found.
function findTransactionHeader(rows) {
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const r = rows[i];
    if (!r) continue;
    const cells = r.map(norm);
    if (cells.includes('investment') && cells.includes('transaction type')) return i;
  }
  return -1;
}

// Parse the optional holdings snapshot at the top of the 401k Ledger tab.
// Mirrors the BrokerageLink top-table convention: per-fund Current Value /
// Cost Basis Total / Average Cost Basis from a Fidelity export. Used by the
// frontend in preference to the NAV-anchor calc when a fund is present here.
// Returns Map<`${accountNumber}::${investmentName}`, snapshot> or empty map.
function parseHoldingsSnapshot(wb, txnHeaderIdx) {
  const ws = wb.Sheets[LEDGER_TAB];
  if (!ws || txnHeaderIdx <= 0) return new Map();
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  // Snapshot header is row 0; data rows are 1 .. (txnHeaderIdx - 1) minus the
  // blank separator. Be tolerant of the header position changing.
  const header = rows[0] || [];
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const idx = {};
  header.forEach((h, i) => { if (h) idx[norm(h)] = i; });
  const get = (row, name) => {
    const i = idx[norm(name)];
    return i == null ? undefined : row[i];
  };
  // Confirm this looks like a holdings header (Current Value column present).
  if (idx['current value'] == null) return new Map();

  const map = new Map();
  for (let i = 1; i < txnHeaderIdx; i++) {
    const r = rows[i];
    if (!r || r.every(c => c == null)) continue;
    const acct = get(r, 'Account Number');
    if (acct == null) continue;
    // Use Description (the fund name) since it matches the Investment column
    // in the transaction ledger; Symbol is a CUSIP that doesn't.
    const investment = get(r, 'Description');
    if (!investment || String(investment).trim() === '') continue;
    const cv = parseFloat(get(r, 'Current Value'));
    if (!Number.isFinite(cv)) continue;
    map.set(`${String(acct).trim()}::${String(investment).trim()}`, {
      currentValue: cv,
      quantity: parseFloat(get(r, 'Quantity')) || null,
      lastPrice: parseFloat(get(r, 'Last Price')) || null,
      costBasisTotal: parseFloat(get(r, 'Cost Basis Total')) || null,
      averageCost: parseFloat(get(r, 'Average Cost Basis')) || null,
    });
  }
  return map;
}

// Parse the 401k Ledger tab into normalized transaction rows.
function parseLedger(wb) {
  const ws = wb.Sheets[LEDGER_TAB];
  if (!ws) return { transactions: [], snapshot: new Map() };
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const txnHeaderIdx = findTransactionHeader(rows);
  if (txnHeaderIdx < 0) return { transactions: [], snapshot: new Map() };
  const snapshot = parseHoldingsSnapshot(wb, txnHeaderIdx);
  const header = rows[txnHeaderIdx] || [];
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const idx = {};
  header.forEach((h, i) => { if (h) idx[norm(h)] = i; });
  const get = (row, name) => {
    const i = idx[norm(name)];
    return i == null ? undefined : row[i];
  };

  const out = [];
  for (let i = txnHeaderIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const account = get(row, 'Account');
    const investment = get(row, 'Investment');
    if (account == null && !investment) continue;
    const transactionType = get(row, 'Transaction Type') || '';
    out.push({
      account: account != null ? String(account) : '',
      date: formatDate(get(row, 'Date')),
      investment: investment ? String(investment).trim() : '',
      transactionType,
      amount: num(get(row, 'Amount')),
      shares: num(get(row, 'Shares/Unit')),
      // Dedup-invariant tagging: see top-of-file doc and RETIREMENT_ROLLUP.md.
      // CONTRIBUTION = outside money (count once, no dedup needed).
      // INTRA = Exchange In/Out within the 401k (sums to zero per account).
      // NAV_MARK = Change In Market Value (reconciliation; not a flow).
      // FEE = trading/recordkeeping fees.
      // The Retirement rollup must NOT sum INTRA rows alongside BrokerageLink
      // TRANSFER rows — those are the same dollars moving once.
      flowKind:
        transactionType === 'Contributions' ? 'CONTRIBUTION' :
        (transactionType === 'Exchange In' || transactionType === 'Exchange Out') ? 'INTRA' :
        transactionType === 'Change In Market Value' ? 'NAV_MARK' :
        (transactionType === 'SHORT TERM TRADING FEE' || transactionType === 'RECORDKEEPING FEE') ? 'FEE' :
        'OTHER',
    });
  }
  return { transactions: out, snapshot };
}

function parseSheet(spreadsheetPath) {
  const wb = XLSX.readFile(spreadsheetPath, { cellDates: false });
  const { transactions: ledger, snapshot } = parseLedger(wb);
  const tickerMap = parseTickerMap(wb);
  const accountNames = parseAccountsTab(wb);

  // Aggregate per Investment+Account.
  const groupKey = (inv, acct) => `${acct}::${inv}`;
  const groups = new Map();

  for (const t of ledger) {
    if (!t.investment || !t.account) continue;
    const key = groupKey(t.investment, t.account);
    if (!groups.has(key)) {
      groups.set(key, {
        investment: t.investment,
        accountNumber: t.account,
        currentShares: 0,
        totalContributions: 0,
        costBasis: 0,
        firstTransactionDate: null,
        lastTransactionDate: null,
        // lastKnownNAV: most recent transaction's per-share price. Each
        // Contribution / Exchange row in the ledger has Amount and Shares,
        // so amount/shares = NAV at that moment. The most recent such row
        // gives us a (possibly stale) NAV anchor. The frontend scales this
        // forward to today using the proxy ticker's adjClose growth.
        lastKnownNAV: null,
        lastNAVDate: null,
      });
    }
    const g = groups.get(key);
    // Skip Change In Market Value for share total — they're NAV marks, not
    // share movements (Shares/Unit is 0 anyway, defensive skip).
    if (t.transactionType !== 'Change In Market Value') {
      g.currentShares += t.shares;
    }
    if (t.transactionType === 'Contributions') {
      g.totalContributions += t.amount;
    }
    // costBasis = net cash that flowed into this fund (Contributions +
    // Exchange In − abs(Exchange Out)). Excludes Change In Market Value
    // (unreliable: missing for actively-held funds) and fees. For account
    // 35750 this matches Fidelity's reported cost basis exactly.
    if (t.transactionType === 'Contributions'
        || t.transactionType === 'Exchange In'
        || t.transactionType === 'Exchange Out') {
      g.costBasis += t.amount;
    }
    if (t.date) {
      if (!g.firstTransactionDate || t.date < g.firstTransactionDate) g.firstTransactionDate = t.date;
      if (!g.lastTransactionDate || t.date > g.lastTransactionDate) g.lastTransactionDate = t.date;
    }
    // Update NAV anchor: only from rows where amount/shares both nonzero.
    // Skip Change In Market Value (shares=0). Skip fees (tiny amount, noisy
    // NAV). A Contribution or Exchange row gives the cleanest NAV snapshot.
    if (t.date && Math.abs(t.shares) > 1e-9 && Math.abs(t.amount) > 1e-9
        && (t.transactionType === 'Contributions'
            || t.transactionType === 'Exchange In'
            || t.transactionType === 'Exchange Out')) {
      if (!g.lastNAVDate || t.date > g.lastNAVDate) {
        g.lastNAVDate = t.date;
        g.lastKnownNAV = t.amount / t.shares;
      }
    }
  }

  const tickerMapWarnings = [];
  const seenWarnings = new Set();

  const holdings = [];
  for (const g of groups.values()) {
    const isOpen = g.currentShares > 0.001;
    const mapEntry = tickerMap.get(g.investment) || null;
    if (!mapEntry && !seenWarnings.has(g.investment)) {
      tickerMapWarnings.push(`Investment '${g.investment}' has no ticker map entry`);
      seenWarnings.add(g.investment);
    }
    const ticker = mapEntry ? mapEntry.ticker : '';
    const fallback = mapEntry ? mapEntry.fallback : '';
    const proxy = mapEntry ? mapEntry.proxy : false;
    const notes = mapEntry ? mapEntry.notes : '';

    // Snapshot lookup: per-(account, investment) Fidelity-export current
    // value. When present, the frontend prefers this over the NAV-anchor
    // estimate. Lookup is by Description (fund name) since that's what the
    // ledger's Investment column carries.
    const snap = snapshot.get(`${g.accountNumber}::${g.investment}`) || null;

    holdings.push({
      investment: g.investment,
      accountNumber: g.accountNumber,
      accountName: accountNames.get(g.accountNumber) || g.accountNumber,
      ticker,
      proxy,
      fallback,
      currentShares: Number(g.currentShares.toFixed(6)),
      totalContributions: Number(g.totalContributions.toFixed(2)),
      costBasis: Number(g.costBasis.toFixed(2)),
      firstTransactionDate: g.firstTransactionDate,
      lastTransactionDate: g.lastTransactionDate,
      lastKnownNAV: g.lastKnownNAV != null ? Number(g.lastKnownNAV.toFixed(6)) : null,
      lastNAVDate: g.lastNAVDate,
      // Fidelity-export snapshot (if present in the 401k Ledger top table).
      // Authoritative current value — frontend uses this when available and
      // falls back to NAV-anchor × proxy growth otherwise.
      snapshot: snap,
      isOpen,
      // chartable: open AND a real (non-empty) ticker resolution exists.
      // Closed positions explicitly skip the chart promise so the frontend
      // doesn't waste a quote fetch on them.
      chartable: isOpen && !!(ticker || fallback),
      // priceable: same as chartable but used for currentValue calc on the
      // frontend (currentValue = currentShares × livePrice(ticker || fallback)).
      priceable: isOpen && !!(ticker || fallback),
      notes,
    });
  }

  // Sort by accountNumber, then costBasis desc (heaviest cost first; the
  // frontend will re-sort by currentValue once quotes are fetched).
  holdings.sort((a, b) => {
    if (a.accountNumber !== b.accountNumber) {
      return String(a.accountNumber).localeCompare(String(b.accountNumber));
    }
    return (b.costBasis || 0) - (a.costBasis || 0);
  });

  // Per-account cost-basis totals. NOTE: this is NOT current account value —
  // current value requires live quotes (frontend computes shares × price).
  // We expose totalCostBasis here only so the frontend has something to fall
  // back on when quotes are loading or unavailable.
  const accountTotals = new Map();
  for (const h of holdings) {
    if (!accountTotals.has(h.accountNumber)) {
      accountTotals.set(h.accountNumber, {
        accountNumber: h.accountNumber,
        accountName: h.accountName,
        totalCostBasis: 0,
      });
    }
    accountTotals.get(h.accountNumber).totalCostBasis += h.costBasis;
  }
  const accounts = [...accountTotals.values()].map(a => ({
    ...a,
    totalCostBasis: Number(a.totalCostBasis.toFixed(2)),
  }));

  // Latest ledger date is the natural "as of" date.
  let asOfDate = null;
  for (const t of ledger) {
    if (t.date && (!asOfDate || t.date > asOfDate)) asOfDate = t.date;
  }
  if (!asOfDate) asOfDate = new Date().toISOString().slice(0, 10);

  return {
    asOfDate,
    accounts,
    holdings,
    transactions: ledger,
    tickerMapWarnings,
  };
}

router.get('/', async (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = parseSheet(sheet.path);
    res.json({ ...data, isTemplate: !!sheet.isTemplate });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
// Internal helper for the retirement-inputs aggregator so balance math
// stays in one place (snapshot-or-NAV-anchor preference).
module.exports.parseSheet = parseSheet;
