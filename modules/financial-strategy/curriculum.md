# Financial Strategy — Curriculum

> **Status:** Active. Unlike most modules, Financial Strategy's teaching content is delivered through the three-part knowledge check itself, not a separate curriculum. The check *is* the curriculum.

## Role in the system

This is the **north-star module**. Every other module — investing, tax planning, insurance, estate — feeds into the Financial Order of Operations framework taught here. Users revisit this module every quarter to take stock, revise goals, and re-sequence.

## Target outcomes (from fundamentals)

A user who completes the fundamentals tier can:

- **Name the 14 steps of the Financial Order of Operations**, in order, in their own words
- **Locate themselves on the framework** — which steps are behind them, which they're living in, which are over the horizon
- **Explain why the order is the order** — the return-per-dollar logic that sequences the steps
- **Set 3–5 active goals** tied to specific FOO steps, each with a concrete target, date, first action, and success signal
- **Identify their deferred goals** — what they want, what needs to be true first, when to revisit
- **Skip cleanly** — consciously rule out steps that don't apply, with reasoning captured for future-self

## Structure

This module does not follow the typical fundamentals/intermediate/advanced tier structure. Instead:

1. **Fundamentals (`knowledge-check-fundamentals.md`)** — a three-part conversational check producing the user's profile and goal set. Revisited quarterly.
2. **Reference (`frameworks/financial-order-of-operations.md`)** — the canonical 14-step document. Read by the Coach before every session in this module.
3. **Quarterly review (`quarterly-review-template.md`)** — a lighter-touch 25-minute revisit that re-examines goals, updates signals, and re-sequences without redoing the full three-part intake.

Tiered progression (intermediate, advanced) lives in the specialist modules that the Financial Order of Operations points to — they are not duplicated here.

## Teaching principles

Four principles anchor every session in this module:

**Relationships first, frameworks second.** Part 1 happens before Part 2 for a reason. The framework is only useful when the Coach knows who they're handing it to.

**Personalization over recitation.** The walkthrough (Part 2) adapts to what the assessment (Part 1) surfaced. A user fluent in tax-advantaged accounts should not sit through a generic HSA lecture.

**User authorship of goals.** The Coach sharpens, but does not draft. Every goal in `goals.md` is written in the user's language, not the framework's.

**Ordering is guidance, not a rule.** The FOO is the Coach's map. The user is the principal. When the user wants to violate the ordering, the Coach names the implication and lets the user decide.

## Tone

Warm, curious, never condescending. Plain language, jargon defined inline. Numbers are concrete (dollar amounts, dates, percentages) — never vague ("save more," "be better").

## What lives in this module

```
modules/financial-strategy/
├── metadata.md
├── curriculum.md                       ← you are here
├── knowledge-check-fundamentals.md     ← orchestrator for the three parts
├── quarterly-review-template.md        ← 90-day revisit
├── frameworks/
│   └── financial-order-of-operations.md
└── parts/
    ├── part-1-getting-to-know-you.md
    ├── part-2-walkthrough.md
    └── part-3-goal-setting.md
```

## What does NOT live in this module

- Deep content on specific vehicles (401(k), HSA, 529, etc.) — those live in dedicated modules and are surfaced when the FOO points to them.
- Investment strategy, asset allocation, rebalancing — those live in the investing module.
- Tax-loss harvesting, tax-efficient withdrawal — those live in tax-planning modules.
- Insurance shopping, policy selection — those live in the insurance module.

This module's job is to *point* users to those modules at the right time, not to duplicate their content.

## What a completed fundamentals check produces

Three files in `user-profiles/[userid]/`:

- **`competency.md`** — life context, per-step assessment (relevance × current state × comfort), followups list. Updated at every session.
- **`goals.md`** — 3–5 active goals, deferred goals with triggers, skipped steps with reasoning. Re-written each quarter.
- **`journal.md`** — appending record of every session. Written in the Coach's voice.

These three files are the `competency.md` pattern that other modules read before every session to know who they're working with.

---

*Last updated: 2026-04-19 (initial curriculum write-up)*
