---
file: core/onboarding-flow.md
status: design-draft
owner: AI2FI
last_updated: 2026-04-25
module_memory_file: core/module-memory.md
---

# Onboarding Flow

# Download & Install
The Onboarding starts with the user on the GitHub website downloading the files and folder.
Once they've unzipped the folder, the user opens `Start-Demo.html` for a no-install preview (right-click → Open `Start-Demo.command` to spin up the dev servers in demo mode). Users who want the full install — auto-start at login, profile pointed at their own `Finances.xlsx` — open `Install-AI2FI.html` instead.

# boot-experience.MD

 The next steps of using an AI tool of their choice to go through the coaching boot-experience to develop their financial strategy baseline and initial assessment of the user financial knowledge and competency.

Once that initial assessment is complete, then we want to walk the user through building out their own web app dashboard with their data input into the Finances.xlsx template.

The AI2FI Coach needs to nudge the user towards building it based on their financial strategy, and following the order of operations as the default build out.

# Module Build Out
The Module Build Out needs a memory system as it's being built. The spec for that lives in `core/module-memory.md`.

Modules are flat — each top-level item below is a module. The nested entries are *sub-topics* inside that module, not sub-modules. Sub-topics can cross modules; when they do, one module owns the content and the others reference it.

1. **Financial Strategy** *(module)*
	- Net Worth Tracking
	- High Level Budget (default is Annual)
		- Sankey diagram viewer
2. **Savings & Debt Strategy** *(module)*
	- Mortgage Paydown
	- Whatever You Want
3. **Investing** *(module)*
	- Retirement (401k, IRAs)
	- Education Accounts
	- Liquid Investing (Taxable Brokerage, Crypto)

# Tasks

Running list. Seeded from the flow above; add emergent items as they surface — order is not strictly linear.

**Foundation**
- [x] Boot experience design (`core/boot-experience.md`)
- [x] Onboarding flow (this file)
- [x] Module memory spec (`core/module-memory.md`)
- [x] Finances template setup procedure (`core/finances-template-setup.md`) — Coach-driven consent + copy to profile root + `private/`, plus walkthrough of `Net Worth MoM`, `Brokerage Ledger`, `Accounts`, `TICKERS`
- [x] Dashboard template-fallback pattern — `private/Finances.xlsx` first, fall back to `core/sample-data/Financial Template.xlsx`. Client banner + Getting Started default while reading the template; `/api/sync` refuses to run against it. Implemented in `server/profile-resolver.js → resolveSpreadsheet()`.
- [x] `Start-Demo.html` + `Start-Demo.command` (no-install preview, post-download entry point)
- [x] `Install-AI2FI.html` landing page (full install path)

**Dashboard surface**
- [x] Net Worth view: pie composition + 2x4 value grid layout (pie at 2x2 footprint, 8 value boxes 4x2 to its right). Uses Nocturne `Card` / `Stat` primitives + Recharts pie. `dashboard/client/src/components/NetWorthView.jsx`.
- [x] Sidebar restructured to match the FOO-aligned module hierarchy. Tree below in the *Modules — build-out* section is now the source of truth for both content and navigation. `dashboard/client/src/components/Sidebar.jsx`.
- [ ] **`GettingStarted` copy needs to be adaptive.** It's now always visible in the sidebar (not just when `isTemplate === true`), but the text still reads as if the user is on the demo template. Make the copy pivot when `isTemplate === false` so it doesn't lie to live users.
- [ ] **Decide what to do with implementations no longer reachable from the sidebar:** `Portfolio`, `Analysis`, `Moat Analysis`, `College Savings`, the old `Dashboard` parent. Code paths preserved in `App.jsx` but no nav button triggers them. Either delete cleanly or rewire under the new tree.

**Modules — build-out**

The current sidebar tree is the source of truth. Items checked are content-complete; items unchecked have no reference content yet.

- [ ] Financial Strategy
	- [x] **Net Worth** — complete. `topics/net-worth-tracking.md` (reference), `coaching/net-worth-tracking.md` (script). Two dog-food passes; "numbers belong in the file" privacy posture locked in. View ported to Nocturne primitives.
	- [ ] **Annual Budget** — was queued as "High Level Budget + Sankey viewer." Pattern: `topics/annual-budget.md` (reference) + `coaching/annual-budget.md` (script). Defer Sankey render until the data shape is settled.
	- 
- [ ] Cash & Debt 
	- [ ] Mortgage (FOO 13b)
	- [ ] Trade off Calculator
	- [ ] Education Savings (FOO 10)
	- [ ] Irregular Expenses / Goals (FOO 13c)
	- [ ] Whatever You Want (FOO 14)
- [ ] Retirement (401k, IRA) *(FOO 6, 9, 12 — pulled out as a top-level module in the new sidebar)*
- [ ] Investing (ETFs, Stocks, Crypto) *(FOO 13a — top-level. Existing `modules/investing/` has fundamentals KC and a curriculum TODO; needs reconciliation with the new top-level scope)*

**Cross-cutting / emergent**
- [ ] Wire `modules/financial-strategy/cadence-reminders.md` to actually fire — coaching scripts say "I'll remind you", but nothing currently does the reminding (surfaced during Net Worth dog-food).
- [ ] Generalize `skills/module-coach/SKILL.md` to dispatch sub-topic content (defer until at least one more sub-topic exists to test against).
- [ ] Reconcile `core/master-financial-order-of-operations.md` (TODO stub) with `modules/financial-strategy/frameworks/financial-order-of-operations.md` (canonical).
- [ ] Flesh out `core/master-assessment.md` (Pass-1/Pass-2 routing tree).
- [ ] Flesh out `core/temperament-tracker.md`.
- [ ] Decide where cross-cutting topics live when they touch multiple modules (e.g., HSA: Cash & Debt vs. Retirement; Education Savings vs. Investing).
- [ ] Reconcile the `# Module Build Out` scaffolding section above with the new flat-tree the sidebar uses. The two should agree — current sidebar tree is more current than the original scaffolding.
	  