const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

// Row mapping (1-indexed in Excel) for the raw category rows. Net worth and
// debt ratio used to be read from spreadsheet rows 16 and 19, but those
// formulas only extended through the last filled column — meaning a user
// who entered raw values for a future month got null totals until they
// drag-filled the formulas across. We now derive both totals server-side
// from the category rows so the dashboard auto-renders the moment the user
// types values into a new column, no formula extension required.
const ROW_MAP = {
  debt: 3,
  cash_savings_cd: 4,
  brokerage: 5,
  rsus: 6,
  retirement: 7,
  assets: 8,
  education: 9,
};

// Categories that contribute to "your" net worth. Matches the original
// row-16 formula: SUM(C3:C8). Education (row 9) is excluded — 529s and
// similar are conceptually the beneficiary's money, not the account holder's.
const NET_WORTH_KEYS = ['debt', 'cash_savings_cd', 'brokerage', 'rsus', 'retirement', 'assets'];

// Debt ratio: -debt / sum-of-assets-including-education.
// Original formula: -C3/SUM(C4:C9).
const DEBT_RATIO_DENOM_KEYS = ['cash_savings_cd', 'brokerage', 'rsus', 'retirement', 'assets', 'education'];

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

  // Extract category values per month, then derive net_worth and debt_ratio.
  const result = dates.map(({ col, date }) => {
    const entry = { date };
    let anyValue = false;
    for (const [key, row] of Object.entries(ROW_MAP)) {
      const cell = ws.getRow(row).getCell(col);
      const val = cell.value;
      const num = typeof val === 'object' && val !== null && 'result' in val ? val.result : val;
      if (typeof num === 'number') {
        entry[key] = num;
        anyValue = true;
      } else {
        entry[key] = null;
      }
    }

    // Derive totals. If the column has no category data at all, leave both
    // totals null so the trailing-null trim at the bottom can drop the row.
    if (!anyValue) {
      entry.net_worth = null;
      entry.debt_ratio = null;
      return entry;
    }
    entry.net_worth = NET_WORTH_KEYS.reduce((s, k) => s + (entry[k] ?? 0), 0);
    const denom = DEBT_RATIO_DENOM_KEYS.reduce((s, k) => s + (entry[k] ?? 0), 0);
    entry.debt_ratio = denom !== 0 ? -(entry.debt ?? 0) / denom : null;
    return entry;
  });

  // Trim trailing entries that have no category data (net_worth null).
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
