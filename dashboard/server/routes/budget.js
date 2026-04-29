const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

// Tab names we'll try, in order. First match wins.
const TAB_NAME_CANDIDATES = ['Budget', 'Annual Budget', 'Cash Flow', 'CashFlow'];

const HEADER_ALIASES = {
  source: ['source', 'from'],
  target: ['target', 'to'],
  value:  ['value', 'amount', 'flow'],
};

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

function findBudgetWorksheet(wb) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const candidates = new Set(TAB_NAME_CANDIDATES.map(norm));
  let match = null;
  wb.eachSheet((ws) => {
    if (match) return;
    if (candidates.has(norm(ws.name))) match = ws;
  });
  return match;
}

// Locate the header row by scanning the first ~10 rows for cells that match
// our alias set. Returns { headerRow, columns: { source, target, value } } or null.
function findHeader(ws) {
  const maxRow = Math.min(10, ws.rowCount || 10);
  const maxCol = Math.min(20, ws.columnCount || 20);
  for (let r = 1; r <= maxRow; r++) {
    const cols = { source: null, target: null, value: null };
    for (let c = 1; c <= maxCol; c++) {
      const raw = unwrap(ws.getCell(r, c).value);
      if (typeof raw !== 'string') continue;
      const key = raw.toLowerCase().trim();
      for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.includes(key) && cols[canonical] == null) {
          cols[canonical] = c;
        }
      }
    }
    if (cols.source && cols.target && cols.value) {
      return { headerRow: r, columns: cols };
    }
  }
  return null;
}

async function parseBudget(spreadsheetPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(spreadsheetPath);
  const ws = findBudgetWorksheet(wb);
  if (!ws) {
    const tabs = [];
    wb.eachSheet(s => tabs.push(s.name));
    return { error: 'no-tab', availableTabs: tabs };
  }

  const header = findHeader(ws);
  if (!header) {
    return { error: 'no-header' };
  }

  const { headerRow, columns } = header;
  const links = [];
  const nodeSet = new Map();

  // Preserve the order of first appearance so the Sankey lays out left-to-right
  // in the order the user wrote the rows.
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const source = unwrap(ws.getCell(r, columns.source).value);
    const target = unwrap(ws.getCell(r, columns.target).value);
    const valueRaw = unwrap(ws.getCell(r, columns.value).value);
    if (source == null || target == null || valueRaw == null) continue;
    const value = Number(valueRaw);
    if (!Number.isFinite(value) || value <= 0) continue;
    const s = String(source).trim();
    const t = String(target).trim();
    if (!s || !t) continue;
    if (!nodeSet.has(s)) nodeSet.set(s, true);
    if (!nodeSet.has(t)) nodeSet.set(t, true);
    links.push({ source: s, target: t, value });
  }

  if (links.length === 0) {
    return { error: 'no-rows' };
  }

  return {
    nodes: [...nodeSet.keys()].map(name => ({ id: name, name })),
    links,
  };
}

// GET /api/budget — returns { nodes, links, isTemplate } for the Sankey.
router.get('/', async (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = await parseBudget(sheet.path);
    if (data && data.error === 'no-tab') {
      return res.status(404).json({
        error: `No Budget tab found in ${sheet.isTemplate ? 'the template' : 'your spreadsheet'}. ` +
               `Tried tab names: ${TAB_NAME_CANDIDATES.join(', ')}.`,
        availableTabs: data.availableTabs,
        spreadsheetPath: sheet.path,
        isTemplate: !!sheet.isTemplate,
      });
    }
    if (data && data.error === 'no-header') {
      return res.status(400).json({
        error: 'Budget tab is missing source/target/value columns.',
        spreadsheetPath: sheet.path,
        isTemplate: !!sheet.isTemplate,
      });
    }
    if (data && data.error === 'no-rows') {
      return res.status(400).json({
        error: 'Budget tab has no valid rows.',
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
