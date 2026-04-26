const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

// Tab names we'll try, in order. First match wins.
const TAB_NAME_CANDIDATES = ['Mortgage', 'Mortgages', 'Home Loan', 'Loan', 'Loans'];

// Maps the canonical field name we want internally to the various human-readable
// labels that might appear in column A or B of a user's Mortgage tab.
const FIELD_ALIASES = {
  property:           ['property', 'address', 'name'],
  original_principal: ['original_principal', 'principal', 'principle', 'original principal', 'loan amount', 'amount'],
  interest_rate:      ['interest_rate', 'rate', 'interest rate', 'apr'],
  term_months:        ['term_months', 'term in months', 'term (months)'],
  term_years:         ['term_years', 'term in years', 'term (years)', 'term', 'years'],
  monthly_payment:    ['monthly_payment', 'payment', 'p&i', 'pi', 'monthly payment', 'p&i payment'],
  origination_date:   ['origination_date', 'origination date', 'start date', 'first payment date', 'origination'],
  current_balance:    ['current_balance', 'current balance', 'balance', 'online balance'],
  principal_paid:     ['principal_paid', 'principal paid'],
  interest_paid:      ['interest_paid', 'interest paid'],
  as_of_date:         ['as_of_date', 'as of date', 'as of', 'as_of'],
};

// Build a label → canonical lookup once at module load.
const LABEL_TO_CANONICAL = {};
for (const [canonical, labels] of Object.entries(FIELD_ALIASES)) {
  for (const label of labels) {
    LABEL_TO_CANONICAL[label.toLowerCase().trim()] = canonical;
  }
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'number' && val > 10000 && val < 200000) {
    return new Date((val - 25569) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof val === 'string') {
    // Accept M/D/YY, M/D/YYYY, YYYY-MM-DD, etc. Date.parse handles most.
    const t = Date.parse(val);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

function unwrap(val) {
  // ExcelJS returns formula cells as { result, formula } and rich text as
  // { richText: [...] }. Normalize to a primitive.
  if (val == null) return val;
  if (val instanceof Date) return val;
  if (typeof val === 'object') {
    if ('result' in val) return unwrap(val.result);
    if (Array.isArray(val.richText)) return val.richText.map(p => p.text).join('');
    if (Array.isArray(val) && val.length > 0) return unwrap(val[0]);
  }
  return val;
}

function findMortgageWorksheet(wb) {
  for (const name of TAB_NAME_CANDIDATES) {
    const ws = wb.getWorksheet(name);
    if (ws) return ws;
  }
  return null;
}

// Walk the worksheet looking for `label, value` pairs. The labels can sit
// in column A (with values in B) or in column B (with values in C) — the
// user-supplied template uses the latter. We accept the first column where
// any known alias matches.
function readFields(ws) {
  const candidateLayouts = [
    { labelCol: 1, valueCol: 2 }, // A/B
    { labelCol: 2, valueCol: 3 }, // B/C
  ];
  for (const { labelCol, valueCol } of candidateLayouts) {
    const fields = {};
    let hits = 0;
    ws.eachRow((row) => {
      const rawLabel = unwrap(row.getCell(labelCol).value);
      if (typeof rawLabel !== 'string') return;
      const canonical = LABEL_TO_CANONICAL[rawLabel.toLowerCase().trim()];
      if (!canonical) return;
      fields[canonical] = unwrap(row.getCell(valueCol).value);
      hits++;
    });
    if (hits > 0) return fields;
  }
  return {};
}

// Standard fixed-rate amortization. Returns the running totals at month `n`
// from origination, capping at full payoff.
function amortizeForward(originalPrincipal, monthlyRate, monthlyPayment, monthsElapsed) {
  let bal = originalPrincipal;
  let cumI = 0;
  let cumP = 0;
  for (let m = 0; m < monthsElapsed && bal > 0.01; m++) {
    const interest = bal * monthlyRate;
    let principal = monthlyPayment - interest;
    if (principal <= 0) break;
    if (principal > bal) principal = bal;
    bal -= principal;
    cumI += interest;
    cumP += principal;
  }
  return { balance: bal, cumulativeInterest: cumI, cumulativePrincipal: cumP };
}

function monthsBetweenIso(aIso, bIso) {
  const a = new Date(aIso + 'T00:00:00');
  const b = new Date(bIso + 'T00:00:00');
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

async function parseMortgage(spreadsheetPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(spreadsheetPath);
  const ws = findMortgageWorksheet(wb);
  if (!ws) {
    const tabs = [];
    wb.eachSheet(s => tabs.push(s.name));
    return { error: 'no-tab', availableTabs: tabs };
  }

  const fields = readFields(ws);

  // Normalize numeric and unit conventions.
  let interestRate = Number(fields.interest_rate);
  if (Number.isFinite(interestRate) && interestRate > 1) interestRate = interestRate / 100;
  let termMonths = Number(fields.term_months);
  if (!Number.isFinite(termMonths) || termMonths === 0) {
    const years = Number(fields.term_years);
    if (Number.isFinite(years)) termMonths = Math.round(years * 12);
  }
  // Payments are often stored as a negative outflow — use the absolute value.
  let monthlyPayment = Number(fields.monthly_payment);
  if (Number.isFinite(monthlyPayment)) monthlyPayment = Math.abs(monthlyPayment);

  const originalPrincipal = Number(fields.original_principal);
  const originationDate = parseDate(fields.origination_date);
  let asOfDate = parseDate(fields.as_of_date);
  let currentBalance = Number(fields.current_balance);
  let principalPaid  = Number(fields.principal_paid);
  let interestPaid   = Number(fields.interest_paid);

  // If the user only supplies loan terms (the common case — see the "Mortgage"
  // tab in Finances.xlsx), derive the running totals by amortizing from
  // origination_date to today. This is exact for a loan with no extra
  // payments; if the user has been making extras, they can add the
  // current_balance / principal_paid / interest_paid fields to override.
  const havePastTotals = [currentBalance, principalPaid, interestPaid].every(Number.isFinite);
  if (!havePastTotals && Number.isFinite(originalPrincipal) && Number.isFinite(interestRate) && Number.isFinite(monthlyPayment) && originationDate) {
    if (!asOfDate) asOfDate = new Date().toISOString().slice(0, 10);
    const elapsed = monthsBetweenIso(originationDate, asOfDate);
    const totals = amortizeForward(originalPrincipal, interestRate / 12, monthlyPayment, elapsed);
    currentBalance = totals.balance;
    principalPaid  = totals.cumulativePrincipal;
    interestPaid   = totals.cumulativeInterest;
  }
  if (!asOfDate) asOfDate = new Date().toISOString().slice(0, 10);

  const out = {
    property:           fields.property ?? null,
    original_principal: Number.isFinite(originalPrincipal) ? originalPrincipal : null,
    interest_rate:      Number.isFinite(interestRate) ? interestRate : null,
    term_months:        Number.isFinite(termMonths) ? termMonths : null,
    monthly_payment:    Number.isFinite(monthlyPayment) ? monthlyPayment : null,
    origination_date:   originationDate,
    current_balance:    Number.isFinite(currentBalance) ? currentBalance : null,
    principal_paid:     Number.isFinite(principalPaid) ? principalPaid : null,
    interest_paid:      Number.isFinite(interestPaid) ? interestPaid : null,
    as_of_date:         asOfDate,
  };
  return out;
}

// GET /api/mortgage
router.get('/', async (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = await parseMortgage(sheet.path);
    if (data && data.error === 'no-tab') {
      return res.status(404).json({
        error: `No Mortgage tab found in ${sheet.isTemplate ? 'the template' : 'your spreadsheet'}. ` +
               `Tried tab names: ${TAB_NAME_CANDIDATES.join(', ')}.`,
        availableTabs: data.availableTabs,
        spreadsheetPath: sheet.path,
        isTemplate: !!sheet.isTemplate,
        hint: sheet.isTemplate
          ? 'Add a Mortgage tab to core/sample-data/Financial Template.xlsx (key/value layout).'
          : 'Run "node dashboard/scripts/init-mortgage-tab.js" to add a Mortgage tab to your spreadsheet, then edit the values.',
      });
    }
    res.json({ ...data, isTemplate: !!sheet.isTemplate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

