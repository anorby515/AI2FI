const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

const TAB_NAME_CANDIDATES = ['Education Savings', 'College Savings', 'Education', 'College', '529'];

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

function findWorksheet(wb) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const candidates = new Set(TAB_NAME_CANDIDATES.map(norm));
  let match = null;
  wb.eachSheet((ws) => {
    if (match) return;
    if (candidates.has(norm(ws.name))) match = ws;
  });
  return match;
}

async function parseEducationSavings(spreadsheetPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(spreadsheetPath);
  const ws = findWorksheet(wb);
  if (!ws) {
    const tabs = [];
    wb.eachSheet(s => tabs.push(s.name));
    return { error: 'no-tab', availableTabs: tabs };
  }

  // Layout (verified against the user's template):
  //   Row 1: optional milestone markers in random columns — ignored.
  //   Row 2: header. B=Child, C=Estimated Tuition per Year, D=Remaining
  //          Tuition, E=College Start Date, F=Monthly Contribution,
  //          G..onwards = monthly date headers for the running balance
  //          time series. Tuition values are stored as negatives in the
  //          template (treated as outflows); we surface them as positive
  //          magnitudes for display.
  //   Rows 3+: one student per row.
  const headerRow = ws.getRow(2);
  const maxCol = ws.columnCount;

  // Build the date axis from row 2 starting at col G (7).
  const dateAxis = [];
  for (let col = 7; col <= maxCol; col++) {
    const raw = unwrap(headerRow.getCell(col).value);
    const iso = parseDate(raw);
    dateAxis.push({ col, date: iso });
  }

  const students = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const name = unwrap(row.getCell(2).value);
    if (!name || typeof name !== 'string') return;
    const tuitionRaw   = unwrap(row.getCell(3).value);
    const remainingRaw = unwrap(row.getCell(4).value);
    const startRaw     = unwrap(row.getCell(5).value);
    const monthlyRaw   = unwrap(row.getCell(6).value);

    const tuition   = typeof tuitionRaw   === 'number' ? Math.abs(tuitionRaw)   : null;
    const remaining = typeof remainingRaw === 'number' ? Math.abs(remainingRaw) : null;
    const monthly   = typeof monthlyRaw   === 'number' ? monthlyRaw : null;
    const collegeStart = parseDate(startRaw);

    // Balance history — only include cells with a real numeric value AND a
    // valid date. The user's template has a typo where post-2030 columns
    // were entered as 1930+; those cells happen to be empty so we don't
    // need to fix them, but we filter by date validity anyway.
    const history = [];
    for (const { col, date } of dateAxis) {
      if (!date) continue;
      const v = unwrap(row.getCell(col).value);
      if (typeof v !== 'number') continue;
      history.push({ date, balance: v });
    }
    const currentBalance = history.length ? history[history.length - 1].balance : null;

    students.push({
      name,
      estimated_tuition: tuition,
      remaining_tuition: remaining,
      college_start_date: collegeStart,
      monthly_contribution: monthly,
      current_balance: currentBalance,
      history,
    });
  });

  const asOfDate = students
    .flatMap(s => s.history.map(h => h.date))
    .sort()
    .pop() || null;

  return { students, as_of_date: asOfDate };
}

// GET /api/education-savings
router.get('/', async (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = await parseEducationSavings(sheet.path);
    if (data && data.error === 'no-tab') {
      return res.status(404).json({
        error: `No Education Savings tab found in ${sheet.isTemplate ? 'the template' : 'your spreadsheet'}. ` +
               `Tried tab names: ${TAB_NAME_CANDIDATES.join(', ')}.`,
        availableTabs: data.availableTabs,
        spreadsheetPath: sheet.path,
        isTemplate: !!sheet.isTemplate,
      });
    }
    res.json({ ...data, isTemplate: !!sheet.isTemplate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
