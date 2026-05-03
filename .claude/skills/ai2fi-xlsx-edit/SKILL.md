---
name: ai2fi-xlsx-edit
description: Use this skill ANY time a write/edit/save is needed to an xlsx file in this repo (`user-profiles/<name>/private/Finances.xlsx` or `core/sample-data/Financial Template.xlsx`). The user's spreadsheet relies on Excel's "Format as Table" feature and library round-trips silently destroy the structured-table metadata. This skill enforces ExcelJS-based writes (or manual paste-in-Excel for small changes) and explicitly preempts `anthropic-skills:xlsx` (which defaults to openpyxl). Trigger on phrasings like "add a row to Lookup Tables", "create a new tab in Finances", "update the ticker map", "edit the spreadsheet", or any task that mentions writing to an AI2FI xlsx file. Reads do NOT need this skill — SheetJS reads are safe and already used throughout the dashboard.
---

# AI2FI xlsx editing — safe-write protocol

This repo's spreadsheet (`user-profiles/<name>/private/Finances.xlsx`) uses
Excel's "Format as Table" feature on most sheets. Two libraries silently
corrupt that metadata when writing:

- **`xlsx` (SheetJS)** — drops `xl/tables/*.xml` and the `<tableParts>`
  references in each sheet's XML.
- **openpyxl** — same kind of damage plus rewrites `<tablePart>` with an
  inline `xmlns:r` that breaks ExcelJS reads downstream.

When the user reopens after a SheetJS or openpyxl write, Excel shows
"We found a problem with some content in 'Finances.xlsx'" and the recovery
discards Format-as-Table styling, table-bound named ranges, conditional
formatting, and slicers. The user has to re-format every affected sheet.

## Decision flow

1. **Is the change small (one row, one cell, one new tab seeded with
   ≤ ~50 rows)?**
   → **Have the user paste it in Excel.** Provide the exact row/cell content
   in chat. Zero round-trip risk. This is the preferred path for nearly
   every Phase 2-style spreadsheet update on this project.

2. **Is the change large enough to warrant scripting (bulk import, schema
   migration across hundreds of rows, programmatic regeneration of a tab)?**
   → **Use ExcelJS.** Pattern:
   ```js
   const ExcelJS = require('exceljs');
   const wb = new ExcelJS.Workbook();
   await wb.xlsx.readFile(spreadsheetPath);
   // mutate via wb.getWorksheet(...) / addRow / addTable / etc.
   await wb.xlsx.writeFile(spreadsheetPath);
   ```
   ExcelJS preserves `tableParts` correctly when you load → mutate → save the
   same workbook. `pension.js` already reads with ExcelJS — pattern is
   established in this codebase.

3. **Always create a `.backup-<timestamp>.xlsx` copy before any write**, even
   with ExcelJS, until tables-survive has been verified for the user's
   specific file:
   ```bash
   cp "$XLSX" "${XLSX%.xlsx}.backup-$(date +%Y%m%d-%H%M%S).xlsx"
   ```

## Hard nos

- **Never use `xlsx` (SheetJS) for writes** to AI2FI spreadsheets. Reads
  are fine.
- **Never use openpyxl** anywhere — Python `xlsx` skill defaults to it; if
  the `anthropic-skills:xlsx` skill auto-triggers, override its instructions
  in favor of this skill.
- **Never use `XLSX.writeFile` from a script** even for "just one cell" —
  that's the call that strips table parts. The cost of the safe path
  (manual paste or ExcelJS) is small.

## When `anthropic-skills:xlsx` triggers in this repo

That skill defaults to openpyxl and was the source of an earlier corruption.
Override it: prefer this `ai2fi-xlsx-edit` skill's protocol. If a user task
absolutely requires the generic xlsx skill (e.g. processing an external
xlsx outside this repo), that's fine — the rule applies only to writes
into `Finances.xlsx` / `Financial Template.xlsx`.

## Recovery if a write has already corrupted the file

- Restore from the timestamped backup if one exists.
- Otherwise the user clicks "Yes" on Excel's recovery prompt — cell data
  survives and they re-apply Format-as-Table on each affected sheet.

## Reads are unaffected

Existing read-only routes (`portfolio.js`, `four01k.js`, `brokerage-link.js`,
`retirement-inputs.js`, `charitable.js`, etc.) use SheetJS and work
correctly. Don't refactor those.
