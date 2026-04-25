const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

// The Mortgage worksheet uses a key/value layout — column A is the field name,
// column B is the value. Order doesn't matter; we look up by name.
const NUMERIC_FIELDS = new Set([
  'original_principal',
  'interest_rate',
  'term_months',
  'monthly_payment',
  'current_balance',
  'principal_paid',
  'interest_paid',
]);

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'number' && val > 10000 && val < 200000) {
    return new Date((val - 25569) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof val === 'string') return val.slice(0, 10);
  return null;
}

function unwrap(val) {
  // ExcelJS returns formula cells as { result, formula }
  if (val && typeof val === 'object' && 'result' in val) return val.result;
  return val;
}

async function parseMortgage(spreadsheetPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(spreadsheetPath);
  const ws = wb.getWorksheet('Mortgage');
  if (!ws) return null;

  const fields = {};
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // header
    const key = row.getCell(1).value;
    const val = unwrap(row.getCell(2).value);
    if (typeof key !== 'string' || !key) return;
    fields[key.trim()] = val;
  });

  const out = {
    property:           fields.property ?? null,
    original_principal: NUMERIC_FIELDS.has('original_principal') ? Number(fields.original_principal) : null,
    interest_rate:      Number(fields.interest_rate),
    term_months:        Number(fields.term_months),
    monthly_payment:    Number(fields.monthly_payment),
    origination_date:   parseDate(fields.origination_date),
    current_balance:    Number(fields.current_balance),
    principal_paid:     Number(fields.principal_paid),
    interest_paid:      Number(fields.interest_paid),
    as_of_date:         parseDate(fields.as_of_date),
  };
  // numeric defensive cleanup
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'number' && !Number.isFinite(out[k])) out[k] = null;
  }
  return out;
}

// GET /api/mortgage
router.get('/', async (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = await parseMortgage(sheet.path);
    if (!data) return res.status(404).json({ error: 'No Mortgage tab found in spreadsheet' });
    res.json({ ...data, isTemplate: !!sheet.isTemplate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
