require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const tracker = require('./apiTracker');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/splits', require('./routes/splits'));
app.use('/api/dividends', require('./routes/dividends'));
app.use('/api/benchmark', require('./routes/benchmark'));
app.use('/api/moat', require('./routes/moat'));
app.use('/api/networth', require('./routes/networth'));
app.use('/api/mortgage', require('./routes/mortgage'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/import/csv', require('./routes/csvImport'));
app.use('/api/profile', require('./routes/profile'));

const { resolveSpreadsheet, noProfileResponse } = require('./profile-resolver');

// GET /api/status
app.get('/api/status', (_, res) => {
  const status = tracker.getStatus();
  res.json({
    attempted: status.attempted,
    successful: status.successful,
    lastSync: status.lastSync,
  });
});

// GET /api/status/check-yahoo — explicit health check
app.get('/api/status/check-yahoo', async (_, res) => {
  const { healthCheck } = require('./yahooClient');
  const available = await healthCheck();
  res.json({ yahooAvailable: available });
});

// POST /api/sync — preflight check, then sequential pipeline
app.post('/api/sync', async (_, res) => {
  const { fetchSplits, fetchQuote, fetchHistoricalPrices, healthCheck } = require('./yahooClient');
  const cache = require('./cache');

  const log = [];
  let errors = 0;

  // Step 0: Preflight — must have a real user spreadsheet before we hit Yahoo.
  // Sync is intentionally refused while reading the demo template so the
  // server's caches (splits, quotes, benchmarks) don't fill up with template
  // tickers and overwrite the user's data when they later pivot.
  const sheet = resolveSpreadsheet();
  if (!sheet) {
    return res.status(404).json({ log: ['No spreadsheet available — sync aborted'], errors: 1, aborted: true, ...noProfileResponse() });
  }
  if (sheet.isTemplate) {
    return res.status(400).json({
      log: ['Sync is disabled while the dashboard is reading the demo template. Copy the template into your profile first (the Coach handles this during onboarding), then re-run sync.'],
      errors: 1,
      aborted: true,
      isTemplate: true,
    });
  }

  const available = await healthCheck();
  if (!available) {
    return res.json({ log: ['Yahoo Finance is unavailable. Sync aborted.'], errors: 1, aborted: true, ...tracker.getStatus() });
  }
  log.push('Yahoo Finance health check passed');

  // Step 1: Read spreadsheet to get all tickers
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(sheet.path, { cellDates: false });
  const ws = wb.Sheets['Brokerage Ledger'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const headers = rows[1];
  const colIdx = {};
  headers.forEach((h, i) => { if (h) colIdx[h] = i; });

  const TICKER_MAP = { 'BRKB': 'BRK-B', 'BTC': 'BTC-USD', 'ETH': 'ETH-USD' };
  const DELISTED = new Set(['WFM', 'LGF', 'ATVI', 'LNKD', 'SWIR', 'ZAYO', 'NCR', 'TLND', 'ZNGA', 'ZI']);
  const allSymbols = new Set();
  const openSymbols = new Set();
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rawSym = row[colIdx['Symbol']];
    if (!rawSym) continue;
    const sym = TICKER_MAP[rawSym] || rawSym;
    allSymbols.add(sym);
    const txn = row[colIdx['Transaction']];
    if (txn === 'Open') openSymbols.add(sym);
  }
  log.push(`Found ${allSymbols.size} tickers (${openSymbols.size} open)`);

  // Step 2: Fetch splits for all tickers
  let splitOk = 0;
  let skipped = 0;
  const failedSplits = [];
  for (const sym of allSymbols) {
    if (DELISTED.has(sym)) { skipped++; cache.set('splits', sym, []); continue; }
    try {
      const data = await fetchSplits(sym);
      cache.set('splits', sym, data);
      splitOk++;
    } catch (e) { errors++; failedSplits.push(`${sym}: ${e.message?.slice(0, 60)}`); }
    await new Promise(r => setTimeout(r, 200));
  }
  log.push(`Splits: ${splitOk}/${allSymbols.size - skipped} fetched (${skipped} delisted skipped)`);
  if (failedSplits.length) log.push(`Failed splits: ${failedSplits.join(', ')}`);

  // Step 3: Fetch SPY benchmark
  try {
    const data = await fetchHistoricalPrices('SPY', '1993-01-01');
    const lean = data.map(d => ({ date: d.date, close: d.close }));
    cache.set('benchmark', 'SPY', lean);
    log.push('SPY benchmark: fetched');
  } catch { errors++; log.push('SPY benchmark: FAILED'); }

  // Step 4: Fetch current quotes for open positions
  let quoteOk = 0;
  const failedQuotes = [];
  for (const sym of openSymbols) {
    try {
      const q = await fetchQuote(sym);
      if (q) { cache.set('current', sym, q); quoteOk++; }
      else { errors++; failedQuotes.push(`${sym}: null response`); }
    } catch (e) { errors++; failedQuotes.push(`${sym}: ${e.message?.slice(0, 60)}`); }
    await new Promise(r => setTimeout(r, 200));
  }
  log.push(`Quotes: ${quoteOk}/${openSymbols.size} fetched`);
  if (failedQuotes.length) log.push(`Failed quotes: ${failedQuotes.join(', ')}`);

  const status = tracker.getStatus();
  res.json({
    log,
    errors,
    aborted: false,
    attempted: status.attempted,
    successful: status.successful,
    lastSync: status.lastSync,
  });
});

app.get('/health', (_, res) => res.json({ ok: true }));

// Serve the built client (production mode).
// The dev workflow (`npm run dev`) runs Vite separately on 5173 and proxies /api here,
// so this block is only exercised when users visit localhost:3001 directly after a build.
const CLIENT_DIST = path.join(__dirname, '../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback: any non-API route serves index.html so React Router (if/when added) works.
  app.get(/^\/(?!api\/|health).*/, (_, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
