#!/usr/bin/env node
// Phase 2 spreadsheet edits via SheetJS (never openpyxl — would break ExcelJS reads).
//   1. Normalize HTML-entity apostrophes in the 401k Ledger Investment column
//      (e.g. "INT&#039;L STOCK INDEX" -> "INT'L STOCK INDEX"). User chose option b
//      so the parser sees one canonical name.
//   2. Add row "401k" -> "Retirement" to Lookup Tables so Account Type "401k"
//      routes to the Retirement portfolio group.
//   3. Create new tab "401k Ticker Map" seeded with all 37 fund names mapping to
//      Yahoo tickers (or proxies for CITs / generic plan labels).

const path = require('path');
const XLSX = require('xlsx');

const xlsxPath = process.argv[2] ||
  path.resolve(__dirname, '../../user-profiles/andrew/private/Finances.xlsx');

const wb = XLSX.readFile(xlsxPath, { cellStyles: true, cellDates: false, bookVBA: true });

// --- 1. Normalize HTML-entity apostrophes in 401k Ledger ---
const ledgerWs = wb.Sheets['401k Ledger'];
if (!ledgerWs) throw new Error('401k Ledger sheet not found');
const ledgerRange = XLSX.utils.decode_range(ledgerWs['!ref']);
const decodeEntities = (s) =>
  String(s)
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"');

let normalizedCells = 0;
for (let r = ledgerRange.s.r + 1; r <= ledgerRange.e.r; r++) {
  for (let c = ledgerRange.s.c; c <= ledgerRange.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ledgerWs[addr];
    if (cell && typeof cell.v === 'string' && /&#0?39;|&apos;|&amp;|&quot;/i.test(cell.v)) {
      cell.v = decodeEntities(cell.v);
      cell.w = cell.v;
      normalizedCells++;
    }
  }
}
console.log(`401k Ledger: normalized ${normalizedCells} cells with HTML entities`);

// --- 2. Append "401k" -> "Retirement" to Lookup Tables ---
// IMPORTANT: existing data lives at columns B/C (column A is empty) — the
// header row is at B2/C2. New rows must be inserted at B/C to match the
// portfolio.js parser, which uses headers.indexOf('Account Type').
const lookupWs = wb.Sheets['Lookup Tables'];
if (!lookupWs) throw new Error('Lookup Tables sheet not found');
const lookupRange = XLSX.utils.decode_range(lookupWs['!ref']);
const existingRows = XLSX.utils.sheet_to_json(lookupWs, { header: 1, raw: true, defval: null });
const has401k = existingRows.some(r => r && r.includes('401k'));
if (has401k) {
  console.log("Lookup Tables: '401k' row already present, skipping");
} else {
  const insertRowIdx = lookupRange.e.r + 1;
  lookupWs[XLSX.utils.encode_cell({ r: insertRowIdx, c: 1 })] = { v: '401k', t: 's' };
  lookupWs[XLSX.utils.encode_cell({ r: insertRowIdx, c: 2 })] = { v: 'Retirement', t: 's' };
  const newRange = { s: lookupRange.s, e: { r: insertRowIdx, c: Math.max(lookupRange.e.c, 2) } };
  lookupWs['!ref'] = XLSX.utils.encode_range(newRange);
  console.log(`Lookup Tables: added '401k' -> 'Retirement' at row ${insertRowIdx + 1} (col B/C)`);
}

// --- 3. Create / replace 401k Ticker Map tab ---
// Investment names taken verbatim from the 401k Ledger after the apostrophe
// normalization above. Proxy=yes means the ticker is a stand-in (CIT, generic
// plan label, etc.); the chart should render with a "proxy" footnote.
const TICKER_MAP_ROWS = [
  ['Investment', 'Ticker', 'Proxy', 'Fallback', 'Notes'],
  ['FID MAGELLAN',         'FMAGX', 'no',  '', 'Real ticker'],
  ['FID GROWTH COMPANY',   'FDGRX', 'no',  '', 'Real ticker'],
  ['FID OVERSEAS',         'FOSFX', 'no',  '', 'Real ticker'],
  ['FID DIVERSIFD INTL',   'FDIVX', 'no',  '', 'Real ticker'],
  ['FID EQUITY INC',       'FEQIX', 'no',  '', 'Real ticker'],
  ['FID PURITAN',          'FPURX', 'no',  '', 'Real ticker'],
  ['FID OTC PORTFOLIO',    'FOCPX', 'no',  '', 'Real ticker'],
  ['FID ASSET MGR 70%',    'FASGX', 'no',  '', 'Real ticker'],
  ['FID STK SEL SM CAP',   'FDSCX', 'no',  '', 'Stock Selector Small Cap'],
  ['FID 500 INDEX INV',    'FXAIX', 'no',  '', 'Investor share class merged into FXAIX'],
  ['FID 500 INDEX PR',     'FXAIX', 'no',  '', 'Premium share class -> FXAIX'],
  ['FID FREEDOM 2040',     'FFFFX', 'no',  '', 'Real ticker'],
  ['FID FREEDOM 2045',     'FFFGX', 'no',  '', 'Real ticker'],
  ['FID FREEDOM K 2040',   'FFKEX', 'no',  'FFFFX', 'Yahoo K-share coverage spotty; fallback to non-K'],
  ['FID FREEDOM K 2045',   'FFKGX', 'no',  'FFFGX', 'Yahoo K-share coverage spotty; fallback to non-K'],
  ['FID GR CO POOL CL O',  'FDGRX', 'yes', '', 'CIT proxy: Fidelity Growth Company'],
  ['FID GR CO POOL CL S',  'FDGRX', 'yes', '', 'CIT proxy: Fidelity Growth Company'],
  ['BTC LIFEPATH 2035 G',  'VTTHX', 'yes', '', 'CIT proxy: Vanguard Target Retirement 2035'],
  ['BTC LIFEPATH 2040 L',  'VFORX', 'yes', '', 'CIT proxy: Vanguard Target Retirement 2040'],
  ['BTC LIFEPATH 2040 Q',  'VFORX', 'yes', '', 'CIT proxy: Vanguard Target Retirement 2040'],
  ['BTC LIFEPATH 2045 L',  'VTIVX', 'yes', '', 'CIT proxy: Vanguard Target Retirement 2045'],
  ['BTC LIFEPATH 2045 Q',  'VTIVX', 'yes', '', 'CIT proxy: Vanguard Target Retirement 2045'],
  ['BTC LP IDX 2040 N',    'VFORX', 'yes', '', 'LifePath Index variant -> VG TR 2040'],
  ['BTC LP IDX 2045 N',    'VTIVX', 'yes', '', 'LifePath Index variant -> VG TR 2045'],
  ['BTC EMERGING MKTS M',  'VEMAX', 'yes', '', 'CIT proxy: Vanguard Emerging Markets'],
  ['AS EM MKTS EQ CIT E2', 'VEMAX', 'yes', '', 'AB Emerging Markets CIT -> VG proxy'],
  ['BTC SHRT-TERM INVT W', 'VMFXX', 'yes', '', 'Stable-value/MMF; chart only when held'],
  ['INST MONEY MARKET FD', 'VMFXX', 'yes', '', 'Generic plan money market; chart only when held'],
  ['INTM BOND CMGL POOL',  'VBTLX', 'yes', '', 'Intermediate bond commingled pool proxy'],
  ['US EQUITY',            'VTSAX', 'yes', '', 'Generic label proxy: VG Total Stock Market'],
  ['S&P 500 STOCK INDEX',  'VFIAX', 'yes', '', 'Generic label proxy: VG 500 Index'],
  ["INT'L STOCK INDEX",    'VTIAX', 'yes', '', 'Generic label proxy: VG Total International'],
  ['SMALL/MID STOCK INDX', 'VEXAX', 'yes', '', 'Generic label proxy: VG Extended Market'],
  ['REAL ESTATE INDEX',    'VGSLX', 'yes', '', 'Generic label proxy: VG Real Estate Index'],
  ['US TIPS BOND INDEX',   'VAIPX', 'yes', '', 'Generic label proxy: VG Inflation-Protected'],
  ['DEERE & CO STK FUND',  'DE',    'yes', '', 'Unitized employer stock; NAV diverges from DE due to cash buffer'],
];

const TAB_NAME = '401k Ticker Map';
if (wb.SheetNames.includes(TAB_NAME)) {
  delete wb.Sheets[TAB_NAME];
  wb.SheetNames = wb.SheetNames.filter(n => n !== TAB_NAME);
  console.log(`'${TAB_NAME}' tab existed; replacing`);
}
const tickerWs = XLSX.utils.aoa_to_sheet(TICKER_MAP_ROWS);
tickerWs['!cols'] = [
  { wch: 28 }, // Investment
  { wch: 10 }, // Ticker
  { wch: 8 },  // Proxy
  { wch: 10 }, // Fallback
  { wch: 50 }, // Notes
];
XLSX.utils.book_append_sheet(wb, tickerWs, TAB_NAME);
console.log(`'${TAB_NAME}' tab created with ${TICKER_MAP_ROWS.length - 1} rows`);

XLSX.writeFile(wb, xlsxPath, { bookVBA: true, cellStyles: true });
console.log(`\nWrote: ${xlsxPath}`);
