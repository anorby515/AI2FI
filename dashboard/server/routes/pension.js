const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

const TAB_NAME_CANDIDATES = ['Pension', 'Pensions', 'Retirement Pension'];

// Header fields in column B with values in column C.
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

function readHeader(ws) {
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

// Walk the rows below the "Contemporary Benefit Options" header. A new option
// starts whenever column B has a label; subsequent rows with column B empty
// continue the previous option (used for the 2-row "Starting benefit" /
// "Leveling Amount" pattern). The "Senior Supplementary Benefit" row is
// pulled out separately because it applies to every scenario.
function readOptions(ws) {
  let optionsStartRow = null;
  ws.eachRow((row, n) => {
    const v = unwrap(row.getCell(2).value);
    if (typeof v === 'string' && /contemporary benefit options/i.test(v)) {
      optionsStartRow = n;
    }
  });
  if (!optionsStartRow) return { options: [], supplementary: null };

  const grouped = [];
  let supplementary = null;
  let current = null;
  const lastRow = ws.rowCount;
  for (let r = optionsStartRow + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    // The SS-Offset options span two rows with column B merged across both.
    // ExcelJS returns the master value on every cell of the merge, so we
    // skip the continuation rows by detecting `master.row !== r`.
    const colBCell = row.getCell(2);
    const isContinuation = colBCell.isMerged && colBCell.master && colBCell.master.row !== r;
    const colB = isContinuation ? null : unwrap(colBCell.value);
    const colC = unwrap(row.getCell(3).value);
    const colD = unwrap(row.getCell(4).value);
    const colE = unwrap(row.getCell(5).value);
    const colF = unwrap(row.getCell(6).value);
    const colG = unwrap(row.getCell(7).value);

    if (typeof colB === 'string' && /senior supplementary/i.test(colB)) {
      supplementary = {
        amount: typeof colD === 'number' ? colD : 0,
        date: parseDate(colG) || null,
      };
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

  return { options, supplementary };
}

async function parsePension(spreadsheetPath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(spreadsheetPath);
  const ws = findWorksheet(wb);
  if (!ws) {
    const tabs = [];
    wb.eachSheet(s => tabs.push(s.name));
    return { error: 'no-tab', availableTabs: tabs };
  }
  const header = readHeader(ws);
  const { options, supplementary } = readOptions(ws);
  return { header, options, supplementary };
}

router.get('/', async (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = await parsePension(sheet.path);
    if (data && data.error === 'no-tab') {
      return res.status(404).json({
        error: `No Pension tab found in ${sheet.isTemplate ? 'the template' : 'your spreadsheet'}. ` +
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
