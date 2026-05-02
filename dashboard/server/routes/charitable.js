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
  date:         ['date', 'distribution', 'distribution date', 'gift date'],
  organization: ['organization', 'charity', 'recipient', 'org'],
  sector:       ['sector', 'charitable sector', 'category', 'cause'],
  amount:       ['amount', 'gift'],
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

// Pull free-form metadata key/value pairs from the rows above the table.
// Recognized labels (case-insensitive, trailing colon optional):
//   Account            → meta.account            (string)
//   Timeframe          → meta.timeframe          (string)
//   Current Balance    → meta.currentBalance     (number) +
//                        meta.currentBalanceAsOf (ISO date) — pulled from a
//                        sibling cell that starts with "as of …" if present.
//
// Tolerates currency-symbol filler cells (a lone "$" between the label and
// the numeric value) and "As of …" tags appearing in any column to the
// right of the value.
function parseTrustMeta(rows, headerIdx) {
  const meta = {};
  const labelMap = {
    account:        'account',
    timeframe:      'timeframe',
    'current balance': 'currentBalance',
    balance:        'currentBalance',
  };
  const isFiller = (v) => typeof v === 'string' && /^[\s$€£¥:]+$/.test(v.trim());

  for (let i = 0; i < headerIdx; i++) {
    const row = rows[i] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (typeof cell !== 'string') continue;
      const label = cell.trim().toLowerCase().replace(/:\s*$/, '');
      const key = labelMap[label];
      if (!key) continue;

      // Collect every non-blank, non-filler cell to the right of the label.
      const tail = [];
      for (let nc = c + 1; nc < row.length; nc++) {
        const v = row[nc];
        if (v == null || v === '' || isFiller(v)) continue;
        tail.push(v);
      }

      if (key === 'currentBalance') {
        // Prefer the first numeric value (skip a stray "$" or label cell).
        const num = tail.map(Number).find((n) => Number.isFinite(n));
        if (num != null) meta.currentBalance = num;
        // "As of …" tag may appear before or after the number.
        const asOfRaw = tail.find(
          (v) => typeof v === 'string' && /^as\s+of\b/i.test(v.trim()),
        );
        if (asOfRaw) {
          const iso = formatDate(asOfRaw.trim().replace(/^as\s+of\s*/i, ''));
          if (iso) meta.currentBalanceAsOf = iso;
        }
      } else if (tail.length > 0) {
        meta[key] = String(tail[0]).trim();
      }
      break;
    }
  }
  return meta;
}

function parseDistributions(wb) {
  const sheetName = wb.SheetNames.find(n =>
    TAB_NAME_CANDIDATES.some(c => c.toLowerCase() === n.trim().toLowerCase())
  );
  if (!sheetName) return { distributions: [], meta: {}, tabFound: false };

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (!rows.length) return { distributions: [], meta: {}, tabFound: true };

  // Find header row in the first 10 rows (tolerate leading title/metadata rows
  // like Account / Timeframe / Current Balance on top of the table).
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i] || [];
    if (findHeaderIdx(r, 'date') >= 0 && findHeaderIdx(r, 'amount') >= 0) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { distributions: [], meta: parseTrustMeta(rows, rows.length), tabFound: true };

  const meta = parseTrustMeta(rows, headerIdx);

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
  return { distributions, meta, tabFound: true };
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
  const iAcq     = col('Date Acquired');
  const iSym     = col('Symbol');
  const iAcct    = col('Account Type');
  const iOwner   = col('Owner');
  const iShSold  = col('Shares Sold');
  const iSellBas = col('Sell Basis Per Share');
  const iCostBas = col('Cost Basis Per Share');
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

    // Cost basis of the donated portion (pro-rata) and holding period — both
    // feed the client's "taxes saved" estimate (LT cap gains avoided).
    const dateAcquired = iAcq != null ? formatDate(row[iAcq]) : null;
    const costPerShare = iCostBas != null ? Number(row[iCostBas]) : null;
    const costBasis = Number.isFinite(costPerShare) ? costPerShare * shares : null;

    out.push({
      date,
      symbol: iSym != null ? row[iSym] : null,
      account: iAcct != null ? row[iAcct] : null,
      owner: iOwner != null ? row[iOwner] : null,
      shares,
      amount,
      dateAcquired,
      costBasis,
    });
  }
  return out;
}

function parseCharitable(spreadsheetPath) {
  const wb = XLSX.readFile(spreadsheetPath, { cellDates: false });
  const { distributions, meta, tabFound } = parseDistributions(wb);
  const contributions = parseContributions(wb);
  return { contributions, distributions, meta: meta || {}, distributionsTabFound: tabFound };
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
