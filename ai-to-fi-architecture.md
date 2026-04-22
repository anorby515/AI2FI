# AI2FI — System Architecture

*Financial intelligence coaching platform — structure, skills, and content architecture*

---

## Core Philosophy

**Democratize financial intelligence** through AI-powered coaching that meets users where they are, scaffolds their learning progressively, and grows with them over months and years. The system is built on three pillars:

1. **Atomic, composable content** (modular MD files)
2. **Intelligent orchestration** (Skills that route users based on need)
3. **Longitudinal relationship** (journaling, knowledge checks, accountability)

---

## Two-Surface Design

| Surface | Purpose | Where |
|---|---|---|
| **Claude (Cowork/Chat)** | Coaching, conversation, check-ins, journaling, knowledge checks | User's preferred Claude interface |
| **Web Dashboard** | Read-only visualization: goals, progress, history, net worth trends, session summaries | Browser-based |

**Rule of thumb**: Claude is for *thinking*. The web is for *seeing*. Never force users to install a native app.

Future enhancement: calendar integrations + smart reminders to trigger quarterly check-ins and nudge return engagement.

---

## File Architecture

### Directory Structure (Module-Encapsulated)

Each module is its own directory containing all related files — curriculum, knowledge checks at each tier, supporting frameworks, scenarios, and metadata. This keeps cohesive content together, makes modules portable as a unit, and keeps the Skill orchestration logic clean ("load everything from modules/investing/" rather than pattern-matching filenames).

```
ai-to-fi/
├── core/
│   ├── master-financial-order-of-operations.md   # North star — routes users
│   ├── master-assessment.md                      # Two-pass diagnostic
│   └── temperament-tracker.md                    # Longitudinal behavior patterns
│
├── modules/
│   ├── financial-strategy/                       # Overarching, quarterly module
│   │   ├── curriculum.md
│   │   ├── knowledge-check-fundamentals.md
│   │   ├── quarterly-review-template.md
│   │   └── metadata.md
│   │
│   ├── investing/
│   │   ├── curriculum.md
│   │   ├── knowledge-check-fundamentals.md
│   │   ├── knowledge-check-intermediate.md
│   │   ├── knowledge-check-advanced.md
│   │   ├── moat-analysis-framework.md
│   │   ├── scenarios/
│   │   │   ├── tax-loss-harvesting.md
│   │   │   ├── charitable-stock-rollover.md
│   │   │   └── concentrated-position.md
│   │   └── metadata.md
│   │
│   ├── savings/
│   │   ├── curriculum.md
│   │   ├── knowledge-check-fundamentals.md
│   │   └── metadata.md
│   │
│   ├── retirement/
│   ├── mortgage/
│   ├── college-savings/
│   ├── tax-planning/
│   └── charitable-giving/
│
├── skills/
│   ├── financial-check-in/SKILL.md               # Master orchestrator
│   ├── module-coach/SKILL.md                     # Dives into a specific module
│   └── knowledge-check/SKILL.md                  # Runs tiered assessments
│
└── user-profiles/
    └── [userid]/
        ├── journal.md                            # Session history, narrative
        ├── goals.md                              # Active goals + revision log
        └── competency.md                         # Per-topic comfort levels
```

### Why Encapsulate Each Module

- **Cohesion** — curriculum, quizzes, scenarios, and frameworks for one topic live together
- **Portability** — hand off or version "the investing module" as a single folder
- **Cleaner Skill logic** — load by directory, not by filename pattern
- **Room to grow** — add scenarios/, examples/, edge-cases/ subfolders without cluttering the root
- **Per-user encapsulation too** — each user's journal, goals, and competency tracking bundled together as their relationship with the system grows

### The `metadata.md` File (Per Module)

A small file in each module folder that tells the Skill what it needs to know:

```yaml
module: investing
title: Investing Strategies
prerequisites: [savings, financial-strategy]
estimated_session_minutes: 20
tiers: [fundamentals, intermediate, advanced]
last_updated: 2026-04-18
revisit_cadence: quarterly
```

This unlocks smarter orchestration without bloating filenames or skill code.

### Why Atomic MD Files (Within a Module)

**Split a curriculum file into multiple files when:**
- Content hits ~2,000–3,000 words
- Distinct decision trees that don't overlap (e.g., savings ≠ investing — different mental models)
- Tax mechanics, time horizons, or emotional framing diverge
- You want to version/update one sub-topic without touching others

**Keep together when:**
- Content is <1,500 words and has one coherent arc
- Concepts are tightly interdependent

---

## The Master Scaffolding File

**`core/master-financial-order-of-operations.md`** is the conductor. It:

- Maps the user's current financial life state
- Applies the 14-step Financial Order of Operations framework
- Identifies which module the user should tackle next
- Tells the coaching Skill which atomic file to load
- Defines the sequence and dependencies between modules

This file is the brain that decides "based on where this user is, go here next."

---

## The Skill Layer

### Primary Skill: `/financial-check-in`

The meta-coach. Every session starts here. It:

1. Loads the user's profile and journal
2. Runs the master assessment (two-pass diagnostic)
3. Consults the master financial-order-of-operations
4. Routes the user to the right module
5. Updates the journal with session notes

### Secondary Skill: `/module-coach [module-name]`

Dives deep into one curriculum file. It:

1. Runs the relevant knowledge check (gated entry)
2. Based on score, scaffolds prerequisites or proceeds
3. Walks through the module conversationally
4. Captures comfort level and open questions
5. Logs progress back to the user profile

### Tertiary Skill: `/knowledge-check [topic] [level]`

Standalone quiz runner. Can be invoked directly or by other skills. Supports tiered assessments (fundamentals → intermediate → advanced).

---

## The Assessment Layer

### Two-Pass Master Assessment

**Pass 1 — Lightweight (every session):**
- What's changed since we last talked?
- How confident do you feel about [top priority] right now?
- Any life events we should factor in? (job, kids, marriage, move, inheritance)

**Pass 2 — Deeper (quarterly or triggered):**
- Where did your actual strategy diverge from what you intended — and why?
- What's the single biggest friction point in your financial life right now?
- Which module from last quarter stuck — and which didn't?

This distinguishes **knowledge gaps** from **execution gaps** — different problems, different fixes.

### Tiered Knowledge Checks (Gated Entry)

Each module has 3 tiers. Users must pass the lower tier to unlock the next.

**Example — Investing:**

| Tier | Topics |
|---|---|
| Fundamentals | Capital gains, cost basis, short vs. long holding, dividends, index vs. active |
| Intermediate | Tax-loss harvesting, wash sales, concentrated positions, asset allocation |
| Advanced | Options, short selling, derivatives, moat analysis, charitable stock rollovers |

Knowledge checks also feed **retention tracking** — "did they remember this from last quarter?"

### Longitudinal Temperament Tracker

Not just *what* they know — *how* they behave. Track over time:
- Risk tolerance drift
- Reaction to market volatility
- Decision-making style (analytical vs. gut)
- Follow-through on stated intentions

---

## The User Profile & Journaling Layer

Per-user markdown file that stores:

- **Goals** (financial strategy module, revisited quarterly)
- **Competency levels** per topic (emerging / comfortable / confident / mastery)
- **Session history** (what was covered, what stuck, what didn't)
- **Life context** (dependents, income trajectory, time horizon)
- **Open questions** (things to revisit)
- **Progress narrative** (qualitative: "Last month you weren't sure about cost basis — this month you explained it back clearly. That's progress.")

The journal is the **memory of the relationship**. It's what makes the system feel personal rather than transactional.

---

## Gamification Without Gamification

**Reject:** points, badges, leaderboards, streaks-as-pressure.

**Embrace:**
- **Recognition over scoring** — "Three months ago, you couldn't explain a wash sale. Today you taught it back to me."
- **Comfort scale** — emerging / comfortable / confident / mastery
- **Proactive nudges** — "Rates shifted and you haven't revisited your mortgage strategy in six months. Want to take another look?"
- **Journey reflection** — the system surfaces *their* story back to them

This creates intrinsic motivation instead of dopamine chasing.

---

## The Financial Strategy Module (North Star)

This is the module users revisit **quarterly**. It's where:

- Goals are set
- Accountability lives
- Revisions happen (raise goals, lower goals, change direction based on life)
- The user gets their bird's-eye view before diving into tactics

Every other module feeds *into* the financial strategy module. It's the context that makes everything else meaningful.

**Quarterly rhythm:**

1. User triggers `/financial-check-in`
2. System pulls prior strategy statement
3. Runs Pass 1 assessment (lightweight)
4. Surfaces: on track? off track? circumstances changed?
5. Routes to modules that need attention
6. Updates strategy statement if needed
7. Logs everything to journal

---

## Monetization Paths (Ranked by Fit)

### Primary: Platform-as-Credibility
- Free tier + Pro tier (advanced modules, personalized AI coaching, longitudinal tracking)
- Platform builds audience, authority, and case studies
- Monetize the *audience* through:
  - Paid masterclasses & cohort courses
  - Premium seminars (Faraldi-style: $100–$1,000 per class)
  - Speaking engagements
  - Book(s)

### Secondary: Curated Affiliate (Authenticity Critical)
- **Only** recommend products that directly solve what they just learned
- Vetted partner ecosystem (brokers, tax software, insurance, robo-advisors)
- Contextual, never intrusive
- **Explicitly avoid** the TurboTax/Credit Karma upsell pattern — that kills trust

### Tertiary: Open-Source Core + Paid Experience
- Core curriculum and frameworks freely available (Wikipedia-style)
- Paid tier = the integrated AI coaching, journaling, accountability, progress tracking
- Optional donation mechanism for free users who want to contribute
- Governance model similar to Linux/Red Hat: free code, paid services

### De-prioritize: Corporate Wellness & Personal Data Monetization
- **Corporate:** Easy to replicate, not a durable moat — keep as inbound-only offering
- **Data:** Hard no on personal financial data. If you ever go aggregate, only with explicitly volunteered qualitative signals (confidence ratings, module preferences) — never numbers, balances, or identifying info

---

## Build Sequence (Suggested)

1. **Write the master file** (`core/master-financial-order-of-operations.md`)
2. **Build ONE module folder end-to-end** (`modules/investing/` — curriculum + fundamentals quiz + metadata) — your existing expertise makes this the natural first one
3. **Write the master assessment** (`core/master-assessment.md` — two-pass)
4. **Write the `/financial-check-in` skill** that ties them together
5. **Test end-to-end** with yourself as user zero
6. **Build the web dashboard** as a read-only view of the journal
7. **Add one module folder at a time** — savings, retirement, mortgage, etc.
8. **Layer in calendar integration** and reminders after core loop works

---

## Open Questions to Revisit

- Calendar integrations & reminder system — which platforms first?
- Web dashboard stack — keep current browser-based approach, validated
- Prototype the interactive markdown quiz UX (see companion file: `investing-fundamentals-quiz.md`)
- Define exact 14-step Financial Order of Operations content
- Determine pricing for Pro tier
- Define qualitative signals worth collecting for aggregate research (if ever)

---

*Last updated: April 18, 2026*
