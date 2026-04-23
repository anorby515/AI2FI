# Sample data for AI2FI

This directory holds a committed `Finances.xlsx` used to populate the dashboard for new users so the first-run experience shows a functional site instead of an empty state.

## Shape

- **`Brokerage Ledger`** sheet — headers in row 2, one row per tax lot. Columns: Symbol, Transaction, Shares Bought, Cost Basis Per Share, Date Acquired, Owner, Account, (etc.).
- **`Net Worth MoM`** sheet — dates across row 2 (column C onward), categories in rows 3–19 (debt, cash/savings/CD, brokerage, RSUs, retirement, assets, education, net worth, debt ratio).

## How it gets to the user

`dashboard/setup.command` copies `Finances.xlsx` from this folder into `user-profiles/<name>/private/` on first-run install if the user has no spreadsheet yet. It also writes a `.sample-data` marker in the profile folder, which the dashboard uses to default the sidebar to "Getting Started" and show a persistent banner reminding the user they're viewing demo data.

The marker (and optionally the sample xlsx) is torn down by the `/financial-check-in` skill at the close of Part 3 — once the user has committed to their own profile, they get their own data.

## Updating the sample

The sample xlsx is binary; changes land via normal commits. Keep the file small (≤ 1 MB) and obviously-fake — pruned from real data is fine, but scrub identifying details. No real account numbers, no real balances to a decimal that looks like someone's bank statement.
