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
Once they've unzipped the folder, then the user will open Welcome-to-AI2FI.html to guide the user 

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
	- Emergency
	- Non-discretionary Savings
		- Health Savings Account
		- Planned Expenses
		- Unplanned Expenses
	- Debt Reduction
		- High Interest Debt
	- Discretionary Savings & Debt
		- Charitable Giving
		- Non-Mortgage Debts
		- Irregular Expense / Goals Funds (Travel, New Car, …)
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
- [ ] Welcome-to-AI2FI.html landing page (post-download entry point)

**Modules — build-out**
- [ ] Financial Strategy
	- [ ] Net Worth Tracking — reference content drafted (`topics/net-worth-tracking.md`); next: build the Net Worth Coaching script (conversational walkthrough — how to think about net worth, why to track it, what the elements are)
	- [ ] High Level Budget + Sankey viewer
- [ ] Savings & Debt Strategy *(module not yet created)*
	- [ ] Emergency
	- [ ] Non-discretionary Savings (HSA, Planned, Unplanned)
	- [ ] Debt Reduction (High-Interest)
	- [ ] Discretionary Savings & Debt (Charitable, Non-Mortgage Debts, Irregular/Goals, Mortgage Paydown)
	- [ ] Whatever You Want
- [ ] Investing *(partial — fundamentals KC exists, curriculum is a TODO outline)*
	- [ ] Retirement (401k, IRAs)
	- [ ] Education Accounts
	- [ ] Liquid Investing (Taxable Brokerage, Crypto)

**Cross-cutting / emergent**
- [ ] Reconcile `core/master-financial-order-of-operations.md` (TODO stub) with `modules/financial-strategy/frameworks/financial-order-of-operations.md` (canonical)
- [ ] Flesh out `core/master-assessment.md` (Pass-1/Pass-2 routing tree)
- [ ] Flesh out `core/temperament-tracker.md`
- [ ] Decide where cross-cutting topics live when they touch multiple modules (e.g., HSA: savings vs. investing)
	  