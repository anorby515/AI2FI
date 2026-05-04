// /api/retirement/inputs — aggregates everything the retirement simulator needs
// from the spreadsheet. Pulls DOBs, salary hints, pension options, and current
// balances by reusing the existing per-tab parsers.
//
// Read-only: never writes the xlsx.
//
// Returns shape:
//   {
//     isTemplate: boolean,
//     asOfDate: ISO date string,
//     people: { self: { name, dob, currentAge }, spouse: {...} },
//     currentBalances: { '401k', BrokerageLink, 'Traditional IRA', 'Roth IRA',
//                        Brokerage, HSA, ESA, RSU },        // RSU split out;
//                                                            // Brokerage no
//                                                            // longer includes
//                                                            // RSU lots.
//     balancesByOwner: { [ownerName]: { [accountType]: balance } },
//     owners: string[],            // owner names, with selfOwner first
//     selfOwner: string | null,    // owner with most portfolio lots — used to
//                                  // attribute 401k + BrokerageLink balances.
//     pensionOptions: [...],          // verbatim from /api/pension
//     salaryHints: { currentAnnualSalary, annualIncreasePct, stipPct },
//     contributionHints: { annual401kFromLedger, annualEmployerMatchFromLedger },
//   }
//
// Vesting: RSU lots whose `dateAcquired` (vest date) falls after `asOfDate`
// are skipped — they're not yours yet.

const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');
const cache = require('../cache');
const portfolio = require('./portfolio');

// Long TTL on cached quote reads here — the inputs aggregator should never
// trigger a Yahoo fetch. If a quote isn't cached, fall back to cost basis
// (the user's data still flows through; the simulator can be re-run after
// /api/sync warms the cache).
const QUOTE_TTL = 7 * 24 * 60 * 60 * 1000;

// Re-export the existing parsers' core logic. We require the route modules but
// only call into their helper functions. Since those helpers aren't exported,
// we re-implement small focused versions here that match their shapes. This is
// intentional — the helpers in those routes are tightly coupled to their
// route's response shape. We keep the spreadsheet-read paths identical.

// --- date helpers (matching pension.js) ---
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'number' && val > 10000 && val < 200000) {
    return new Date((val - 25569) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof val === 'string') {
    const t = Date.parse(val);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

function ageFromDob(dobIso, asOfIso) {
  if (!dobIso) return null;
  const dob = new Date(dobIso + 'T00:00:00Z');
  const ref = new Date(asOfIso + 'T00:00:00Z');
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const m = ref.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

// --- pension parsing (mirrors pension.js helpers) ---
const TAB_NAME_CANDIDATES = ['Pension', 'Pensions', 'Retirement Pension'];

const FIELD_ALIASES = {
  stop_working:         ['stop working', 'last day worked'],
  benefit_commencement: ['benefit commencement', 'commencement date'],
  beneficiary:          ['beneficiary'],
  beneficiary_dob:      ['beneficiary date of birth', 'beneficiary dob', 'spouse date of birth'],
  my_dob:               ['my date of birth', 'date of birth', 'your date of birth'],
  salary_increase_pct:  ['salary increase percent', 'salary increase'],
  stip_pct:             ['short term incentive percent', 'short term incentive'],
};
const LABEL_TO_CANONICAL = {};
for (const [canonical, labels] of Object.entries(FIELD_ALIASES)) {
  for (const label of labels) LABEL_TO_CANONICAL[label.toLowerCase().trim()] = canonical;
}

function unwrap(val) {
  if (val == null) return val;
  if (val instanceof Date) return val;
  if (typeof val === 'object') {
    if ('result' in val) return unwrap(val.result);
    if (Array.isArray(val.richText)) return val.richText.map(p => p.text).join('');
    if (Array.isArray(val) && val.length > 0) return unwrap(val[0]);
  }
  return val;
}

function findPensionWorksheet(wb) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const candidates = new Set(TAB_NAME_CANDIDATES.map(norm));
  let match = null;
  wb.eachSheet((ws) => {
    if (match) return;
    if (candidates.has(norm(ws.name))) match = ws;
  });
  return match;
}

function readPensionHeader(ws) {
  const out = {};
  ws.eachRow((row) => {
    const rawLabel = unwrap(row.getCell(2).value);
    if (typeof rawLabel !== 'string') return;
    const canonical = LABEL_TO_CANONICAL[rawLabel.toLowerCase().trim()];
    if (!canonical) return;
    const raw = unwrap(row.getCell(3).value);
    if (canonical === 'stop_working' || canonical === 'benefit_commencement'
        || canonical === 'beneficiary_dob' || canonical === 'my_dob') {
      out[canonical] = parseDate(raw);
    } else if (canonical === 'salary_increase_pct' || canonical === 'stip_pct') {
      out[canonical] = typeof raw === 'number' ? raw : null;
    } else {
      out[canonical] = raw ?? null;
    }
  });
  return out;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function readPensionOptions(ws) {
  let optionsStartRow = null;
  ws.eachRow((row, n) => {
    const v = unwrap(row.getCell(2).value);
    if (typeof v === 'string' && /contemporary benefit options/i.test(v)) {
      optionsStartRow = n;
    }
  });
  if (!optionsStartRow) return [];

  const grouped = [];
  let current = null;
  const lastRow = ws.rowCount;
  for (let r = optionsStartRow + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const colBCell = row.getCell(2);
    const isContinuation = colBCell.isMerged && colBCell.master && colBCell.master.row !== r;
    const colB = isContinuation ? null : unwrap(colBCell.value);
    const colC = unwrap(row.getCell(3).value);
    const colD = unwrap(row.getCell(4).value);
    const colE = unwrap(row.getCell(5).value);
    const colF = unwrap(row.getCell(6).value);
    const colG = unwrap(row.getCell(7).value);

    if (typeof colB === 'string' && /senior supplementary/i.test(colB)) {
      current = null;
      continue;
    }

    if (typeof colB === 'string' && colB.trim()) {
      current = { label: colB.trim(), rows: [] };
      grouped.push(current);
    }

    if (current && (typeof colD === 'number' || typeof colE === 'number')) {
      current.rows.push({
        subtype: typeof colC === 'string' ? colC.trim() : null,
        you: typeof colD === 'number' ? colD : 0,
        spouse: typeof colE === 'number' ? colE : 0,
        frequency: typeof colF === 'string' ? colF.trim() : null,
        when: parseDate(colG),
      });
    }
  }

  const options = [];
  for (const g of grouped) {
    if (!g.rows.length) continue;
    const id = slugify(g.label);
    const startRow = g.rows.find(r => r.subtype && /starting/i.test(r.subtype));
    const levelRow = g.rows.find(r => r.subtype && /leveling/i.test(r.subtype));

    if (startRow && levelRow) {
      options.push({
        id, label: g.label, kind: 'ss_offset_annuity',
        you_starting:    startRow.you,
        you_leveling:    levelRow.you,
        spouse_starting: startRow.spouse,
        spouse_leveling: levelRow.spouse,
        start_date:      startRow.when,
        leveling_date:   levelRow.when,
      });
      continue;
    }

    const r0 = g.rows[0];
    const isOneTime = r0.frequency && /one[-\s]?time/i.test(r0.frequency);
    if (isOneTime) {
      options.push({
        id, label: g.label, kind: 'lump_sum',
        you_amount:    r0.you,
        spouse_amount: r0.spouse,
        date:          r0.when,
      });
    } else {
      options.push({
        id, label: g.label, kind: 'annuity',
        you_amount:    r0.you,
        spouse_amount: r0.spouse,
        start_date:    r0.when,
      });
    }
  }
  return options;
}

async function parsePensionFile(spreadsheetPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(spreadsheetPath);
  const ws = findPensionWorksheet(wb);
  if (!ws) return { header: {}, options: [] };
  return {
    header: readPensionHeader(ws),
    options: readPensionOptions(ws),
  };
}

// --- 401k ledger parsing (lightweight version of four01k.js) ---
function fmtDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  if (typeof val === 'number' && val > 10000 && val < 200000) {
    return new Date((val - 25569) * 86400000).toISOString().slice(0, 10);
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

// Sum the most recent 12 months of `Contributions` rows. Returns 0 when no
// contributions are found.
function annualContributionsFromLedger(wb) {
  const ws = wb.Sheets['401k Ledger'];
  if (!ws) return 0;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const header = rows[0] || [];
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const idx = {};
  header.forEach((h, i) => { if (h) idx[norm(h)] = i; });
  const get = (row, name) => {
    const i = idx[norm(name)];
    return i == null ? undefined : row[i];
  };

  const contribs = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const txn = get(r, 'Transaction Type');
    if (txn !== 'Contributions') continue;
    const date = fmtDate(get(r, 'Date'));
    const amount = num(get(r, 'Amount'));
    if (!date) continue;
    contribs.push({ date, amount });
  }
  if (contribs.length === 0) return 0;

  contribs.sort((a, b) => b.date.localeCompare(a.date));
  const latestDate = contribs[0].date;
  const cutoff = new Date(latestDate + 'T00:00:00Z');
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  let total = 0;
  for (const c of contribs) {
    if (c.date > cutoffIso) total += c.amount;
  }
  return total;
}

// --- BrokerageLink current value ---
function brokerageLinkCurrentValue(wb) {
  const ws = wb.Sheets['BrokerageLink'];
  if (!ws) return 0;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const header = rows[0] || [];
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const idx = {};
  header.forEach((h, i) => { if (h) idx[norm(h)] = i; });
  const get = (row, name) => {
    const i = idx[norm(name)];
    return i == null ? undefined : row[i];
  };

  let total = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) break;
    const symbol = get(row, 'Symbol');
    const acct = get(row, 'Account Number');
    if (!symbol && !acct) break;
    if (typeof row[0] === 'string' && /last updated/i.test(row[0])) break;
    if (!symbol) continue;
    const cv = parseFloat(get(row, 'Current Value'));
    if (Number.isFinite(cv)) total += cv;
  }
  return total;
}

// --- 401k current balance: delegates to four01k.parseSheet so the snapshot-
// or-NAV-anchor logic stays in one place. Sums each open holding's snapshot
// currentValue when present, falling back to currentShares × lastKnownNAV
// otherwise. Closed holdings contribute 0.
const four01k = require('./four01k');
function four01kCurrentBalance(spreadsheetPath) {
  let parsed;
  try {
    parsed = four01k.parseSheet
      ? four01k.parseSheet(spreadsheetPath)
      : null;
  } catch {
    parsed = null;
  }
  if (!parsed || !Array.isArray(parsed.holdings)) return 0;
  let total = 0;
  for (const h of parsed.holdings) {
    if (!h.isOpen) continue;
    if (h.snapshot && Number.isFinite(h.snapshot.currentValue)) {
      total += h.snapshot.currentValue;
    } else if (h.lastKnownNAV != null && h.currentShares > 0) {
      total += h.currentShares * h.lastKnownNAV;
    }
  }
  return total;
}

// --- portfolio-derived balances (Brokerage / IRAs / HSA / ESA) ---
// Reuses portfolio.js's parser + split normalization so AMZN (20:1), GOOG
// (20:1), etc. carry their displayShares (split-adjusted) rather than the
// raw sharesBought from the ledger. Multiplies by cached live quote when
// available, falling back to displayCostBasis (the per-share cost adjusted
// for splits so it matches displayShares) when no quote is cached.
function portfolioBalances(spreadsheetPath, asOfDate) {
  const totals = {
    'Traditional IRA': 0,
    'Roth IRA': 0,
    'Brokerage': 0,
    'HSA': 0,
    'ESA': 0,
    'RSU': 0,
  };
  const byOwner = {};      // { owner: { accountType: balance } }
  const ownerLotCount = {}; // { owner: lotCount }  — used to infer "self".

  let holdings;
  try {
    const raw = portfolio.parseSheet(spreadsheetPath);
    holdings = portfolio.normalizeHoldings(raw);
  } catch {
    return { totals, byOwner, ownerLotCount };
  }

  const TICKER_MAP = { 'BRKB': 'BRK-B', 'BTC': 'BTC-USD', 'ETH': 'ETH-USD' };
  const priceCache = new Map();
  const priceFor = (sym) => {
    if (priceCache.has(sym)) return priceCache.get(sym);
    const yahooSym = TICKER_MAP[sym] || sym;
    const q = cache.get('current', yahooSym, QUOTE_TTL);
    const price = q && Number.isFinite(q.price) ? q.price : null;
    priceCache.set(sym, price);
    return price;
  };

  for (const h of holdings) {
    if (h.transaction !== 'Open') continue;
    const accountType = String(h.account || '').trim();
    const group = String(h.accountTypeGroup || '').trim();
    const owner = String(h.owner || '').trim() || 'Unknown';

    // Unvested RSU grants — `dateAcquired` carries the vest date — should
    // not contribute to retirement assets until they actually vest. The user
    // has explicit control via the inclusion toggle; vested ones still need
    // to flow through.
    if (accountType === 'RSU' && h.dateAcquired && h.dateAcquired > asOfDate) continue;

    const shares = Number.isFinite(h.displayShares) ? h.displayShares : h.sharesBought;
    if (!Number.isFinite(shares) || shares <= 0) continue;
    const livePrice = priceFor(String(h.symbol || '').trim());
    const adjCost = Number.isFinite(h.displayCostBasis) ? h.displayCostBasis : h.costBasis;
    const lotValue = livePrice != null ? livePrice * shares : adjCost * shares;

    let bucket = null;
    if (accountType === 'RSU') {
      // Pull RSUs out of Brokerage so the user can toggle them as a
      // distinct line item — they're tied to current employment and the
      // simulator should treat them as an opt-in source of retirement assets.
      bucket = 'RSU';
    } else if (group === 'Retirement') {
      // Skip 401k — those lots live in a separate ledger we total separately.
      if (accountType === '401k') continue;
      if (accountType === 'Traditional IRA' || accountType === 'Roth IRA') {
        bucket = accountType;
      }
    } else if (group === 'Brokerage') {
      bucket = 'Brokerage';
    } else if (group === 'HSA') {
      bucket = 'HSA';
    } else if (group === 'ESA') {
      bucket = 'ESA';
    }

    if (!bucket) continue;

    totals[bucket] += lotValue;
    if (!byOwner[owner]) byOwner[owner] = {};
    byOwner[owner][bucket] = (byOwner[owner][bucket] || 0) + lotValue;
    ownerLotCount[owner] = (ownerLotCount[owner] || 0) + 1;
  }
  return { totals, byOwner, ownerLotCount };
}

// --- Public aggregator ---
async function aggregateInputs() {
  const sheet = resolveSpreadsheet();
  if (!sheet) return { error: 'no-profile' };

  const wb = XLSX.readFile(sheet.path, { cellDates: false });
  const pension = await parsePensionFile(sheet.path);
  const asOfDate = new Date().toISOString().slice(0, 10);
  // portfolioBalances reuses portfolio.js's parser, which re-reads the file —
  // pass the path rather than the wb so split adjustments and the lookup
  // tables flow through. asOfDate is used to drop unvested RSU grants.
  const { totals, byOwner, ownerLotCount } = portfolioBalances(sheet.path, asOfDate);
  const four01kBalance = four01kCurrentBalance(sheet.path);
  const blBalance = brokerageLinkCurrentValue(wb);
  const annual401k = annualContributionsFromLedger(wb);

  // Infer "self" owner — the user with the most lots in the portfolio. The
  // 401k Ledger and BrokerageLink sheets have no Owner column, so we attribute
  // those balances to whichever person the user-as-data-owner clearly is.
  // Falls back to a synthetic 'Self' bucket when no portfolio lots exist.
  let selfOwner = null;
  let maxCount = -1;
  for (const [owner, count] of Object.entries(ownerLotCount)) {
    if (count > maxCount) { maxCount = count; selfOwner = owner; }
  }
  if (!selfOwner) selfOwner = 'Self';

  const balancesByOwner = {};
  for (const [owner, byAcct] of Object.entries(byOwner)) {
    balancesByOwner[owner] = { ...byAcct };
  }
  if (!balancesByOwner[selfOwner]) balancesByOwner[selfOwner] = {};
  if (four01kBalance > 0) {
    balancesByOwner[selfOwner]['401k'] =
      (balancesByOwner[selfOwner]['401k'] || 0) + four01kBalance;
  }
  if (blBalance > 0) {
    balancesByOwner[selfOwner]['BrokerageLink'] =
      (balancesByOwner[selfOwner]['BrokerageLink'] || 0) + blBalance;
  }
  // Round each per-owner cell to cents.
  for (const owner of Object.keys(balancesByOwner)) {
    for (const at of Object.keys(balancesByOwner[owner])) {
      balancesByOwner[owner][at] = Number(balancesByOwner[owner][at].toFixed(2));
    }
  }
  const owners = Object.keys(balancesByOwner).sort((a, b) => {
    // selfOwner sorts first, then alphabetically.
    if (a === selfOwner) return -1;
    if (b === selfOwner) return 1;
    return a.localeCompare(b);
  });

  const myDob = pension.header.my_dob || null;
  const spouseDob = pension.header.beneficiary_dob || null;
  const beneficiaryName = pension.header.beneficiary || null;

  // Self/spouse names: try to read from the profile dir name — but we don't
  // have an actual "name" anywhere reliable except `beneficiary` for spouse.
  // Leave self.name as null; the UI can fall back to "Self" / profile name.
  const selfName = null;
  const spouseName = beneficiaryName ? String(beneficiaryName).trim() : null;

  return {
    isTemplate: !!sheet.isTemplate,
    asOfDate,
    people: {
      self: {
        name: selfName,
        dob: myDob,
        currentAge: ageFromDob(myDob, asOfDate),
      },
      spouse: {
        name: spouseName,
        dob: spouseDob,
        currentAge: ageFromDob(spouseDob, asOfDate),
      },
    },
    currentBalances: {
      '401k': Number(four01kBalance.toFixed(2)),
      'BrokerageLink': Number(blBalance.toFixed(2)),
      'Traditional IRA': Number(totals['Traditional IRA'].toFixed(2)),
      'Roth IRA': Number(totals['Roth IRA'].toFixed(2)),
      'Brokerage': Number(totals['Brokerage'].toFixed(2)),
      'HSA': Number(totals['HSA'].toFixed(2)),
      'ESA': Number(totals['ESA'].toFixed(2)),
      'RSU': Number(totals['RSU'].toFixed(2)),
    },
    balancesByOwner,
    owners,
    selfOwner,
    pensionOptions: pension.options,
    pensionMeta: {
      stopWorking: pension.header.stop_working || null,
      benefitCommencement: pension.header.benefit_commencement || null,
    },
    salaryHints: {
      // We don't have a current annual salary on the spreadsheet header
      // directly — only growth and STIP percentages. Leave salary null and let
      // the UI/seeder treat it as missing (user must fill in).
      currentAnnualSalary: null,
      annualIncreasePct: pension.header.salary_increase_pct ?? null,
      stipPct: pension.header.stip_pct ?? null,
    },
    contributionHints: {
      // Source ledger does not split employee/employer rows clearly. Report
      // the combined total under the "annual401kFromLedger" label and leave
      // the employer-match field null — the UI shows it as an editable hint.
      annual401kFromLedger: Number(annual401k.toFixed(2)),
      annualEmployerMatchFromLedger: null,
    },
  };
}

router.get('/', async (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = await aggregateInputs();
    if (data && data.error === 'no-profile') {
      return res.status(404).json(noProfileResponse());
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
module.exports.aggregateInputs = aggregateInputs;
