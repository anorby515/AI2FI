#!/usr/bin/env node
/**
 * Split Detector
 *
 * For each purchase lot in Stock Holdings.xlsx, fetches split history from Yahoo Finance
 * and computes the cumulative split factor that occurred AFTER the purchase date.
 * Also fetches the raw EOD price on purchase date as a sanity check.
 *
 * Output: split-report.csv
 * Usage:  node scripts/split-detector.js
 */

const ExcelJS = require('exceljs');
const YahooFinance = require('yahoo-finance2').default;
const fs = require('fs');
const path = require('path');

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const SPREADSHEET = path.join(__dirname, '../../user-profiles/andrew/private/Finances.xlsx');
const OUTPUT = path.join(__dirname, '../../user-profiles/andrew/private/split-report.csv');
const CACHE_DIR = path.join(__dirname, 'cache');

// --- File-based cache (survives between runs) ---

function cacheRead(namespace, key) {
  const file = path.join(CACHE_DIR, namespace, key.replace(/[^a-z0-9]/gi, '_') + '.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function cacheWrite(namespace, key, data) {
  const dir = path.join(CACHE_DIR, namespace);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, key.replace(/[^a-z0-9]/gi, '_') + '.json');
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

// --- Parse spreadsheet ---

async function parseHoldings() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SPREADSHEET);
  const ws = wb.getWorksheet('Brokerage Ledger');

  const headerRow = ws.getRow(2);
  const colIdx = {};
  headerRow.eachCell((cell, col) => { if (cell.value) colIdx[cell.value] = col; });

  const holdings = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum <= 2) return;
    const symbol = row.getCell(colIdx['Symbol'])?.value;
    if (!symbol) return;

    const sharesBought = parseFloat(row.getCell(colIdx['Shares Bought'])?.value);
    const costBasis = parseFloat(row.getCell(colIdx['Cost Basis Per Share'])?.value);
    if (isNaN(sharesBought) || isNaN(costBasis) || costBasis <= 0) return;

    function toDate(raw) {
      if (!raw) return null;
      if (raw instanceof Date) return raw.toISOString().slice(0, 10);
      const d = new Date(raw);
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    }

    const dateAcquired = toDate(row.getCell(colIdx['Date Acquired'])?.value);
    if (!dateAcquired) return;

    const dateSold = toDate(row.getCell(colIdx['Date Sold'])?.value);
    const transaction = row.getCell(colIdx['Transaction'])?.value || '';

    // For closed positions, splits after the sale date are irrelevant
    const splitCutoff = (transaction === 'Closed' && dateSold) ? dateSold : new Date().toISOString().slice(0, 10);

    holdings.push({
      account: row.getCell(colIdx['Account Type'])?.value || '',
      symbol,
      description: row.getCell(colIdx['Security Description'])?.value || '',
      transaction,
      dateAcquired,
      dateSold,
      splitCutoff,
      sharesBought,
      costBasis,
    });
  });
  return holdings;
}

// --- Yahoo Finance helpers ---

function formatDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return typeof d === 'string' ? d.slice(0, 10) : null;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchSplitHistory(symbol) {
  const cached = cacheRead('splits', symbol);
  if (cached) return cached;

  const result = await yf.chart(symbol, { period1: '1980-01-01', events: 'splits' });
  const splits = (result.events?.splits || []).map(s => ({
    date: formatDate(s.date),
    numerator: s.numerator,
    denominator: s.denominator,
  }));

  cacheWrite('splits', symbol, splits);
  return splits;
}

async function fetchEodPrice(symbol, purchaseDate) {
  const cacheKey = `${symbol}_${purchaseDate}`;
  const cached = cacheRead('prices', cacheKey);
  if (cached !== null) return cached;

  const from = purchaseDate;
  const to = addDays(purchaseDate, 10);
  const result = await yf.chart(symbol, { period1: from, period2: to });
  const quotes = (result.quotes || []).map(q => ({
    date: formatDate(q.date),
    close: q.close,
  }));

  const entry = quotes.sort((a, b) => a.date.localeCompare(b.date)).find(e => e.date >= purchaseDate);
  const price = entry ? parseFloat(entry.close) : null;
  cacheWrite('prices', cacheKey, price);
  return price;
}

// --- Split maths ---

// Returns splits that occurred after purchase and on/before cutoff (sale date or today)
function splitsInWindow(history, purchaseDate, cutoff) {
  return history.filter(s => s.date > purchaseDate && s.date <= cutoff);
}

function cumulativeFactor(splits) {
  return splits.reduce((acc, s) => acc * (s.numerator / s.denominator), 1);
}

// --- CSV helper ---

function csv(fields) {
  return fields.map(f => {
    const s = String(f ?? '').replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(',');
}

// --- Main ---

async function main() {
  console.log('Reading spreadsheet...');
  const holdings = await parseHoldings();
  console.log(`Loaded ${holdings.length} purchase lots`);

  // Dedupe by symbol for split history fetch (one call per ticker)
  const symbols = [...new Set(holdings.map(h => h.symbol))];
  console.log(`Fetching split history for ${symbols.length} unique tickers...`);

  const splitCache = {};
  let s = 0;
  let apiErrors = 0;
  for (const sym of symbols) {
    s++;
    const fromDisk = cacheRead('splits', sym) !== null;
    process.stdout.write(`\r  [${s}/${symbols.length}] ${sym.padEnd(10)} ${fromDisk ? '(cached)' : '(fetching)'}`);
    try {
      splitCache[sym] = await fetchSplitHistory(sym);
      if (!fromDisk) await new Promise(r => setTimeout(r, 260)); // rate limit only on live fetches
    } catch (e) {
      apiErrors++;
      splitCache[sym] = [];
      process.stdout.write(`\n  WARN: ${e.message}`);
    }
  }
  process.stdout.write('\n');
  if (apiErrors > 0) {
    console.warn(`\nWARN: ${apiErrors} ticker(s) failed to fetch — likely hit 250 req/day limit.`);
    console.warn('Re-run tomorrow, or check scripts/cache/splits/ for missing files.\n');
  }

  console.log('Fetching EOD prices for flagged lots...');

  // Only fetch prices for lots that have splits after their purchase date
  const rows = [csv([
    'Account', 'Symbol', 'Description', 'Transaction',
    'Date Acquired', 'Spreadsheet Shares', 'Spreadsheet Cost/Share',
    'Splits After Purchase', 'Cumulative Factor',
    'Original Shares (÷ factor)', 'Original Cost/Share (× factor)',
    'EOD Price on Purchase Date', 'Price Matches Original?', 'Notes',
  ])];

  let flagCount = 0;
  let pricesFetched = 0;
  const priceCache = {};

  for (const h of holdings) {
    const history = splitCache[h.symbol] || [];
    const postSplits = splitsInWindow(history, h.dateAcquired, h.splitCutoff);
    const factor = cumulativeFactor(postSplits);
    const hasSplit = factor !== 1;

    const splitsStr = postSplits
      .map(s => `${s.date} ${s.numerator}:${s.denominator}`)
      .join(' | ');

    let eodPrice = null;
    let priceMatch = '';
    let notes = '';

    if (hasSplit) {
      flagCount++;
      const priceCacheKey = `${h.symbol}_${h.dateAcquired}`;
      const diskCached = cacheRead('prices', priceCacheKey);
      if (diskCached !== null) {
        eodPrice = diskCached;
      } else {
        pricesFetched++;
        process.stdout.write(`\r  Fetching price ${pricesFetched}: ${h.symbol} ${h.dateAcquired}    `);
        try {
          eodPrice = await fetchEodPrice(h.symbol, h.dateAcquired);
          await new Promise(r => setTimeout(r, 260));
        } catch (e) {
          notes = `Price fetch error: ${e.message}`;
          eodPrice = null;
        }
      }

      if (eodPrice != null) {
        const originalCost = h.costBasis * factor;
        const pct = Math.abs(eodPrice - originalCost) / originalCost;
        if (pct < 0.05) priceMatch = 'YES';
        else if (pct < 0.15) priceMatch = 'CLOSE';
        else { priceMatch = 'NO'; notes = `Expected ~$${originalCost.toFixed(2)}, got $${eodPrice.toFixed(2)}`; }
      } else if (!notes) {
        priceMatch = '?';
        notes = 'No price data returned (possible delisted or ETF)';
      }
    }

    rows.push(csv([
      h.account,
      h.symbol,
      h.description,
      h.transaction,
      h.dateAcquired,
      h.sharesBought.toFixed(4),
      h.costBasis.toFixed(4),
      splitsStr || 'None',
      hasSplit ? factor.toFixed(4) : '1',
      hasSplit ? (h.sharesBought / factor).toFixed(4) : h.sharesBought.toFixed(4),
      hasSplit ? (h.costBasis * factor).toFixed(4) : h.costBasis.toFixed(4),
      eodPrice != null ? eodPrice.toFixed(4) : '',
      priceMatch,
      notes,
    ]));
  }

  process.stdout.write('\n');
  fs.writeFileSync(OUTPUT, rows.join('\n'), 'utf8');

  console.log(`\nDone → ${OUTPUT}`);
  console.log(`  ${holdings.length} lots processed`);
  console.log(`  ${flagCount} lots have splits after purchase`);

  // Print summary of split-affected tickers
  const affected = {};
  for (const h of holdings) {
    const postSplits = splitsInWindow(splitCache[h.symbol] || [], h.dateAcquired, h.splitCutoff);
    if (postSplits.length) affected[h.symbol] = cumulativeFactor(postSplits);
  }
  console.log('\nAffected tickers and cumulative factors:');
  Object.entries(affected)
    .sort((a, b) => b[1] - a[1])
    .forEach(([sym, f]) => console.log(`  ${sym.padEnd(8)} × ${f}`));
}

main().catch(err => { console.error(err); process.exit(1); });
