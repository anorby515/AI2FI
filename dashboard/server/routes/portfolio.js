const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const cache = require('../cache');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

const IMPORT_FILE = path.join(__dirname, '../data/imported-lots.json');

function loadImportedLots() {
  if (!fs.existsSync(IMPORT_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(IMPORT_FILE, 'utf8')); } catch { return []; }
}

const SPLIT_TTL = 7 * 24 * 60 * 60 * 1000;

// Map spreadsheet tickers to Yahoo Finance tickers
const TICKER_MAP = { 'BRKB': 'BRK-B', 'BTC': 'BTC-USD', 'ETH': 'ETH-USD' };

function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  if (typeof val === 'number' && val > 10000 && val < 200000) {
    const d = new Date((val - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  // xlsx package with cellDates returns Date objects as strings like "M/D/YYYY"
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  return null;
}

// Build a map of "Account Type" -> "Account Type Group" from the Lookup Tables sheet.
// Returns an empty Map if the sheet or expected columns are missing — callers fall
// back to leaving the group blank, so unknown account types still flow through.
function parseLookupTables(wb) {
  const ws = wb.Sheets['Lookup Tables'];
  if (!ws) return new Map();
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i] && rows[i].some(c => c === 'Account Type')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return new Map();
  const headers = rows[headerIdx];
  const typeIdx = headers.indexOf('Account Type');
  const groupIdx = headers.indexOf('Account Type Group');
  if (typeIdx < 0 || groupIdx < 0) return new Map();
  const map = new Map();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const t = r[typeIdx];
    const g = r[groupIdx];
    if (t && g) map.set(String(t).trim(), String(g).trim());
  }
  return map;
}

// Build a map of "Account" (account number) -> "Account Name" (friendly label)
// from the Accounts sheet. Returns an empty Map if the sheet or expected
// columns are missing — callers fall back to the raw account number.
function parseAccountsTab(wb) {
  // Tolerant sheet name match — the user's tab might be 'Accounts', 'Account', etc.
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
    if (a && n) map.set(String(a).trim(), String(n).trim());
  }
  return map;
}

function parseSheet(spreadsheetPath) {
  const wb = XLSX.readFile(spreadsheetPath, { cellDates: false });
  const groupByType = parseLookupTables(wb);
  const nameByAccount = parseAccountsTab(wb);
  const ws = wb.Sheets['Brokerage Ledger'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Row index 1 (0-based) = header row 2; tolerate trim/case differences.
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const headers = rows[1] || [];
  const colIdx = {};
  headers.forEach((h, i) => { if (h) colIdx[norm(h)] = i; });
  const col = (name) => colIdx[norm(name)];

  const get = (row, name) => {
    const idx = col(name);
    return idx == null ? undefined : row[idx];
  };

  const holdings = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const rawSymbol = get(row, 'Symbol');
    if (!rawSymbol) continue;
    const symbol = TICKER_MAP[rawSymbol] || rawSymbol;

    const costBasis = parseFloat(get(row, 'Cost Basis Per Share'));
    const sharesBought = parseFloat(get(row, 'Shares Bought'));
    if (isNaN(costBasis) || isNaN(sharesBought)) continue;

    const dateAcq = formatDate(get(row, 'Date Acquired'));
    const accountType = get(row, 'Account Type') || '';
    const accountNumber = get(row, 'Account') || '';
    const accountName = nameByAccount.get(String(accountNumber).trim()) || String(accountNumber || '');
    holdings.push({
      account: accountType,
      accountTypeGroup: groupByType.get(String(accountType).trim()) || '',
      accountName,
      owner: get(row, 'Owner') || '',
      transaction: get(row, 'Transaction') || '',
      symbol,
      description: get(row, 'Security Description') || '',
      dateAcquired: dateAcq,
      taxLot: `${symbol} ${dateAcq}`,
      sharesBought,
      costBasis,
      dateSold: formatDate(get(row, 'Date Sold')) || null,
      charitableDonation: get(row, 'Charitable Donation') || null,
      sharesSold: parseFloat(get(row, 'Shares Sold')) || null,
      sellBasis: parseFloat(get(row, 'Sell Basis Per Share')) || null,
      proceeds: parseFloat(get(row, 'Proceeds')) || null,
    });
  }

  return holdings;
}

// --- Split normalization ---

// Cache-only: never fetch from FMP on page load. Returns cached data or null.
function getCachedSplits(symbol) {
  return cache.get('splits', symbol, SPLIT_TTL);
}

function splitsInRange(splits, after, beforeOrEqual) {
  return splits.filter(s => s.date > after && s.date <= beforeOrEqual);
}

function cumulativeFactor(splits) {
  return splits.reduce((acc, s) => acc * (s.numerator / s.denominator), 1);
}

function normalizeHoldings(holdings) {
  const today = new Date().toISOString().slice(0, 10);
  const symbols = [...new Set(holdings.map(h => h.symbol))];

  // Cache-only: read splits from disk, never fetch from FMP
  const splitMap = {};
  for (const sym of symbols) {
    splitMap[sym] = getCachedSplits(sym);
  }

  return holdings.map(h => {
    const splits = splitMap[h.symbol];

    // Spreadsheet now has ORIGINAL (non-split-adjusted) values.
    const originalShares = h.sharesBought;
    const endDate = h.transaction === 'Open' ? today : (h.dateSold || today);

    // Holding-period splits: purchase → sale (closed) or purchase → today (open)
    // Used for the "Splits" column — shows what actually happened while holding
    let totalSplitFactor = 1;
    let splitDescription = '';
    if (splits && h.dateAcquired) {
      const holdingSplits = splitsInRange(splits, h.dateAcquired, endDate);
      totalSplitFactor = cumulativeFactor(holdingSplits);
      splitDescription = holdingSplits.length > 0
        ? holdingSplits.map(s => `${s.numerator}:${s.denominator}`).join(', ')
        : '';
    }

    // Full split factor: purchase → today (for display normalization / chart alignment)
    let displayFactor = totalSplitFactor;
    if (splits && h.dateAcquired && h.transaction !== 'Open' && h.dateSold) {
      const allSplits = splitsInRange(splits, h.dateAcquired, today);
      displayFactor = cumulativeFactor(allSplits);
    }

    // Display values: apply full factor to today for chart/price alignment
    const displayShares = h.sharesBought * displayFactor;
    const displayCostBasis = h.costBasis / displayFactor;

    // Adjusted cost basis: original cost adjusted only for holding-period splits
    // This is the cost/share at the time of sale (or today for open lots)
    const adjCostBasis = h.costBasis / totalSplitFactor;

    return {
      ...h,
      originalShares,
      displayShares,
      displayCostBasis,
      adjCostBasis,
      splitFactor: displayFactor,
      totalSplitFactor,
      splitDescription,
    };
  });
}

// GET /api/portfolio
router.get('/', async (req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) {
    return res.status(404).json(noProfileResponse());
  }
  try {
    const raw = parseSheet(sheet.path);
    // Imported lots are user-specific (CSV uploads). When the dashboard is
    // showing the demo template, surface only the template's own data so
    // the user's imports don't visibly mix with demo numbers.
    const imported = sheet.isTemplate ? [] : loadImportedLots();
    const combined = [...raw, ...imported];
    const data = normalizeHoldings(combined);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
