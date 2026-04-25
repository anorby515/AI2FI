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

function parseSheet(spreadsheetPath) {
  const wb = XLSX.readFile(spreadsheetPath, { cellDates: false });
  const ws = wb.Sheets['Brokerage Ledger'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Row index 1 (0-based) = header row 2
  const headers = rows[1];
  const colIdx = {};
  headers.forEach((h, i) => { if (h) colIdx[h] = i; });

  const holdings = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const rawSymbol = row[colIdx['Symbol']];
    if (!rawSymbol) continue;
    const symbol = TICKER_MAP[rawSymbol] || rawSymbol;

    const costBasis = parseFloat(row[colIdx['Cost Basis Per Share']]);
    const sharesBought = parseFloat(row[colIdx['Shares Bought']]);
    if (isNaN(costBasis) || isNaN(sharesBought)) continue;

    const dateAcq = formatDate(row[colIdx['Date Acquired']]);
    holdings.push({
      account: row[colIdx['Account Type']] || '',
      owner: row[colIdx['Owner']] || '',
      transaction: row[colIdx['Transaction']] || '',
      symbol,
      description: row[colIdx['Security Description']] || '',
      dateAcquired: dateAcq,
      taxLot: `${symbol} ${dateAcq}`,
      sharesBought,
      costBasis,
      dateSold: formatDate(row[colIdx['Date Sold']]) || null,
      charitableDonation: row[colIdx['Charitable Donation']] || null,
      sharesSold: parseFloat(row[colIdx['Shares Sold']]) || null,
      sellBasis: parseFloat(row[colIdx['Sell Basis Per Share']]) || null,
      proceeds: parseFloat(row[colIdx['Proceeds']]) || null,
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
