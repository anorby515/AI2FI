# Financial Template

This directory holds the committed `Financial Template.xlsx` — the structural starting point for every user's local `Finances.xlsx` working file.

## Role

The template is **not** auto-copied into a user profile at install. The Coach asks for consent during the Module Build Out flow, explains the privacy posture (local, gitignored), and only on a yes does it copy the template into the user's profile. The full procedure lives in `core/finances-template-setup.md`.

## Sheets

- **`Accounts`** — lookup table mapping account identifiers to account type and owner. Used by the Brokerage Ledger and the dashboard to enrich row-level data.
- **`Brokerage Ledger`** — headers in row 2, one row per tax lot. Columns: Symbol, Transaction, Shares Bought, Cost Basis Per Share, Date Acquired, Owner, Account, etc. Used by the investing module / dashboard.
- **`Net Worth MoM`** — month-over-month net worth tracking. Dates across row 2 (column C onward), categories in rows 3–19 (debt, cash/savings/CD, brokerage, RSUs, retirement, assets, education, net worth, debt ratio). Read by `/api/networth` and rendered by the dashboard's `NetWorthView`.
- **`TICKERS`** — supporting reference data for the dashboard's investing views.

## How it lands in a profile

Driven by the Coach during a coaching session (see `core/finances-template-setup.md`):

1. `core/sample-data/Financial Template.xlsx` → `user-profiles/<name>/Financial Template.xlsx` (reference copy at the profile root, kept under that name so it's clearly not the live file)
2. `core/sample-data/Financial Template.xlsx` → `user-profiles/<name>/private/Finances.xlsx` (the live working file)

Both destinations are gitignored along with the rest of the user-profile directory.

## Updating the template

Binary file; changes land via normal commits. Keep it small (≤ 1 MB) and obviously demo — pruned from real data is fine, but scrub identifying details. No real account numbers, no real balances that look like a real bank statement.
