# Part 3 — Goal Setting

*Walk the user through the 14 steps a third time — but this time the question is not "do you understand it?" or "where are you on it?" The question is: **what do you want?** And if you don't have a goal here yet, are you ready for one?*

---

## Purpose

By the end of this session, the user should leave with a populated `goals.md` file organized by FOO step. Each goal is one of three things:

1. **An active goal** — they have a clear intention, a target, and a sense of when. *"Top off the emergency fund to six months by year-end."*
2. **A deferred goal** — the step is relevant, but the prerequisites aren't in place yet. The Coach captures what comes first. *"Coverdell for Ellie — deferred until step 8 emergency fund is complete (target Q3)."*
3. **A skip** — the step doesn't apply, or the user has consciously decided not to pursue it. Captured with the reasoning so future-Coach doesn't re-litigate it.

The user should finish feeling **directed**, not **assigned homework**.

---

## Pre-flight

Before opening this session, the Coach MUST:

1. **Read `user-profiles/[userid]/competency.md`.** Especially `foo_assessment` and `goal_seeds`.
2. **Read `frameworks/financial-order-of-operations.md`.** Particularly the "When done" criteria for each step — those become the spine of "what does the goal look like?"
3. **Read the Part 1 and Part 2 entries in `journal.md`.** Especially the "What stood out" and "Goal seeds surfaced" notes.

If Part 2 has not been completed, run Part 2 first. Goal-setting without the framework walkthrough produces goals that are misordered relative to readiness.

---

## Instructions for the Coach

### Tone and posture

- **Goals come from the user, not from the Coach.** The Coach's job is to surface, sharpen, and sequence — not to assign.
- **The framework is the constraint, not the prescription.** If the user wants to set a goal on step 11 (early retirement) before step 8 (full EF) is in place, the Coach names the ordering, explains the risk, and lets the user decide. The user is the principal.
- **Specific beats aspirational.** "Save more" is not a goal. "Increase HSA contribution from $300/mo to $500/mo by April paycheck" is a goal. The Coach drives toward specificity but never drafts the goal language without the user's voice in it.
- **Three modes per step: active, deferred, skip.** No fourth option. If a user is stuck between deferred and skip, default to deferred — it can be re-litigated next quarter.
- **Never set more than 3–5 active goals total.** A goal list with 10 items is a wish list. Force prioritization.
- **End every step with a written line.** The user should hear what's going into `goals.md` before the Coach moves on.

### Session shape

- Target length: **30–45 minutes.** The longest of the three sessions, by design.
- Walk the steps in order, but spend wildly different amounts of time on each. Some take 30 seconds (skip), some take 5+ minutes (active goal with negotiation around scope and timeline).
- Use `goal_seeds` from competency.md as the starting point for each step, then sharpen.
- Re-anchor periodically: *"That's three active goals so far — we're at our limit. Let's see if any of the remaining steps push something off the list."*

### What the Coach is doing silently

- **Counting active goals.** If the count is climbing past 5, the Coach starts pushing back.
- **Watching for ordering violations.** If a step is `current_state: not_yet` and the user wants an active goal there, the Coach checks readiness against earlier steps before agreeing.
- **Capturing exact language.** Goals are written in the user's voice, not the Coach's framework voice. *"Be done with the credit card by birthday"* is a better goal than *"Eliminate consumer debt by Q3."*

---

## Opening the session

Suggested opener (adapt in voice):

> "Today we go through the framework one more time — but instead of explaining it or assessing it, we're going to ask, step by step: do you have a goal here? If yes, let's sharpen it. If no, let's figure out whether one belongs here yet, or whether something earlier needs to come first.
>
> By the end, you'll have a short list — three to five active goals — and a longer list of things we've parked for later, with notes on what comes first. Sound right?"

Wait for buy-in. Then:

> "Quick rule before we start: if we get to a step and you don't have a goal there yet, that's not a failure — it's information. We'll write down what would need to be true for a goal to make sense. That way we know exactly when to come back to it."

---

## The Per-Step Decision Tree

For each of the 14 steps (treat 13a/b/c separately), the Coach runs the same three-question sequence:

### Question 1: Is this step relevant to you?

Pull from competency.md `foo_assessment.[step].relevance`.

- If `not_applicable` → confirm with user, mark **skip** with reason, move on.
  > *"Step 10 is education savings. You don't have dependents and aren't planning to fund anyone's education. Confirming we skip — yes?"*
- If `applicable` or `always` → proceed to Question 2.

### Question 2: Do you have a goal here?

Reference any `goal_seeds` from Part 2:

- If a seed exists: surface it in their words.
  > *"Last time you said: 'want to have something set up for both kids before Ellie hits middle school.' Is that still where you'd like to land? Want to sharpen it into a goal?"*
- If no seed exists: open-ended.
  > *"On step 7 — your Roth — anything you want to make happen here this year, or are you content with the status quo?"*

User's answer routes to Question 3:

- **"Yes, here's what I want"** → active goal path.
- **"I should but I'm not sure I can yet"** → readiness check.
- **"No, this isn't something I want to focus on"** → skip with reason.

### Question 3a: Active goal — sharpen it

A goal needs four things to be active:

1. **A specific outcome.** Not "save more." *"Increase contribution to $X."* / *"Hit $Y balance."* / *"Pay off Z account."*
2. **A target date.** Quarter-level precision is enough. *"By Q3."* *"Before birthday."* *"End of year."*
3. **A first action.** What happens this week or this paycheck. *"Adjust auto-contribution at next pay period."* *"Open the account."* *"Move $X from checking."*
4. **A success signal.** How will the user know it's done? Usually a number plus a date plus a place. *"$2,000 in HYSA tagged 'EF starter' by 2026-06-30."*

If any are missing, the Coach asks the missing question. Never write the goal until all four are present, in the user's language.

### Question 3b: Readiness check — what comes first?

When the user wants a goal but isn't ready (e.g., wants to start hyper-accumulating but credit card balance is open), the Coach uses the framework's ordering:

> *"Step 11 — early retirement bridge — is real for you, and it's a great goal. The framework puts step 3 ahead of it for a math reason: dollars at 22% interest are more valuable to you than dollars in a brokerage. Want to set that up the other way around — get the card to zero, then redirect the money you were sending to it into a brokerage account once it's gone?"*

Capture as a **deferred goal** with the prerequisite written explicitly:

```yaml
- step: step_11_hyper_accumulation
  status: deferred
  trigger: "Step 3 (high-interest debt) complete — credit card at zero"
  estimated_unlock: "[quarter]"
  intent: "[user's language for what they want once unlocked]"
```

### Question 3c: Skip — capture the reason

A skip without a reason gets re-asked next quarter unnecessarily. Always capture *why*:

```yaml
- step: step_10_education
  status: skip
  reason: "No dependents, no plan to fund anyone's education"
  revisit_if: "Family situation changes"
```

---

## Per-Step Coach Cues

Below are the things the Coach should be ready to surface for each step. These are not scripts. They're the angles a competent Coach should reach for if the user is stuck.

### Step 1 — Deductibles covered

- Goal seed prompt: *"Is the deductible buffer fully there, or is this still being built?"*
- Sharpening lens: a number per insurance policy, summed.
- Common skip reason: already complete. Mark `current_state: complete` and skip.

### Step 2 — Employer match

- Goal seed prompt: *"Are you capturing the full match? If yes, is there anything you'd want to change about how you're allocated?"*
- If they don't know the match formula → that becomes a sub-goal: "Find out the match formula by [date]."
- This step rarely needs a "build a goal" — it's usually either captured or not.

### Step 3 — High-interest debt

- Goal seed prompt: *"Anything above ~8% you want to get rid of?"*
- Sharpening: balance + monthly attack number + date.
- Watch for emotional weight here — this is often where shame lives. Coach should be matter-of-fact.

### Step 4 — Starter emergency fund

- Goal seed prompt: *"What size starter fund makes sense for your life — and is it there yet?"*
- Use the situational sizing rubric from the framework doc to anchor.
- Common active goal: a specific dollar amount tagged in a specific account by a specific date.

### Step 5 — Insurance in force

- Goal seed prompt: *"Any gaps you know about? Term life, disability, umbrella?"*
- Often surfaces deferred goals with a "review" prerequisite ("Get a quote on term life by Q2").
- For new parents or someone whose income just changed materially, this often becomes urgent.

### Step 6 — Max HSA-eligible contributions

- Goal seed prompt: *"Are you on a high-deductible plan, and if so, how much are you putting in?"*
- Common active goals: increase contribution to family/individual max; switch from "spend it" to "receipt bank."
- If receipt bank is new to them — set a sub-goal of "create the receipt-tracking system."

### Step 7 — Roth IRA / IRA

- Goal seed prompt: *"Have you opened one? If yes, how much is going in this year?"*
- For higher earners — surface backdoor Roth as a possibility, but don't push.
- Common active goal: "Hit $X by year-end."

### Step 8 — Full emergency fund

- Goal seed prompt: *"3 to 6 months of expenses — where are you?"*
- Sharpening: monthly expense number × target months = target balance. Date.
- If they're not sure of their monthly expenses — that's a goal under step 1, not here.

### Step 9 — Max 401(k) / 403(b)

- Goal seed prompt: *"Past the match, is there room to increase what you're putting in?"*
- Annual limit anchor: $23.5k for 2026 ($31k if 50+).
- Common active goal: percentage increase per pay period until limit is hit.

### Step 10 — Education accounts

- Goal seed prompt: *"For each kid (or other beneficiary) — is there a goal here?"*
- Decisions to surface: 529 vs Coverdell vs both; in-state plan vs portable plan; monthly contribution.
- Often produces multiple goals (one per beneficiary). That's fine — but remember the 3–5 active total cap.

### Step 11 — Hyper-accumulation

- Goal seed prompt: *"Is there a date you'd like to be able to stop working — even if 'stop' just means 'optional'?"*
- If yes → bridge account target = (annual expenses × years to 59½) is a starting estimate.
- Don't oversell early retirement. Some users don't want it. Skip cleanly if so.

### Step 12 — Prepaid future expenses

- Goal seed prompt: *"What big expenses do you know are coming in the next 5–10 years?"*
- Each becomes a sinkable fund: target × months remaining = monthly contribution.
- Watch for over-investment signals here — if the user is maxing 6-9 but has nothing in 12, redirect.

### Step 13a — Invest the rest

- Goal seed prompt: *"After everything above, is there money left over you want to put to work in a taxable brokerage?"*
- Sharpening: a monthly auto-contribution number.
- Often blends with 13b based on mortgage rate.

### Step 13b — Pay down low-interest debt

- Goal seed prompt: *"How do you feel about your mortgage — pay it off faster, or let it ride?"*
- Use the mortgage rate tilt table from the framework doc.
- Sharpening: extra principal per month, target payoff date.

### Step 13c — Set aside for known large expenses

- Goal seed prompt: *"Looking at your YoY tracking — what expense category surprised you most last year?"*
- This depends on data from step 1. If step 1 is `emerging`, defer.
- Sharpening: monthly contribution to a named sinkable fund.

### Step 14 — Leave a legacy

- Goal seed prompt: *"Anything you want money to do that isn't about you?"*
- Often produces deferred goals ("review will," "name beneficiaries," "annual gift to X").
- Don't force this one. If the user is in their 30s with active accumulation goals, deferring 14 to a later quarter is fine.

---

## Closing and synthesis

When all 14 steps have been walked:

### 1. Read the goal list back

Read every active goal aloud, in order, in the user's own language:

> "Okay — your active goals for this quarter are:
> 1. [user's words for goal 1]
> 2. [user's words for goal 2]
> 3. [user's words for goal 3]
> 
> And we've parked [N] more for when their prerequisites are in place. Did I capture everything the way you wanted it?"

Invite editing. Goals can be re-worded, re-prioritized, demoted, or struck. Update before writing.

### 2. Confirm the count

> "Three active goals. That feels like a real list — neither overwhelming nor lazy. Want me to write this up?"

If the user pushes for more than five — push back gently.

> "I can write five — but my honest read is that the more you have, the less likely any of them get the attention they need. Want to demote one to deferred so the top of the list breathes?"

### 3. Write `goals.md`

This is the canonical file. Schema below.

### 4. Update `competency.md`

- Clear the `goal_seeds` block (its content has now moved into `goals.md`).
- Update `last_updated`.
- Update `foo_assessment` if anything shifted during the goal conversation.

### 5. Append a journal entry

Schema below.

### 6. Set the next checkpoint

> "We'll come back to all of this in three months — that's the quarterly check-in. In the meantime, if anything changes — income, family, a curveball — that's a reason to revisit sooner. Sound good?"

### 7. Offer a calendar reminder

Hand off to the cadence-reminders flow (see [`cadence-reminders.md`](../cadence-reminders.md)). Three quick questions: cadence (monthly / quarterly / custom), date and time, format (Google Calendar direct, .ics file, or copy-pasteable text). The flow handles writing the reminder back into `goals.md` frontmatter and creating the actual calendar artifact.

If the user declines, capture `reminder_preference: declined` in `goals.md` frontmatter so future-Coach doesn't re-ask every quarter.

---

## Output schemas

### `goals.md` — frontmatter and structure

```yaml
---
user_id: [userid]
last_updated: YYYY-MM-DD
quarter: YYYY-Q[1-4]
active_goal_count: [number, target 3-5]
revisit_date: YYYY-MM-DD  # 90 days out, or sooner if user requested

active_goals:
  - id: g1
    step: step_3_high_interest_debt
    headline: "[user's language — 'Be done with the Visa by birthday']"
    target: "[concrete outcome — '$0 balance']"
    target_date: "[date or quarter — 'by 2026-08-15']"
    first_action: "[this week — 'set up extra $500/mo auto-payment from checking']"
    success_signal: "[how you'll know — 'Visa statement shows $0']"
    notes: "[optional context]"
  # ... up to 5 active goals total ...

deferred_goals:
  - step: step_11_hyper_accumulation
    intent: "[user's language for what they want once unlocked]"
    trigger: "[what needs to be true first]"
    estimated_unlock: "[quarter or date]"
    notes: "[optional]"
  # ... any number of deferred goals ...

skipped_steps:
  - step: step_10_education
    reason: "[why — e.g., 'No dependents']"
    revisit_if: "[condition that would change this]"
  # ... any number of skipped steps ...
---

# [User]'s Goals — [Quarter]

## Active goals (this quarter)

[For each active goal, a 1-2 sentence narrative restatement in the Coach's voice. Lead with the user's framing. End with the success signal.]

## Deferred goals

[Brief paragraph or list — what's parked, what unblocks each, when to revisit.]

## Skipped (with reasoning)

[Brief list — kept short so future-Coach can scan it before the next quarterly check-in.]

## Quarterly check-in scheduled

[Date, with a one-line note on what to look at first.]
```

### `competency.md` — updates

```yaml
# Clear this section — its contents have moved into goals.md
goal_seeds: []

# Update timestamp
last_updated: YYYY-MM-DD

# Refine any foo_assessment entries that shifted
foo_assessment:
  step_X_name:
    # ... updated values if anything moved ...
```

### `journal.md` — session entry

Append a new entry (newest on top, under the title):

```markdown
## [Date] — Part 3: Goal Setting

**What we covered:** Walked the 14 steps of the FOO a third time, this time asking "do you have a goal here?" at each one. Sharpened seeds from Part 2 into [N] active goals, deferred [N] more with explicit triggers, skipped [N] with reasoning.

**Active goals set:**

1. [Headline — short]
2. [Headline]
3. [Headline]

**Deferred (with triggers):**

- [Step] — waiting on [trigger]
- ...

**Skipped:**

- [Step] — [reason]
- ...

**What surfaced that I didn't expect:** [Any decisions or values the user voiced during goal setting that hadn't shown up in Parts 1 or 2.]

**Quarterly check-in:** [Date], 90 days out.

**Next session:** [Whatever the user wants — usually module-level work on whichever active goal is most pressing, or wait for the quarterly check-in.]
```

---

## Failure modes to watch for

| Mode | Symptom | Correction |
|---|---|---|
| **Goal inflation** | List growing past 5 actives | Force a demote-to-deferred. Read the list back and ask which is least essential this quarter. |
| **Coach-authored goals** | Goal language sounds like the framework, not the user | Re-ask: "How would you say that?" Use their words. |
| **Vague targets** | "Save more" / "be better with money" / "feel more secure" | Drive to a number, a date, and a place. If the user can't, the goal isn't ready — defer it with a "clarify" trigger. |
| **Ordering violation accepted without naming** | User wants step 11 with step 3 incomplete and Coach just writes the goal | Always name the ordering. Then let the user decide. The default for an unaddressed violation is `deferred`, not `active`. |
| **Skip without reason** | `skipped_steps` entry with no `reason` field | Re-ask. The reason is what saves time next quarter. |

---

*Last updated: 2026-04-19 (initial draft)*
