const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const IMPORT_FILE = path.join(DATA_DIR, 'imported-lots.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function formatDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  // Accept YYYY-MM-DD or M/D/YYYY or MM/DD/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return `${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return null;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  // Normalize header
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  // Column index helpers (flexible matching)
  function col(names) {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  }

  const iSymbol   = col(['ticker', 'symbol']);
  const iDate     = col(['transaction date', 'date acquired', 'date']);
  const iCost     = col(['cost basis', 'cost basis per share', 'cost/share', 'cost']);
  const iQty      = col(['qty', 'quantity', 'shares', 'shares bought']);
  const iSellDate = col(['sell date', 'date sold']);
  const iProceeds = col(['proceeds']);
  const iCharity  = col(['sold for cash or charity', 'charity', 'charitable donation']);

  if (iSymbol < 0 || iDate < 0 || iCost < 0 || iQty < 0) {
    throw new Error('CSV missing required columns: Ticker, Transaction Date, Cost Basis, Qty');
  }

  const lots = [];
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted fields
    const row = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || lines[i].split(',');
    const get = idx => idx >= 0 && idx < row.length ? String(row[idx]).trim().replace(/^"|"$/g, '') : '';

    const symbol = get(iSymbol).toUpperCase();
    if (!symbol) continue;

    const dateAcquired = formatDate(get(iDate));
    const costBasis = parseFloat(get(iCost));
    const sharesBought = parseFloat(get(iQty));

    if (!dateAcquired || isNaN(costBasis) || isNaN(sharesBought) || sharesBought <= 0) continue;

    const dateSold = iSellDate >= 0 ? formatDate(get(iSellDate)) : null;
    const proceeds = iProceeds >= 0 ? parseFloat(get(iProceeds)) || null : null;
    const charityRaw = iCharity >= 0 ? get(iCharity).toLowerCase() : '';
    const charitableDonation = charityRaw === 'charity' || charityRaw === 'yes' ? 'Yes' : null;

    lots.push({
      account: 'Imported',
      transaction: dateSold ? 'Closed' : 'Open',
      symbol,
      description: symbol,
      dateAcquired,
      taxLot: `${symbol} ${dateAcquired}`,
      sharesBought,
      costBasis,
      dateSold: dateSold || null,
      charitableDonation,
      sharesSold: dateSold ? sharesBought : null,
      sellBasis: (dateSold && proceeds && sharesBought) ? proceeds / sharesBought : null,
      proceeds: dateSold ? (proceeds || null) : null,
    });
  }

  return lots;
}

// POST /api/import/csv — parse and store imported lots
// Body: { csv: string }  (raw CSV text sent as JSON)
router.post('/', (req, res) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'Body must include { csv: string }' });
  }

  try {
    const lots = parseCSV(csv);
    ensureDataDir();
    fs.writeFileSync(IMPORT_FILE, JSON.stringify(lots, null, 2), 'utf8');
    res.json({ ok: true, count: lots.length, lots });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/import/csv — return currently stored imported lots
router.get('/', (req, res) => {
  if (!fs.existsSync(IMPORT_FILE)) return res.json([]);
  try {
    const lots = JSON.parse(fs.readFileSync(IMPORT_FILE, 'utf8'));
    res.json(lots);
  } catch {
    res.json([]);
  }
});

// DELETE /api/import/csv — clear imported lots
router.delete('/', (req, res) => {
  if (fs.existsSync(IMPORT_FILE)) fs.unlinkSync(IMPORT_FILE);
  res.json({ ok: true });
});

module.exports = router;
