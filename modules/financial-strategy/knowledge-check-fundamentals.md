---
module: financial-strategy
check_tier: fundamentals
check_type: three_part_conversation
estimated_total_minutes: 100
parts:
  - file: parts/part-1-getting-to-know-you.md
    role: assessment
    session_minutes: 25
  - file: parts/part-2-walkthrough.md
    role: teaching
    session_minutes: 35
  - file: parts/part-3-goal-setting.md
    role: goal_setting
    session_minutes: 40
outputs:
  - user-profiles/[userid]/competency.md
  - user-profiles/[userid]/goals.md
  - user-profiles/[userid]/journal.md
prerequisites: []
canonical_reference: frameworks/financial-order-of-operations.md
revisit_cadence: quarterly
is_north_star: true
---

# Financial Strategy — Fundamentals Knowledge Check

*Not a test. Not a quiz. A three-part conversation that produces the foundation every other module reads from.*

---

## Role in the system

This is the **north-star check**. Every other module's knowledge check sits on top of this one. The output of this check — a completed `competency.md` and `goals.md` — is what future Coach sessions read to know who they're talking to and what matters to them.

If this check has never been run for a user, nothing else should run first. Other modules can assume it exists as soon as Part 1 is complete (partial profile is better than no profile), but the full value compounds with all three parts done.

---

## The three-part structure

### Why three sessions, not one

A single 90-minute session has the wrong shape for this material. Three sessions allow:

- **Space between assessment and teaching.** The user's mental model is different before and after Part 2. Goals set in a single session conflate "what I know now" with "what I knew going in."
- **Opt-out at natural break points.** The user can stop after Part 1 (with a profile) or Part 2 (with a profile and a framework in hand) and come back. The work isn't wasted.
- **State persistence in between.** The competency file and journal entries keep the Coach current without requiring the user to re-explain themselves each time.

### How they compose

```
Part 1 ──▶ competency.md (foo_assessment + life_context)
              │
              ▼
Part 2 ──▶ competency.md (refined foo_assessment + goal_seeds)
              │
              ▼
Part 3 ──▶ goals.md (active + deferred + skipped)
           competency.md (goal_seeds cleared, timestamp updated)
```

Every part appends to `journal.md`.

### How to decide when to split vs. combine sessions

| Scenario | Recommendation |
|---|---|
| User has 20–30 minutes only | Run Part 1, stop, offer Part 2 on next session. |
| User has 45–60 minutes and is engaged | Run Part 1 + Part 2 back-to-back with a 2-minute break. Save Part 3 for a separate session. |
| User has 90+ minutes and wants to push through | All three can run same-day. Schedule a stretch / water break between each. Watch for fatigue — cut short if needed. |
| User returns after a gap of 2+ weeks between parts | Read prior journal entries aloud as a bridge. Re-confirm signals before proceeding. |
| User returns after a gap of 3+ months | Treat as a full quarterly check-in, not a continuation. Re-run Part 1 briefly to catch life changes. |

---

## Coach orchestration

### Opening the check (regardless of which part)

Always pull state first:

1. Read `user-profiles/[userid]/competency.md`. If it doesn't exist, this is a Part 1 session.
2. Read the most recent entries in `user-profiles/[userid]/journal.md` (last 2–3 sessions).
3. Look at `last_updated` on competency.md.
   - If the most recent update was less than 7 days ago, acknowledge the recency briefly.
   - If older than 30 days, note the gap and ask if anything has changed before proceeding.
   - If older than 90 days, this is a quarterly check-in — pivot to the quarterly review template.

### Routing to the right part

```
competency.md missing or empty
  → Part 1 (Getting to know each other)

competency.md has life_context + foo_assessment, but no goal_seeds
  → Part 2 (Walkthrough)

competency.md has goal_seeds populated
  → Part 3 (Goal setting)

goals.md exists, last_updated > 90 days ago
  → Quarterly review (see quarterly-review-template.md)

goals.md exists, last_updated < 90 days ago
  → Not a knowledge check session. Route to module-level work on an active goal.
```

### Closing the check (after Part 3)

When all three parts are complete:

- Confirm the user has a populated `goals.md` with 3–5 active goals, deferred goals with triggers, and skipped steps with reasoning.
- Set the quarterly review date and tell the user.
- Offer to dive into a specific active goal now, or to end the session.

---

## What "fundamentals" means for this module

Unlike other modules where "fundamentals" is a specific knowledge tier with a passing threshold, **Financial Strategy fundamentals is binary: the check is complete when all three parts have run, the profile is written, and the goals are set.**

There is no "passing score." The check produces a profile that accurately reflects where the user is — regardless of whether that's `emerging` on every step or `mastery` on most. Honest placement is the entire point.

A user with `comfort: emerging` across all 14 steps and one active goal has completed fundamentals. A user with `comfort: mastery` across all 14 steps and five active goals has also completed fundamentals. Both are ready for module-level work.

---

## Links

- [`frameworks/financial-order-of-operations.md`](frameworks/financial-order-of-operations.md) — canonical 14-step reference
- [`parts/part-1-getting-to-know-you.md`](parts/part-1-getting-to-know-you.md) — conversational assessment
- [`parts/part-2-walkthrough.md`](parts/part-2-walkthrough.md) — personalized framework walkthrough
- [`parts/part-3-goal-setting.md`](parts/part-3-goal-setting.md) — per-step goal setting

---

*Last updated: 2026-04-19 (initial orchestrator)*
