#!/usr/bin/env node
// Adds a `Mortgage` tab to the user's Finances.xlsx (resolved via the same
// profile-resolver the dashboard uses). Skips if the tab already exists.
//
// Usage: node dashboard/scripts/init-mortgage-tab.js
//
// After running, open the spreadsheet and replace the placeholder values in
// column B with your real mortgage numbers. The dashboard's Mortgage view
// reads from this tab via /api/mortgage.

const path = require('path');
const ExcelJS = require(path.join(__dirname, '..', 'node_modules', 'exceljs'));
const { resolveProfile } = require('../server/profile-resolver');

// Layout matches the conventional template: labels in column B, values in
// column C. The dashboard's /api/mortgage route accepts either A/B or B/C.
const PLACEHOLDER_ROWS = [
  { label: 'Property',         value: 'My Home' },
  { label: 'Principal',        value: 0,           fmt: '$#,##0.00' },
  { label: 'Origination Date', value: new Date(),  fmt: 'm/d/yy' },
  { label: 'Term in years',    value: 30 },
  { label: 'Rate',             value: 0,           fmt: '0%' },
  { label: 'Payment',          value: 0,           fmt: '($#,##0.00);($#,##0.00)' },
];

(async () => {
  const profile = resolveProfile();
  if (!profile) {
    console.error('No user profile found. Create one under user-profiles/<your-name>/private/Finances.xlsx first.');
    process.exit(1);
  }
  const sheetPath = profile.spreadsheetPath;
  const fs = require('fs');
  if (!fs.existsSync(sheetPath)) {
    console.error(`Spreadsheet not found at ${sheetPath}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sheetPath);
  if (wb.getWorksheet('Mortgage')) {
    console.log('Mortgage tab already exists in', sheetPath, '— nothing to do.');
    process.exit(0);
  }

  const ws = wb.addWorksheet('Mortgage');
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 18;
  PLACEHOLDER_ROWS.forEach((r, i) => {
    const rowNum = i + 2;
    ws.getCell(`B${rowNum}`).value = r.label;
    ws.getCell(`C${rowNum}`).value = r.value;
    if (r.fmt) ws.getCell(`C${rowNum}`).numFmt = r.fmt;
  });

  await wb.xlsx.writeFile(sheetPath);
  console.log(`Added Mortgage tab to ${sheetPath}.`);
  console.log('Open it and replace the placeholder values in column C with your real numbers.');
})().catch(err => { console.error(err); process.exit(1); });
