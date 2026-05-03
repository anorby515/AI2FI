# Retirement Rollup Contract

This file is the source of truth for how to roll up the four Retirement
sub-pages (`IRAs`, `401k`, `BrokerageLink`, `Pension`) into the future
top-level Retirement page (forecast model). It exists so a future implementer
doesn't accidentally double-count dollars that appear in two ledgers.

The two parsers it governs:

- `four01k.js` — `/api/401k`
- `brokerage-link.js` — `/api/brokerage-link`

Both surface a `flowKind` field on every transaction. Use it; don't reinvent.

## The double-count risk

Money flows from the main 401k (account `89551`) into BrokerageLink (account
`652488644`) all the time. Each dollar shows up **twice**:

| Where | How it looks |
|---|---|
| `401k Ledger` | `Transaction Type = "Exchange Out"`, tagged `flowKind: 'INTRA'` |
| `BrokerageLink` ledger | `Action ~ "TRANSFERRED FROM"`, tagged `flowKind: 'TRANSFER'` |

A naïve `total = sum(401k transactions) + sum(brokeragelink transactions)`
double-counts every transferred dollar.

## Recommended rollup approach

**Default: roll up by current balance, not transaction flow.**

```
totalRetirement = Σ accounts.totalValue   # from /api/401k
                + holdings.currentValue   # from /api/brokerage-link
                + IRA holdings value      # from /api/portfolio (Retirement group, account != '401k')
                + pension value           # from /api/pension
```

This avoids the dedup problem entirely. Each sub-page computes its own
balance; the parent just sums.

## When you must sum flows (e.g. "money in vs money out over time")

Drop the duplicates explicitly:

| Source | flowKind | Action |
|---|---|---|
| 401k Ledger | `CONTRIBUTION` | Count as outside-money inflow |
| 401k Ledger | `INTRA` (Exchange In/Out) | **Drop** — sums to ~0 within 401k anyway, and the leg leaving to BrokerageLink is double-counted with the BrokerageLink TRANSFER row |
| 401k Ledger | `NAV_MARK` (Change In Market Value) | **Drop** — reconciliation marks, not flows |
| 401k Ledger | `FEE` | Count if you want fee tracking; don't count as flow |
| BrokerageLink | `TRANSFER` | **Drop** — already represented by the 401k Ledger Exchange Out side |
| BrokerageLink | `INTERNAL` (BUY/SELL/REINVEST/DIVIDEND/etc.) | These don't cross account boundaries; for "money in" tracking, dividends and reinvestments are not new outside money — they're already inside the account |

## Open questions for the future rollup

- **Is every BrokerageLink TRANSFER a 401k flow?** Empirically yes — the user
  said money flows in only via the main 401k. If they ever fund BrokerageLink
  from outside (e.g. an IRA rollover), this assumption breaks. Worth asking
  before building the forecast model.
- **Pension valuation.** The Pension parser (`pension.js`) returns options and
  scenarios, not a current balance. The rollup will need to pick a scenario
  (or compute lump-sum present value) before adding it to the total. That's a
  modeling choice, not a parsing choice.
- **Restoration 401k.** Account `35750` flows the same way as the main 401k
  (89551) — `Contributions` tagged correctly, no transfers to BrokerageLink
  observed. Treat identically.

## What you should NOT do

- Don't try to algorithmically match Exchange Out rows in the 401k Ledger to
  TRANSFERRED FROM rows in BrokerageLink by date+amount. The dates lag and the
  amounts don't always match exactly (Fidelity sometimes splits a transfer
  across days). The `flowKind` tags above are the right granularity for
  dedup; matching at the row level is fragile.
- Don't write to the xlsx in any rollup parser. All four sub-page parsers are
  read-only, and the rollup should be too.
