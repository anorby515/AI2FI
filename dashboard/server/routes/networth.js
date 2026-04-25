const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

// Row mapping (1-indexed in Excel, matches the HTML dashboard)
const ROW_MAP = {
  debt: 3,
  cash_savings_cd: 4,
  brokerage: 5,
  rsus: 6,
  retirement: 7,
  assets: 8,
  education: 9,
  net_worth: 16,
  debt_ratio: 19,
};

function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'number' && val > 10000 && val < 200000) {
    const d = new Date((val - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof val === 'string') return val.slice(0, 10);
  return null;
}

async function parseNetWorth(spreadsheetPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(spreadsheetPath);
  const ws = wb.getWorksheet('Net Worth MoM');

  // Row 2 has dates starting from column 3 (C)
  const dateRow = ws.getRow(2);
  const dates = [];
  const maxCol = ws.columnCount;

  for (let col = 3; col <= maxCol; col++) {
    const val = dateRow.getCell(col).value;
    const d = formatDate(val);
    if (d) dates.push({ col, date: d });
  }

  // Extract each category
  const result = dates.map(({ col, date }) => {
    const entry = { date };
    for (const [key, row] of Object.entries(ROW_MAP)) {
      const cell = ws.getRow(row).getCell(col);
      const val = cell.value;
      // Handle formula results
      const num = typeof val === 'object' && val !== null && 'result' in val ? val.result : val;
      entry[key] = typeof num === 'number' ? num : null;
    }
    return entry;
  });

  // Trim trailing entries where net_worth is null
  while (result.length > 0 && result[result.length - 1].net_worth == null) {
    result.pop();
  }

  return result;
}

// GET /api/networth
router.get('/', async (req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = await parseNetWorth(sheet.path);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
