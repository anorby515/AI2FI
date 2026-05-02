const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

// Charitable Trust tab schema (header on row 1):
//   Date | Organization | Sector | Amount
// Distributions OUT of the donor-advised / charitable trust to organizations.
// Contributions INTO the trust come from charitable stock sales in the
// Brokerage Ledger (rows where `Charitable Donation` = 'Yes').

const TAB_NAME_CANDIDATES = ['Charitable Trust', 'Charitable', 'Charity'];
const HEADER_ALIASES = {
  date:         ['date', 'distribution date', 'gift date'],
  organization: ['organization', 'charity', 'recipient', 'org'],
  sector:       ['sector', 'category', 'cause'],
  amount:       ['amount', 'distribution', 'gift'],
};

function normHeader(s) { return String(s ?? '').trim().toLowerCase(); }

function findHeaderIdx(headers, key) {
  const aliases = HEADER_ALIASES[key];
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(normHeader(headers[i]))) return i;
  }
  return -1;
}

function formatDate(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'number' && val > 10000 && val < 200000) {
    return new Date((val - 25569) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

function parseDistributions(wb) {
  const sheetName = wb.SheetNames.find(n =>
    TAB_NAME_CANDIDATES.some(c => c.toLowerCase() === n.trim().toLowerCase())
  );
  if (!sheetName) return { distributions: [], tabFound: false };

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (!rows.length) return { distributions: [], tabFound: true };

  // Find header row in the first 5 rows (tolerate a leading title row).
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i] || [];
    if (findHeaderIdx(r, 'date') >= 0 && findHeaderIdx(r, 'amount') >= 0) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { distributions: [], tabFound: true };

  const headers = rows[headerIdx];
  const iDate   = findHeaderIdx(headers, 'date');
  const iOrg    = findHeaderIdx(headers, 'organization');
  const iSector = findHeaderIdx(headers, 'sector');
  const iAmt    = findHeaderIdx(headers, 'amount');

  const distributions = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const date = formatDate(row[iDate]);
    const amount = Number(row[iAmt]);
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    distributions.push({
      date,
      organization: iOrg >= 0 ? String(row[iOrg] ?? '').trim() : '',
      sector: iSector >= 0 ? String(row[iSector] ?? '').trim() : '',
      amount,
    });
  }
  return { distributions, tabFound: true };
}

// Contributions: charitable stock sales from the Brokerage Ledger. Each lot
// where `Charitable Donation` === 'Yes' becomes one contribution dated on
// `Date Sold`, valued at proceeds (Shares Sold × Sell Basis Per Share).
function parseContributions(wb) {
  const ws = wb.Sheets['Brokerage Ledger'];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const headers = rows[1] || [];
  const colIdx = {};
  headers.forEach((h, i) => { if (h) colIdx[normHeader(h)] = i; });
  const col = (name) => colIdx[normHeader(name)];

  const iCharity = col('Charitable Donation');
  const iSold    = col('Date Sold');
  const iSym     = col('Symbol');
  const iAcct    = col('Account Type');
  const iOwner   = col('Owner');
  const iShSold  = col('Shares Sold');
  const iSellBas = col('Sell Basis Per Share');
  if (iCharity == null || iSold == null) return [];

  const out = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const flag = String(row[iCharity] ?? '').trim().toLowerCase();
    if (flag !== 'yes') continue;
    const date = formatDate(row[iSold]);
    if (!date) continue;
    const shares = Number(row[iShSold]);
    const basis = Number(row[iSellBas]);
    if (!Number.isFinite(shares) || !Number.isFinite(basis)) continue;
    const amount = shares * basis;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push({
      date,
      symbol: iSym != null ? row[iSym] : null,
      account: iAcct != null ? row[iAcct] : null,
      owner: iOwner != null ? row[iOwner] : null,
      shares,
      amount,
    });
  }
  return out;
}

function parseCharitable(spreadsheetPath) {
  const wb = XLSX.readFile(spreadsheetPath, { cellDates: false });
  const { distributions, tabFound } = parseDistributions(wb);
  const contributions = parseContributions(wb);
  return { contributions, distributions, distributionsTabFound: tabFound };
}

router.get('/', (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = parseCharitable(sheet.path);
    res.json({ ...data, isTemplate: !!sheet.isTemplate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
