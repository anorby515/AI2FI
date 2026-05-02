const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');

/**
 * POST /api/tax-harvesting/export
 *
 * Accepts the plan rows the client has computed (with the user's per-row
 * Shares-to-Sell / Share-Price overrides applied) and returns an .xlsx
 * workbook the user can save and edit.
 *
 * The client is responsible for filtering out rows it doesn't want exported
 * (e.g. unchecked / Shares-to-Sell = 0 lots). This endpoint just serializes
 * what it's given.
 */
router.post('/export', (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows must be an array' });
  }

  const headers = [
    'Symbol', 'Account', 'Owner', 'Acquire Date',
    'Shares to Sell / Total Shares',
    'Share Price', 'Estimated Proceeds', 'Running Total',
  ];

  const data = [
    headers,
    ...rows.map(r => [
      r.symbol || '',
      r.account || '',
      r.owner || '',
      r.dateAcquired || '',
      `${r.sharesToSell ?? 0} / ${r.totalShares ?? 0}`,
      r.sharePrice != null ? Number(r.sharePrice) : '',
      r.estimatedProceeds != null ? Number(r.estimatedProceeds) : '',
      r.runningProceeds != null ? Number(r.runningProceeds) : '',
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Apply column widths (rough character-width hints, not pixels).
  ws['!cols'] = [
    { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 16 },
  ];

  // Apply number formats column-by-column. Header is row 0, data starts at row 1.
  const fmt = {
    5: '$#,##0.00', // Share Price
    6: '$#,##0.00', // Estimated Proceeds
    7: '$#,##0.00', // Running Total
  };
  for (let r = 1; r < data.length; r++) {
    for (const colIdx of Object.keys(fmt)) {
      const ref = XLSX.utils.encode_cell({ r, c: Number(colIdx) });
      const cell = ws[ref];
      if (cell && cell.t === 'n') cell.z = fmt[colIdx];
    }
  }

  // Freeze the header row so it stays visible as the user scrolls.
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tax Harvesting Plan');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  const today = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="tax-harvesting-plan-${today}.xlsx"`);
  res.send(buf);
});

module.exports = router;
