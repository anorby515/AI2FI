// /api/brokerage-link — read-only parser for the BrokerageLink tab.
//
// ── DEDUP INVARIANT (Phase 5) ─────────────────────────────────────────────
// TRANSFER rows here (TRANSFERRED FROM / TRANSFERRED TO) represent dollars
// moving between this account and the main 401k (89551). Those same dollars
// also appear in the 401k Ledger as Exchange Out / Exchange In rows (tagged
// flowKind: 'INTRA' there). A future Retirement rollup that sums dollar
// flows across both ledgers will double-count.
//
// Contract for any consumer rolling up the Retirement section:
//   1. PREFER summing current balances per account, not transaction flows.
//   2. If you must sum flows, treat rows where actionType === 'TRANSFER'
//      here as already reflected in the 401k Ledger Exchange Out — DO NOT
//      count them again.
//   3. Outside-money contributions arrive in the 401k Ledger as
//      `Contributions` (flowKind: 'CONTRIBUTION'); none arrive directly in
//      BrokerageLink — every dollar here came through the main 401k first.
//
// See dashboard/server/routes/RETIREMENT_ROLLUP.md for the full contract.
// ──────────────────────────────────────────────────────────────────────────
//
// The tab has TWO tables stacked vertically:
//   1. Top: current holdings export from Fidelity (header at row 1).
//   2. Empty row, then a "Last Updated MM/DD/YYYY" marker row.
//   3. Bottom: transaction history (header at row 12, data from row 13 down).
//
// Caveats baked into this parser:
//   - History only goes back to 2021 in the spreadsheet, but the user has been
//     in BrokerageLink since 2014. We synthesize a single phantom "opening lot"
//     per non-cash fund: opening_shares = current_qty - Σ(2021+ share deltas),
//     opening_cost = current_cost_total - Σ(2021+ buy/sell cash flows). This
//     anchors a chart later to a single point at the day before the earliest
//     2021 transaction for that fund (or 2014-01-01 as a fallback).
//   - FDRXX is the cash money-market sweep — no chart, no cost basis, no
//     opening-lot synthesis. Returned as { isCash: true, currentValue }.
//   - Account number 652488644 is BrokerageLink itself; the Accounts tab also
//     references this number for unrelated cash buckets — we IGNORE the
//     Accounts tab here and read only the BrokerageLink sheet.
//   - This route is read-only. Never write to the xlsx.

const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { resolveSpreadsheet, noProfileResponse } = require('../profile-resolver');

const BROKERAGE_LINK_ACCOUNT_NUMBER = '652488644';
const CASH_SYMBOL = 'FDRXX';

// Pre-2021 black-box anchor — the user reports being in BrokerageLink since
// 2014. We don't know the actual purchase dates; pin synthetic opening lots
// to this date when no earlier 2021 transaction exists for the fund.
const PRE_HISTORY_FALLBACK_DATE = '2014-01-01';

function isoFromExcelSerial(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  if (serial < 10000 || serial > 200000) return null;
  return new Date((serial - 25569) * 86400000).toISOString().slice(0, 10);
}

function isoFromAny(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'number') return isoFromExcelSerial(val);
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function dayBefore(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Bucket a Fidelity action string into a normalized verb. The raw column is
// freeform — "DIVIDEND RECEIVED AS OF DEC-22-2025 VANGUARD REAL ESTATE INDEX
// ADMIRAL (VGSLX) (Cash)" etc. We key off the leading words.
function classifyAction(rawAction) {
  if (!rawAction) return 'OTHER';
  const a = String(rawAction).toUpperCase().trim();
  if (a.startsWith('YOU BOUGHT')) return 'BUY';
  if (a.startsWith('YOU SOLD')) return 'SELL';
  if (a.startsWith('REINVESTMENT')) return 'REINVESTMENT';
  if (a.startsWith('DIVIDEND RECEIVED')) return 'DIVIDEND';
  if (a.startsWith('LONG-TERM CAP GAIN')) return 'LT_CAP_GAIN';
  if (a.startsWith('SHORT-TERM CAP GAIN')) return 'ST_CAP_GAIN';
  if (a.startsWith('TRANSFERRED FROM') || a.startsWith('TRANSFERRED TO')) return 'TRANSFER';
  if (a.startsWith('MERGER')) return 'MERGER';
  if (a.startsWith('REDEMPTION')) return 'REDEMPTION';
  return 'OTHER';
}

// Find the row index where the second header ("Run Date" column) starts. The
// first header is at row 0 and contains "Account Number, Account Name, Symbol,
// ...Average Cost Basis". The second header repeats "Account Number" but adds
// "Run Date" — we use that as the anchor. Returns 0-based row index of header.
function findTransactionHeader(rows) {
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const hasRunDate = r.some(c => typeof c === 'string' && c.trim().toLowerCase() === 'run date');
    if (hasRunDate) return i;
  }
  return -1;
}

function parseHoldingsTable(rows) {
  // Top header is at row 0. Holdings rows continue until we hit a fully-empty
  // row or the "Last Updated" marker / second header.
  const header = rows[0] || [];
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const idx = {};
  header.forEach((h, i) => { if (h) idx[norm(h)] = i; });
  const get = (row, name) => {
    const i = idx[norm(name)];
    return i == null ? undefined : row[i];
  };

  const holdings = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) break;
    // Stop on first row whose Symbol is missing AND Account Number is missing.
    const symbol = get(row, 'Symbol');
    const acct = get(row, 'Account Number');
    if (!symbol && !acct) break;
    // Stop if the row looks like the "Last Updated" marker (string in col A).
    if (typeof row[0] === 'string' && /last updated/i.test(row[0])) break;
    if (!symbol) continue;

    holdings.push({
      accountNumber: acct != null ? String(acct) : null,
      accountName: get(row, 'Account Name') || '',
      symbol: String(symbol),
      description: get(row, 'Description') || '',
      quantity: num(get(row, 'Quantity')),
      lastPrice: num(get(row, 'Last Price')),
      currentValue: num(get(row, 'Current Value')),
      todayGainLossDollar: num(get(row, "Today's Gain/Loss Dollar")),
      todayGainLossPercent: num(get(row, "Today's Gain/Loss Percent")),
      totalGainLossDollar: num(get(row, 'Total Gain/Loss Dollar')),
      totalGainLossPercent: num(get(row, 'Total Gain/Loss Percent')),
      percentOfAccount: num(get(row, 'Percent Of Account')),
      costBasisTotal: num(get(row, 'Cost Basis Total')),
      averageCost: num(get(row, 'Average Cost Basis')),
    });
  }
  return holdings;
}

function findLastUpdatedDate(rows) {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const cell = String(r[0]);
    const m = cell.match(/last updated\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (m) {
      const mm = m[1].padStart(2, '0');
      const dd = m[2].padStart(2, '0');
      return `${m[3]}-${mm}-${dd}`;
    }
  }
  return null;
}

function parseTransactions(rows, headerIdx) {
  const header = rows[headerIdx] || [];
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const idx = {};
  header.forEach((h, i) => { if (h) idx[norm(h)] = i; });
  const get = (row, name) => {
    const i = idx[norm(name)];
    return i == null ? undefined : row[i];
  };

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const action = get(row, 'Action');
    const symbol = get(row, 'Symbol');
    if (!action && !symbol) continue;
    const classifiedAction = classifyAction(action);
    out.push({
      runDate: isoFromAny(get(row, 'Run Date')),
      action: action ? String(action) : '',
      classifiedAction,
      symbol: symbol ? String(symbol) : null,
      description: get(row, 'Description') || '',
      type: get(row, 'Type') || '',
      price: num(get(row, 'Price ($)')),
      quantity: num(get(row, 'Quantity')),
      commission: num(get(row, 'Commission ($)')),
      fees: num(get(row, 'Fees ($)')),
      accruedInterest: num(get(row, 'Accrued Interest ($)')),
      amount: num(get(row, 'Amount ($)')),
      cashBalance: num(get(row, 'Cash Balance ($)')),
      settlementDate: isoFromAny(get(row, 'Settlement Date')),
      // Dedup-invariant tagging: see top-of-file doc and RETIREMENT_ROLLUP.md.
      // TRANSFER rows duplicate 401k Ledger Exchange In/Out (flowKind: 'INTRA');
      // the rollup must drop one side. INTERNAL rows (BUY/SELL/REINVEST/etc.)
      // are local fund-level activity that doesn't cross account boundaries.
      flowKind: classifiedAction === 'TRANSFER' ? 'TRANSFER' : 'INTERNAL',
    });
  }
  return out;
}

// Walk transactions for one symbol and produce:
//   - shareDelta: net shares added (BUY/REINVESTMENT/cap-gain reinvest +qty,
//     SELL -qty). Ignores TRANSFER/MERGER/REDEMPTION for the delta calculation.
//   - cashSpent: net cash that left the account on buys minus net cash that
//     came back on sells. REINVESTMENT and cap-gain reinvest don't count
//     toward cost basis here — the dividend itself was already income, and
//     Fidelity already rolled the reinvested shares into the average-cost
//     figure on the holdings table.
//   - caveats: human-readable warnings for tricky transaction types so the
//     UI can surface them next to the row.
function summarizeForOpeningLot(transactionsForSymbol) {
  let shareDelta = 0;
  let cashSpent = 0;
  let earliestDate = null;
  const caveats = new Set();

  for (const t of transactionsForSymbol) {
    if (t.runDate && (!earliestDate || t.runDate < earliestDate)) {
      earliestDate = t.runDate;
    }
    const q = t.quantity || 0;
    const amt = t.amount || 0;
    switch (t.classifiedAction) {
      case 'BUY':
        shareDelta += q;
        // Buy amount is negative (cash leaving). cashSpent grows by |amount|.
        cashSpent += -amt;
        break;
      case 'SELL':
        // SELL quantity is already negative in the data.
        shareDelta += q;
        // Sell amount is positive (cash returning). Subtract from cashSpent.
        cashSpent += -amt;
        break;
      case 'REINVESTMENT':
      case 'LT_CAP_GAIN':
      case 'ST_CAP_GAIN':
        // Reinvestments and cap-gain reinvestments add shares but don't
        // increase cost basis here — Fidelity's averageCost already reflects
        // the reinvested basis.
        if (q && q !== 0) shareDelta += q;
        break;
      case 'DIVIDEND':
        // Cash dividend, no share movement (or a paired reinvestment row
        // captures the shares separately).
        break;
      case 'TRANSFER':
        caveats.add('Includes a transfer in/out of the account — opening-lot reconstruction may be off');
        break;
      case 'MERGER':
        caveats.add('Fund underwent a merger or reorg — share count and cost basis may be approximate');
        // Merger rows do move shares; include them in the delta so the
        // reconstruction at least balances against current holdings.
        shareDelta += q;
        break;
      case 'REDEMPTION':
        caveats.add('Includes a fund redemption — opening-lot reconstruction may be off');
        shareDelta += q;
        break;
      default:
        break;
    }
  }
  return { shareDelta, cashSpent, earliestDate, caveats: [...caveats] };
}

function parseSheet(spreadsheetPath) {
  const wb = XLSX.readFile(spreadsheetPath, { cellDates: false });
  const ws = wb.Sheets['BrokerageLink'];
  if (!ws) {
    return { error: 'no-tab', availableTabs: wb.SheetNames };
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const lastUpdatedDate = findLastUpdatedDate(rows);
  const txnHeaderIdx = findTransactionHeader(rows);

  const rawHoldings = parseHoldingsTable(rows);
  const transactions = txnHeaderIdx >= 0 ? parseTransactions(rows, txnHeaderIdx) : [];

  // Group transactions by symbol for opening-lot reconstruction.
  const txnsBySymbol = new Map();
  for (const t of transactions) {
    if (!t.symbol) continue;
    if (!txnsBySymbol.has(t.symbol)) txnsBySymbol.set(t.symbol, []);
    txnsBySymbol.get(t.symbol).push(t);
  }

  const holdings = rawHoldings.map(h => {
    // FDRXX is the cash sweep — strip the trailing ** if present and short-
    // circuit to a cash-only record.
    const cleanSymbol = h.symbol.replace(/\*+$/, '');
    if (cleanSymbol === CASH_SYMBOL) {
      return {
        symbol: CASH_SYMBOL,
        description: h.description,
        accountNumber: h.accountNumber,
        accountName: h.accountName,
        isCash: true,
        currentValue: h.currentValue,
      };
    }

    const symbolTxns = txnsBySymbol.get(cleanSymbol) || txnsBySymbol.get(h.symbol) || [];
    const summary = summarizeForOpeningLot(symbolTxns);

    let openingLot = null;
    if (h.quantity != null && h.costBasisTotal != null) {
      const openingShares = h.quantity - summary.shareDelta;
      const openingCost = h.costBasisTotal - summary.cashSpent;
      // Anchor the synthetic opening lot to the day before the earliest
      // observed transaction (so any chart from openingLot.anchorDate
      // forward sits cleanly before the first real movement).
      const anchorDate = summary.earliestDate
        ? dayBefore(summary.earliestDate)
        : PRE_HISTORY_FALLBACK_DATE;

      // Only include the opening lot if it actually represents pre-history
      // shares. A near-zero opening means the user opened the fund inside
      // the visible window — no synthesis needed.
      const meaningfulShares = Math.abs(openingShares) > 1e-3;
      if (meaningfulShares) {
        openingLot = {
          shares: Number(openingShares.toFixed(6)),
          costBasis: Number(openingCost.toFixed(2)),
          anchorDate,
          synthetic: true,
          note: 'Reconstructed from current holdings minus 2021+ transactions; pre-2021 history is not in the spreadsheet.',
        };
      }
    }

    const caveats = [...summary.caveats];
    if (openingLot) {
      caveats.unshift('Includes pre-2021 reconstructed cost');
    }

    return {
      symbol: cleanSymbol,
      description: h.description,
      accountNumber: h.accountNumber,
      accountName: h.accountName,
      isCash: false,
      quantity: h.quantity,
      lastPrice: h.lastPrice,
      currentValue: h.currentValue,
      averageCost: h.averageCost,
      costBasisTotal: h.costBasisTotal,
      totalGainLossDollar: h.totalGainLossDollar,
      totalGainLossPercent: h.totalGainLossPercent,
      todayGainLossDollar: h.todayGainLossDollar,
      todayGainLossPercent: h.todayGainLossPercent,
      percentOfAccount: h.percentOfAccount,
      openingLot,
      caveats,
    };
  });

  return {
    asOfDate: lastUpdatedDate || new Date().toISOString().slice(0, 10),
    accountNumber: BROKERAGE_LINK_ACCOUNT_NUMBER,
    holdings,
    transactions,
  };
}

router.get('/', async (_req, res) => {
  const sheet = resolveSpreadsheet();
  if (!sheet) return res.status(404).json(noProfileResponse());
  try {
    const data = parseSheet(sheet.path);
    if (data && data.error === 'no-tab') {
      return res.status(404).json({
        error: `No BrokerageLink tab found in ${sheet.isTemplate ? 'the template' : 'your spreadsheet'}.`,
        availableTabs: data.availableTabs,
        spreadsheetPath: sheet.path,
        isTemplate: !!sheet.isTemplate,
      });
    }
    res.json({ ...data, isTemplate: !!sheet.isTemplate });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
