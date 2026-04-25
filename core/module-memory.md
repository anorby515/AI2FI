---
file: core/module-memory.md
status: design-draft
owner: AI2FI
last_updated: 2026-04-25
---

# Module Memory

How modules persist what they know about a user, session over session.

---

## Why this exists

Every module — Financial Strategy, Savings & Debt Strategy, Investing — generates observations as the Coach works through it. Without a defined place to put those observations, sessions either start cold or pollute a single profile-wide file. Module memory is the per-module record of what the Coach has learned and what's still open.

Modules are flat (`modules/<name>/`), but each module contains multiple sub-topics. Memory tracks state at the **sub-topic** level, because that's where the Coach's understanding actually lives.

---

## Where memory lives

```
user-profiles/<name>/
├── competency.md           ← cross-module summary (FOO-step level)
├── goals.md                ← active commitments
├── journal.md              ← session history (all modules)
├── financial-dashboard.md  ← rolling snapshot
└── modules/
    └── <module-name>/
        └── memory.md       ← per-module memory (this spec)
```

One `memory.md` per module the user has actually engaged with. Modules never touched have no folder.

The whole `modules/<name>/` tree under a user profile is gitignored along with the rest of `user-profiles/<name>/`. Only the example profile is committed.

---

## Relationship to other profile files

| File | Scope | What it answers |
|---|---|---|
| `competency.md` | cross-module | Where does the user sit on each FOO step? |
| `goals.md` | cross-module | What is the user actively working on? |
| `journal.md` | cross-module | What happened, in chronological order? |
| `modules/<m>/memory.md` | one module | What does this module specifically know about this user? |

Module memory is the detailed record. `competency.md` is a summary derived from across all module memories. The Coach writes both at session close: details into the relevant `modules/<m>/memory.md`, then a rolled-up line into `competency.md`.

---

## Schema

### Frontmatter (required)

```yaml
---
user_id: <slug>
module: <module-name>
last_updated: YYYY-MM-DD
sessions_in_module: <int>
---
```

### Body

One `## Sub-topics` section. Inside, one `### <sub-topic-slug>` heading per sub-topic the Coach has engaged. Each sub-topic block contains:

| Field | Values | Required |
|---|---|---|
| `relevance` | `always` \| `applicable` \| `not_applicable` | yes |
| `current_state` | `not_yet` \| `starting` \| `active` \| `mostly_done` \| `complete` | yes |
| `comfort` | `emerging` \| `comfortable` \| `confident` \| `mastery` | yes |
| `last_touched` | YYYY-MM-DD | yes |
| `notes` | free-text, in the user's voice where possible | yes |
| `goal_ids` | list of IDs from `goals.md` | optional |
| `next_action` | one-line concrete next step | optional |
| `revisit_date` | YYYY-MM-DD | optional |

### Example — `user-profiles/andrew/modules/financial-strategy/memory.md`

```markdown
---
user_id: andrew
module: financial-strategy
last_updated: 2026-04-25
sessions_in_module: 3
---

## Sub-topics

### net-worth-tracking
- relevance: always
- current_state: active
- comfort: confident
- last_touched: 2026-04-22
- goal_ids: [g-2026-q2-04]
- next_action: Add quarterly delta column to Finances.xlsx net-worth tab.
- notes: |
  Tracking monthly via Finances.xlsx since 2024. Comfortable with the
  delta view. Hasn't yet linked it to FOO step 1 milestone language.

### high-level-budget
- relevance: always
- current_state: starting
- comfort: emerging
- last_touched: 2026-04-25
- revisit_date: 2026-05-25
- notes: |
  No annual budget before this session. Drafted a first pass with the
  Coach. Wants to review in 30 days.
```

---

## Cross-cutting sub-topics

A sub-topic that semantically touches multiple modules (HSA touches savings, taxes, and investing) lives in **one** module's memory — the module that owns it per `core/onboarding-flow.md`. Other modules reference it; they do not maintain a parallel copy.

Rule: one source of truth per sub-topic. If genuinely co-owned, name the source-of-truth module explicitly in the sub-topic's content file, and have the other modules link to it.

---

## Read / write protocol

**At session start, the Coach:**
1. Reads `competency.md` for broad context.
2. If the session touches a specific module, reads that module's `memory.md`.
3. Reads the last 2–3 entries of `journal.md` for narrative continuity.

**At session close, the Coach:**
1. Updates the relevant `modules/<m>/memory.md` — bumps `last_updated`, increments `sessions_in_module`, and updates only the sub-topics actually discussed.
2. Reflects rolled-up changes (e.g., a step moving `starting` → `active`) into `competency.md`.
3. Appends an entry to `journal.md` covering what happened.

---

## What does NOT go in module memory

- **Active goals.** Live in `goals.md`. Memory references them by ID.
- **Session transcripts.** Summarize into `journal.md` instead.
- **Personal financial data.** Numbers from `Finances.xlsx`, account balances, etc. live in `private/`. Memory tracks *patterns* and *progress*, not raw figures.
- **Cross-module summaries.** Live in `competency.md`.

---

## Open items

- Whether `modules/<m>/memory.md` is created at first contact with the module, or only at first sub-topic engagement.
- Sub-topic identifier convention — slug (`net-worth-tracking`) is the default; revisit if disambiguation between modules becomes needed.
- Migration plan when a sub-topic moves between modules (rare but possible — needs a documented redirect).
- Whether `competency.md` should hold per-FOO-step rollups, per-module rollups, or both.
