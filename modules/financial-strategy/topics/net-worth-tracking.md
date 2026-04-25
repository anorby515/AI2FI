---
module: financial-strategy
sub_topic: net-worth-tracking
foo_step: 1
status: active
last_updated: 2026-04-25
memory_file: user-profiles/<name>/modules/financial-strategy/memory.md
canonical_reference: modules/financial-strategy/frameworks/financial-order-of-operations.md
---

# Net Worth Tracking

*The first sub-topic inside Financial Strategy. Maps to FOO step 1 — Track Income, Expenses, & Net Worth. Net worth is the headline number; expenses and income roll up into the High Level Budget sub-topic.*

---

## What this sub-topic establishes

The user can answer three questions without guessing:

1. **What do I own?** Cash, investment accounts, retirement balances, real estate equity, vehicles, anything else of meaningful value.
2. **What do I owe?** Mortgage, student loans, auto loans, credit cards, medical debt, anything else owed.
3. **What's the difference?** Assets minus liabilities. That's net worth.

Knowing this number — and watching it move — is the precondition for every other FOO step. You cannot decide where the next dollar goes if you don't know where the existing dollars are.

---

## Why it leads Financial Strategy

The Financial Order of Operations puts tracking at step 1 because every downstream decision — insurance sizing, emergency fund target, debt payoff strategy, retirement contribution rate, mortgage paydown vs. invest — depends on knowing the present-day balance sheet. A user who hasn't done this work isn't behind; they're just not yet in a position to make informed sequencing decisions.

This sub-topic is also the **bridge to the dashboard.** The numbers the user enters into `Finances.xlsx` here are what the local web dashboard renders. Without net worth tracking, the dashboard has nothing to show.

---

## What "tracking" actually means

Three components, all required:

### Assets

Anything you own that has meaningful value and could, in principle, be liquidated.

- **Liquid:** checking, savings, money-market, HYSA, CDs near maturity
- **Investments:** taxable brokerage, retirement (401k, IRA, Roth IRA), HSA balance, 529 / Coverdell, crypto
- **Real assets:** primary residence, second properties, vehicles (if material), collectibles (if material)
- **Receivables:** money owed to you that is realistically collectible

Skip anything trivial. The point is to capture decisions, not to balance to the penny.

### Liabilities

Anything you owe.

- **Secured:** mortgage, HELOC, auto loans
- **Unsecured:** credit card balances (current statement), personal loans, student loans, medical debt
- **Other:** taxes owed, money you've borrowed informally and intend to repay

### Equity (net worth)

Assets minus liabilities. Update at the same cadence each month so deltas are meaningful.

---

## Cadence

| Cadence | Who it's for | Notes |
|---|---|---|
| **Monthly** *(recommended)* | Most users | Same date each month. 15–20 minutes. |
| **Quarterly** *(minimum)* | Users with very stable balances and high tolerance for fuzz | Risks missing fast-moving life changes. |
| **Weekly** | Almost no one | Over-precision; high noise relative to signal. Discourage unless they're paying off high-interest debt and want momentum. |

The cadence the user *will actually keep* beats the cadence that's theoretically optimal. Default to monthly; let them tell you otherwise.

---

## How the Coach engages this sub-topic

### When to bring it up

- **Always in Part 3 goal-setting** for FOO step 1.
- **Whenever a downstream goal depends on a number the user can't produce.** ("What's your current liquid?" → "I'm not sure" → this sub-topic surfaces.)
- **At the close of the boot experience** if the user is moving toward dashboard build-out and has no balance sheet yet.

### What to ask, in order

1. "Do you have a current view of your net worth — what you own minus what you owe?"
2. If yes: "How often do you update it, and where does it live?"
3. If no: "Would you like to put one together? It's the input every other step uses."

Read the answers as signal:
- **Has a system, updates regularly** → `comfort: confident` or `mastery`. Move on. Set a quarterly revisit, not a build-out goal.
- **Has a system, hasn't updated in 6+ months** → `comfort: comfortable`, `current_state: starting`. The system exists; the habit doesn't yet.
- **No system** → `comfort: emerging`, `current_state: not_yet`. This is the goal: build a first-pass net worth view this session or next.

### What to teach (only if asked or stuck)

The teaching is light. Three minutes, max. Cover:
- The three components (assets, liabilities, equity).
- The "skip the trivial" principle.
- The cadence default (monthly).

Then move into the doing. Most users don't need a lecture — they need a structure to fill in.

### Tie-in to `Finances.xlsx`

The user populates the **`Net Worth MoM`** sheet in `Finances.xlsx` — one column per month, with assets and liabilities rolled up to a net-worth row. The dashboard's `NetWorthView` reads this sheet directly via `/api/networth`.

Setup of the file is a separate, prior step (see `core/finances-template-setup.md`) — by the time this sub-topic is in scope, the user has already consented to the template and seen a walkthrough of the `Net Worth MoM` sheet. This sub-topic focuses on the substance of *what to track*, not on file mechanics.

If the user is not yet at the template-setup stage, capture the numbers in the conversation and tell them they'll be transferred into `Net Worth MoM` during the template setup session.

---

## Common traps

- **Tracking once, then stopping.** Visibility has to be ongoing. A six-month-old net worth is data; a six-month-old habit is a story.
- **Over-precision.** Categorizing every $4 charge to a coffee shop. Track at a useful level. The signal is in the deltas, not the decimals.
- **Including the house at Zestimate, not at conservative basis.** Volatile asset estimates create noise on the equity line. Pick a method (purchase price, last appraisal, conservative comp) and stick with it.
- **Excluding retirement balances because "it's not real money yet."** It's real. Include it.
- **Including cars at sticker.** Use a depreciated value (KBB private-party). For most users, the car line should shrink each year.
- **Treating credit card balance as "what shows on the app today."** Use the most recent statement balance, consistently. Daily fluctuation is noise.
- **Waiting until "things settle down."** They don't. Start with messy data; refine the picture over time.

---

## Readiness check / when complete

The user has:

- A defined list of accounts and liabilities, with a current value or balance for each.
- Those numbers entered in one place (the `Finances.xlsx` Net Worth tab once the dashboard exists; a captured note in the meantime).
- A monthly cadence on the calendar — same date each month.
- Stated a comfortable language for what counts as an asset vs. liability.

When all four are true, mark `current_state: active` in module memory. `complete` is reserved for users who have run the cadence consistently for 12+ months and demonstrated it survives life changes.

---

## What gets recorded in module memory

At session close, the Coach updates `user-profiles/<name>/modules/financial-strategy/memory.md` under `### net-worth-tracking`:

```yaml
### net-worth-tracking
- relevance: always
- current_state: <not_yet | starting | active | mostly_done | complete>
- comfort: <emerging | comfortable | confident | mastery>
- last_touched: YYYY-MM-DD
- next_action: <one-line concrete next step, or omit>
- revisit_date: <YYYY-MM-DD if a follow-up was scheduled>
- notes: |
    <One paragraph in the user's voice. What they have, what they don't,
    what they decided this session. Numbers belong in private/, not here.>
```

If a goal was committed in `goals.md` (e.g., "Set up monthly net-worth review by 2026-05-15"), reference it via `goal_ids: [<id>]`.

---

## Cross-references

- **Coaching script** — `modules/financial-strategy/coaching/net-worth-tracking.md`. The conversational walkthrough the Coach actually runs in real time.
- **FOO step 1** — `modules/financial-strategy/frameworks/financial-order-of-operations.md`
- **High Level Budget sub-topic** — captures income and expenses, the other half of FOO step 1. Net worth is the snapshot; the budget is the flow.
- **Template setup** — `core/finances-template-setup.md`. Must run before this sub-topic; the user populates the `Net Worth MoM` sheet there.
