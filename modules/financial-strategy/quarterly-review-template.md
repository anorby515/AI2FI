---
module: financial-strategy
template_type: quarterly_review
estimated_session_minutes: 25
triggered_by:
  - goals.md last_updated > 85 days
  - /financial-check-in command
  - user request
inputs:
  - user-profiles/[userid]/competency.md
  - user-profiles/[userid]/goals.md
  - user-profiles/[userid]/journal.md
outputs:
  - user-profiles/[userid]/goals.md (rewritten for new quarter)
  - user-profiles/[userid]/competency.md (refined foo_assessment)
  - user-profiles/[userid]/journal.md (new entry)
---

# Quarterly Review — Financial Strategy

*A lighter-touch 25-minute revisit. Not a re-run of the three-part intake. Looks backward at the quarter that just ended, then forward at the one coming up.*

---

## When this runs

- Every 90 days from the last goal-setting session.
- On user request ("let's check in on my goals").
- When a major life event has happened — income change, family change, health event — even if 90 days hasn't passed.

If more than 6 months have passed since the last goal-setting, treat it as a full three-part re-intake, not a quarterly review.

---

## Purpose

By the end of this session, the Coach should have:

1. **Closed out the quarter that just ended.** For each active goal: hit, partial, missed, or changed. With notes.
2. **Refined the profile.** Anything the quarter taught us about where the user really is on the FOO.
3. **Written new goals for the quarter ahead.** Still 3–5 active, same specificity rules as Part 3.
4. **Logged the retrospective.** So future-Coach can see the trajectory, not just the current state.

The user should finish feeling **accountable without being judged**, and **oriented** for what's next.

---

## Pre-flight

Before opening this session, the Coach MUST:

1. **Read `user-profiles/[userid]/goals.md`.** The entire file — active, deferred, skipped, with all their quarter-ago language.
2. **Read the last 3 entries in `journal.md`.** Especially any module-level sessions since the last quarterly.
3. **Read `competency.md`.** Note `last_updated`. If competency was never refined between the goal-setting and now, surface that — it likely means modules haven't been running, or the Coach hasn't been updating state.
4. **Pull any scheduled `followups`** — items the user asked to revisit.

---

## Instructions for the Coach

### Tone and posture

- **Neutral on outcomes.** A missed goal is data, not a moral failing. A hit goal is good but not the point. The point is the trajectory.
- **Short on recap, long on forward.** Don't spend 15 minutes reliving the quarter. Acknowledge, interpret, move on.
- **Notice what changed in the user's life.** If their situation shifted — new job, baby, move, health — that reshapes the FOO map. Surface it early.
- **Ask before rewriting.** Goals carry emotional weight. Don't demote or re-scope without the user's sign-off, even if the data says you should.

### Session shape

Four moves, in order:

1. **The retrospective** (~8 minutes) — walk each active goal, name the outcome, capture one sentence of context.
2. **The life-check** (~5 minutes) — has anything material changed?
3. **The forward pass** (~10 minutes) — write the new quarter's goals.
4. **Close** (~2 minutes) — schedule the next review, confirm what's going into the files.

---

## Move 1 — The retrospective

Walk each active goal from the outgoing quarter in order. For each:

> *"Goal [N] was: [headline in user's words]. Where did we land?"*

Four possible outcomes:

| Outcome | Definition | What to capture |
|---|---|---|
| **Hit** | Success signal was met by the target date | One-sentence note. *"Yes — Visa at zero as of March 12."* Celebrate briefly. |
| **Partial** | Progress made, but not to target | Distance from target + why. *"EF is at $8k of the $12k goal — underfunded because we prioritized debt."* |
| **Missed** | No meaningful movement | Honest reason. Not blame. *"Didn't increase 401(k) — job change paused the pay-period adjustment."* |
| **Changed** | The goal itself shifted during the quarter | Note what changed and why. *"Shifted from 'Coverdell for both kids' to '529 for older kid only' after tax analysis."* |

Write these outcomes into the journal entry (schema below). Don't assign blame. Don't editorialize. Just record.

**If a goal was Hit:** Note whether it "unblocks" a deferred goal. If yes, flag it for the forward pass.

**If a goal was Missed or Partial:** Ask — *"Is this still the right goal for the next quarter, or has something changed?"* The answer routes the forward pass.

---

## Move 2 — The life-check

Open-ended, but specific:

> *"Before we write the next quarter, has anything material changed in your life since we last talked? Work, family, health, a big expense, an opportunity — anything on the horizon that reshapes the picture?"*

Listen for:

- **Income shifts** — promotion, job loss, new side income, spouse's situation.
- **Family shifts** — new dependent, aging parent, death, divorce, marriage.
- **Health shifts** — diagnosis, procedure, insurance plan change.
- **Housing shifts** — move, refi, rate change, home purchase or sale.
- **Windfall or hit** — inheritance, bonus, lawsuit, unexpected expense.

Each of these can shift `foo_assessment` values (relevance, current state, comfort) or introduce new deferred goals. Update `competency.md` as the conversation surfaces things.

---

## Move 3 — The forward pass

Two starting points:

1. **Deferred goals that are now unblocked.** If an active goal from last quarter was hit and its success unlocks a deferred goal, surface it first.
   > *"You finished off the Visa. Last quarter you parked 'increase Roth contribution' waiting on that. Want to activate it this quarter?"*

2. **New seeds from the life-check.** If anything from Move 2 suggests a new direction, surface it.
   > *"You mentioned the mortgage refi closed at 4.25%. Given the rate tilt, does it make sense to rebalance toward 13b this quarter?"*

Then walk any remaining active goals that carried over (partial, changed, or still-wanted-missed) and decide: *keep as-is*, *sharpen*, or *demote to deferred*.

**The 3–5 active rule still holds.** If the list is pushing past 5, force a demote.

Write new active goals using the same four-criteria discipline from Part 3: specific outcome, target date, first action, success signal.

---

## Move 4 — Close

### Read the new list back

> *"Here's what you're carrying into next quarter:
> 1. [headline]
> 2. [headline]
> 3. [headline]
> And [N] deferred, [N] still skipped. Sound right?"*

Invite revision. Update.

### Schedule the next review

> *"I'll plan on checking back in around [date — 90 days out]. Same as before, earlier if anything material shifts."*

Then hand off to the cadence-reminders flow (see [`cadence-reminders.md`](cadence-reminders.md)) to put an actual reminder on the user's calendar. If they previously set a cadence preference (e.g., `reminder_preference: quarterly` in `goals.md`), confirm it's still right and update the event for the new quarter — don't re-ask from scratch.

If a calendar reminder is already scheduled (from last quarter or earlier), check that it's still valid and either update the existing event or create a new one, depending on which path (Google Calendar / .ics / copy-paste) was used last time.

### Write the files

- **Rewrite `goals.md`** for the new quarter. Move outgoing goals into an `archive` section at the bottom with their outcomes. Update the `reminder` frontmatter block with the new reminder details.
- **Update `competency.md`** with refined `foo_assessment` and updated `last_updated`.
- **Append to `journal.md`** using the schema below.
- **Write the shell reminder file** at `user-profiles/[userid]/reminders/[yyyy-mm-dd]-[cadence].md` as a backstop (see `cadence-reminders.md`).

---

## Output schemas

### `goals.md` — updates for the new quarter

Rewrite the frontmatter:

```yaml
---
user_id: [userid]
last_updated: YYYY-MM-DD
quarter: YYYY-Q[1-4]
active_goal_count: [number]
revisit_date: YYYY-MM-DD  # 90 days out

active_goals:
  # new quarter's active goals
  - id: g1
    step: [step]
    headline: "..."
    target: "..."
    target_date: "..."
    first_action: "..."
    success_signal: "..."

deferred_goals:
  # updated — remove any that activated, add any new ones
  - ...

skipped_steps:
  # usually unchanged from last quarter
  - ...

archive:
  - quarter: [previous quarter]
    goals:
      - id: g1
        headline: "..."
        outcome: hit | partial | missed | changed
        note: "[one sentence]"
      # ... all outgoing active goals ...
---
```

Rebuild the markdown body for the new quarter's narrative. Keep prior quarter archives at the bottom but don't expand them.

### `journal.md` — quarterly review entry

```markdown
## [Date] — Quarterly Review ([Quarter])

**What we covered:** Retrospective on the outgoing quarter's active goals, life-check, forward pass to set the new quarter's goals.

**Outgoing goals — outcomes:**

1. [Headline] — **[Hit / Partial / Missed / Changed]**: [one sentence]
2. [Headline] — ...
3. [Headline] — ...

**Life changes since last review:**

- [Change, if any]
- [Another, if any]
- [Or: "Nothing material — steady quarter."]

**Signals updated:** [Brief note on foo_assessment changes.]

**Incoming goals:**

1. [Headline]
2. [Headline]
3. [Headline]

**Deferred activated:** [Which deferred goals became active this quarter, if any.]

**Next review scheduled:** [Date, 90 days out.]
```

---

## Failure modes to watch for

| Mode | Symptom | Correction |
|---|---|---|
| **Over-auditing misses** | Coach dwelling on why a goal wasn't hit | Move on. One sentence per missed goal, max. |
| **Rewriting goals the user still wants** | Coach demoting a partial-hit goal without asking | Always ask. The user decides whether to keep, sharpen, or demote. |
| **Skipping the life-check** | Coach jumping from retrospective straight to forward pass | Don't. The life-check is often where the most useful information surfaces. |
| **Ignoring unlocked deferrals** | Coach writing net-new goals while deferrals from last quarter are ready to activate | Always check the deferred list before brainstorming new goals. |
| **Mission creep into teaching** | Coach re-explaining concepts from Part 2 | This is a check-in, not an intake. If the user needs re-teaching, schedule a separate session. |

---

*Last updated: 2026-04-19 (initial template)*
