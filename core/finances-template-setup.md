---
file: core/finances-template-setup.md
status: design-draft
owner: AI2FI
last_updated: 2026-04-25
related:
  - core/onboarding-flow.md
  - core/sample-data/README.md
  - modules/financial-strategy/topics/net-worth-tracking.md
---

# Finances Template Setup

The Coach-driven procedure for getting `Finances.xlsx` into a user's profile. This is the **first thing** that happens in the Module Build Out flow — before any sub-topic teaching begins, the Coach asks for consent and (on a yes) places the template.

---

## Why this exists

Three things happen here, in one short conversation:

1. **Consent.** The user is told what the spreadsheet is for, where it lives, and what privacy guarantees apply. They decide whether to opt in.
2. **Copy.** On consent, the Coach places two files: a reference template at the profile root and a live working file in `private/`.
3. **Coaching mode.** The Coach walks the user through how to use the template — what each tab is for, which one they actually populate, and how to keep it current.

Without this step, the user has no spreadsheet, the dashboard renders its empty state, and every downstream sub-topic (Net Worth Tracking, High Level Budget, Holdings, etc.) has nothing to anchor to.

---

## Step 1 — Consent

The Coach opens with a short, plain-language pitch. No jargon. No salesmanship.

### Suggested opener (adapt in voice)

> "Before we start working through your financial strategy, we need a place to keep your numbers. AI2FI uses a single local spreadsheet — `Finances.xlsx` — that lives on your machine, in your profile folder. Nothing leaves your machine. If you're using this from GitHub, the file is gitignored, so it never gets committed or pushed.
>
> Want to set that up now? It takes about a minute, and then we can start using it."

### What the user needs to hear, explicitly

- **Local.** The spreadsheet sits in `user-profiles/<your-name>/private/Finances.xlsx` on this computer. Nothing transmits.
- **Private.** The whole `user-profiles/<your-name>/` directory is gitignored. Even if they push to GitHub, it stays on their machine.
- **Theirs to leave.** They can stop using it any time — the file is theirs to keep, edit, or delete. No lock-in.

### If the user says no (or "not yet")

Honor it without friction. Tell them:

> "Totally fine. We can do everything in conversation for now. When you're ready, just say `set up my finances spreadsheet` and we'll come back here."

Then proceed with the rest of the session in a no-spreadsheet mode — most teaching content does not require the spreadsheet, only the dashboard rendering does.

Record the deferral in module memory under a sub-topic like `template-setup` so the next session knows where they left off.

### If the user says yes

Proceed to Step 2.

---

## Step 2 — Copy

Two file operations, both into the active user profile (resolved per `dashboard/server/profile-resolver.js` — env → `.ai2fi-config` → first non-`example` directory).

```
core/sample-data/Financial Template.xlsx
   ├──▶ user-profiles/<name>/Financial Template.xlsx     # reference copy at profile root
   └──▶ user-profiles/<name>/private/Finances.xlsx        # live working file
```

### Why two copies?

- **`Financial Template.xlsx` at the profile root** is a reference. Kept under that name on purpose — its name signals "this is not your live data." If the user ever corrupts their working file or wants to start a sub-section over, they can re-copy from this. Visible at the profile root so they can find it without going into `private/`.
- **`private/Finances.xlsx`** is the live working file. This is the only file the dashboard reads.

Both files are gitignored along with the rest of the user-profile directory.

### Procedure

The Coach should:

1. Confirm the active profile name (read `.ai2fi-config` or ask).
2. Ensure `user-profiles/<name>/` and `user-profiles/<name>/private/` exist; create them if missing.
3. Copy `core/sample-data/Financial Template.xlsx` to `user-profiles/<name>/Financial Template.xlsx`.
4. Copy `core/sample-data/Financial Template.xlsx` to `user-profiles/<name>/private/Finances.xlsx`.
5. Confirm both files now exist before moving to Step 3.

If the user already has `private/Finances.xlsx`, do not overwrite. Tell them and ask if they want to keep their existing file or replace it with a fresh template (the answer is almost always "keep").

---

## Step 3 — Coaching Mode (template walkthrough)

Once the files are in place, the Coach moves into a brief teaching pass on the template itself. Goal: by the end of three to five minutes, the user knows what each sheet is for and which one they actually edit.

### What to cover

The template has three sheets. The Coach explains them in this order:

**`Accounts` *(the only sheet the user edits)***

This is where the user lists their accounts. One row per account. The Coach walks through what to include:

- **What counts as an account.** Checking, savings, brokerage, retirement (401k, IRA, Roth IRA), HSA, 529, mortgage, auto loan, credit cards (current statement balance), other debt. Anything with a balance that meaningfully moves net worth.
- **What doesn't count.** Day-to-day cash on hand, anticipated future income, pending charges that will clear in days. Track at a useful level, not a perfect one.
- **What each row needs.** Account name, type, current balance, last-updated date.
- **Cadence.** Monthly is the default. Same date each month. The Coach sets a reminder via cadence-reminders.

**`Brokerage Ledger` *(supporting, not net-worth-relevant)***

Used by the investing module to track tax lots — one row per purchase. The Coach mentions it but defers the walkthrough to the investing module. If the user has no taxable brokerage activity, this sheet stays empty without consequence.

**`TICKERS` *(reference data, do not edit)***

Reference data the dashboard uses for symbol metadata. Surface it briefly so the user knows it's there, then move on. They should never need to touch it.

### Net Worth — handled at render time

There is intentionally no Net Worth sheet for the user to maintain. The dashboard aggregates net worth from the `Accounts` sheet at render time. The user updates one place; the dashboard handles the math.

If the user asks where they can see net worth: point them to the dashboard at `http://localhost:3001`.

### Memory write at end of Step 3

At session close (or end of this sub-topic), the Coach updates module memory under `### template-setup` in `user-profiles/<name>/modules/financial-strategy/memory.md`:

```yaml
### template-setup
- relevance: always
- current_state: <complete | starting | not_yet>
- comfort: <emerging | comfortable | confident | mastery>
- last_touched: YYYY-MM-DD
- notes: |
    User consented to template setup on YYYY-MM-DD. Template copied to
    profile root and private/. Walked through Accounts tab; user is
    ready to populate. (Or: deferred — revisit on next session.)
```

If they declined or deferred, set `current_state: not_yet` and capture the reason in notes.

---

## Cross-references

- Privacy posture: `CLAUDE.md` → "What is always gitignored"
- Profile resolution: `dashboard/server/profile-resolver.js`
- Net Worth Tracking sub-topic: `modules/financial-strategy/topics/net-worth-tracking.md`
- Onboarding tasks: `core/onboarding-flow.md` → Tasks
