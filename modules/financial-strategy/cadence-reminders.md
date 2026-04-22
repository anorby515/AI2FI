---
module: financial-strategy
role: coach_flow
called_from:
  - parts/part-3-goal-setting.md (Close step 5)
  - quarterly-review-template.md (Close step 3)
  - any module that closes with a "next session" handoff
outputs:
  - user-profiles/[userid]/goals.md (reminder block in frontmatter)
  - user-profiles/[userid]/reminders/[yyyy-mm-dd]-[cadence].ics (optional)
  - calendar event (optional, via Google Calendar MCP)
---

# Cadence Reminders

*A short, optional closing flow that turns "we'll revisit this in 90 days" into something that actually arrives in the user's calendar. Designed to be triggered at the end of Part 3 and every quarterly review, and reusable by any module that ends with a scheduled next-session.*

---

## Purpose

Without a reminder, "quarterly check-in" decays into "that thing we should do eventually." This flow closes the loop by:

1. Confirming the user wants a reminder at all (never assume — some users prefer to drive the cadence themselves).
2. Agreeing on the cadence — monthly / quarterly / custom.
3. Writing it into a format that ends up in their actual calendar, not just a note buried in a file.

The user should leave with either a real calendar event or a clean no — never "I think I was supposed to do something?"

---

## Canonical defaults

These are the baked-in decisions. The Coach does not re-litigate them at every session, and should not ask the user to choose between them blind. They apply unless the user explicitly overrides.

| Decision | Default | Rationale |
|---|---|---|
| **Format — primary path** | **Google Calendar (MCP)** when the calendar MCP is connected | One tool call, zero user handoff, shows up on every device the user already syncs to. |
| **Format — fallback path** | **`.ics` file** when the MCP is not connected (or the user declines Google Calendar) | Universal — imports into Apple Calendar, Outlook, Fantastical, and anything else. Not ecosystem-locked. |
| **Format — third option** | Copy-pasteable text, offered only on request | Lowest-friction for the Coach but highest-friction for the user. Only surface if the user explicitly asks. |
| **Recurrence** | **Non-recurring.** Every reminder schedules exactly one event | Recurring reminders go stale after life changes (new job, new kid, move) and get ignored. Each quarterly review should schedule its own next reminder at its own close. |
| **Cadence — default to suggest** | **Quarterly** (90 days) | Matches the quarterly review template. Monthly is offered when recent goals have sub-90-day first actions. Custom is offered when the user has a date-driven reason. |
| **Reminder notifications** | 1 day before + 1 hour before (quarterly); 30 min before (monthly) | Front-loaded so the user can move things if needed, with a same-day nudge. |
| **Default time** | **Saturday 9:00 AM local** | Most common slot for finance review sessions. Override freely based on user context. |
| **Shell reminder file** | **Always write one** alongside the calendar artifact | Backstop — if the user clears their calendar, the Coach can still see what was scheduled next session. |

The orchestrator script `scripts/schedule_checkin.py` encodes this decision tree directly — when in doubt, run it and let the code pick the path.

---

## When to run this flow

- Immediately after `goals.md` is written (end of Part 3).
- Immediately after `goals.md` is rewritten for a new quarter (end of quarterly review).
- Any time the user explicitly asks for a reminder to be set or updated.

Skip if:
- The user has previously said "no reminders" for this module and nothing has changed — respect that.
- There's an existing reminder on the books within 10 days of the proposed new one — no need to double-book.

---

## Instructions for the Coach

### Tone

- **Optional, not pushed.** Ask once, accept the answer. Don't moralize about accountability.
- **Concrete in suggestions.** Don't ask "want a reminder?" — ask "want me to put a quarterly check-in on your calendar for July 18?"
- **Format-aware.** Don't make the user pick between formats blind. Recommend the best one based on what's connected.

### The three questions, in order

#### Q1 — Cadence

> *"Before we wrap — want me to set a reminder for your next check-in? And if yes, what rhythm makes sense for you?"*

Offer three options with a recommendation:

| Option | Who it's for | Duration | Recommended? |
|---|---|---|---|
| **Monthly** | Goals with near-term first actions, or users who benefit from more frequent nudges | 10–15 min pulse check | If user chose 3+ goals with sub-90-day target dates |
| **Quarterly** | Standard rhythm for most users — matches the quarterly review template | 25–30 min full review | **Default recommendation for most cases** |
| **Custom** | Specific trigger date the user has in mind ("check in right before bonus") | Whatever user names | When user has a date-driven reason |

If the user picks monthly, offer to schedule a single "light check-in" each month plus a full quarterly review every third one — both on their calendar, clearly labeled.

If the user declines: capture it in `goals.md` frontmatter so future-Coach doesn't re-ask at every session.

```yaml
reminder_preference: declined  # or: monthly | quarterly | custom
reminder_declined_at: YYYY-MM-DD
```

#### Q2 — Date and time

Compute the target date based on cadence:

- **Monthly** — same day-of-month, next month. If that date doesn't exist (e.g., Feb 30), use the last day of that month.
- **Quarterly** — add 90 days to today. Round to the nearest weekday if it lands on a weekend.
- **Custom** — ask the user for the date.

Then propose a time:

> *"Quarterly check-ins usually run 25–30 minutes. What time of day works best for you for that kind of session?"*

Offer sensible defaults if the user hesitates:

- **Saturday morning** (9:00 AM local) — common for finance review sessions
- **Weeknight** (7:00 PM local) — if user mentioned weekends are for family
- **Lunch** (12:00 PM local) — if user mentioned they work from home

Ask about time zone only if the user's location has changed or hasn't been captured — otherwise use what's in `competency.md`.

#### Q3 — Format

> *"A few ways I can put the reminder somewhere you'll actually see it. Want me to suggest?"*

Present the menu with a recommendation tailored to what's connected:

**If Google Calendar MCP is connected (detectable via tool availability):**

> *"Easiest is Google Calendar — I can drop the event straight onto your calendar right now. If you'd rather keep it off a synced calendar, I can generate a `.ics` file you can import into any app (Apple Calendar, Outlook, Fantastical, etc.). Which do you prefer?"*

Recommended default: **Google Calendar direct**.

**If no calendar MCP is connected (or user prefers a file):**

> *"I can generate a `.ics` file — that's a universal calendar-invite format that works with Apple Calendar, Outlook, Google Calendar, Fantastical, and pretty much anything else. You'll open or double-click it and it imports cleanly. Or, if you'd rather, I can just give you a copy-pasteable block with the event details so you can add it manually."*

Recommended default: **.ics file**.

### Format reference table

| Format | Pros | Cons | Best for |
|---|---|---|---|
| **Google Calendar (MCP)** | One click. Zero handoff. Shows up on phone, laptop, watch. Supports recurrence natively. | Requires Google account and MCP connection. Some users don't use Google Calendar. | Users already on Google Calendar. |
| **.ics file** | Universal. Works with any calendar app. Can be emailed, dragged, imported. Self-contained — doesn't require the AI to be "on" at reminder time. | Requires the user to actually import it. Two-click minimum. | Users on Apple, Outlook, Fantastical, or anyone who wants portability. |
| **Copy-pasteable text** | No tools required. Works for a user who's in a meeting they want to add to their work calendar, or for a printable paper reminder. | Manual. Easy to skip. No recurrence automation. | Fallback. Also useful when user wants to forward the reminder to a spouse. |
| **Shell reminder file** (markdown) | Lives in the repo with goals.md. Coach can read it next time to confirm reminder is still valid. | Not actually in a calendar. Only works if user opens the repo. | Complement to any of the above — always write this alongside. |

### What a good reminder contains

Whatever format:

- **Title:** `AI2FI Quarterly Check-In — [Quarter]` (or Monthly / Custom)
- **Duration:** 30 min (quarterly) / 15 min (monthly) / user's choice (custom)
- **Location / URL:** None required. If the user uses a specific app or environment for these sessions, include it. Leave blank otherwise.
- **Description:** The three active goal headlines in the user's language, so when the reminder fires the user can read the three things they're meant to be making progress on. Also include a one-line pointer to `goals.md` so the Coach can read it when the session starts.
- **Reminder notifications:** 1 day before + 1 hour before for quarterly. 30 min before for monthly.
- **Recurrence:** Configurable. Default is **non-recurring** — each quarterly review should schedule its own next one at its own close. Recurrence traps users in stale rhythms when life changes.

Example description block:

```
AI2FI Quarterly Check-In — 2026-Q3

This quarter's active goals:
1. [user's headline for goal 1]
2. [user's headline for goal 2]
3. [user's headline for goal 3]

Deferred: [count] | Skipped: [count]

To open the session, read goals.md and journal.md, then kick off the quarterly review template.
```

---

## Execution — how to actually create the reminder

### Path 1 — Google Calendar (MCP)

Use `create_event` with:

```
summary: "AI2FI Quarterly Check-In — [Quarter]"
start_time: [target date]T[time]:00
end_time: [target date]T[time+30 min]:00
timeZone: [user's timezone from competency.md, or America/Los_Angeles default]
description: [the block above]
addGoogleMeetUrl: false
notificationLevel: NONE  # reminders are what the user wants, not attendee emails
```

Confirm success by reading back the event title and date. Capture the event details in `goals.md` frontmatter.

### Path 2 — .ics file

Run the generator script:

```bash
python3 modules/financial-strategy/scripts/generate_ics.py \
  --title "AI2FI Quarterly Check-In — 2026-Q3" \
  --date 2026-07-18 \
  --time 09:00 \
  --duration 30 \
  --timezone America/Los_Angeles \
  --description-file /tmp/ai2fi-description.txt \
  --output /sessions/sleepy-intelligent-fermi/mnt/AI2FI/user-profiles/[userid]/reminders/2026-07-18-quarterly.ics
```

After generation, hand the user a computer:// link to the file. Let them know they can double-click it to add to their calendar.

### Path 3 — Copy-pasteable text

Render a plain-text block the user can paste into whatever tool they're using:

```
When:   [Day], [Date] at [Time] [Timezone]
Length: 30 min
What:   AI2FI Quarterly Check-In — [Quarter]
Why:    Review progress on [N] active goals, update profile, set next quarter's goals
```

Offer to also write the .ics file alongside, in case the user wants both.

### Path 4 — Shell reminder file (always write this too)

Regardless of which path above, write a short reminder note to:

```
user-profiles/[userid]/reminders/[yyyy-mm-dd]-[cadence].md
```

Content:

```markdown
---
reminder_type: quarterly | monthly | custom
scheduled_for: YYYY-MM-DD
scheduled_time: HH:MM
timezone: [IANA tz name]
format_delivered: google_calendar | ics | copy_paste
ics_file: [path if applicable]
calendar_event_id: [id if Google Calendar]
created_at: YYYY-MM-DD
---

# Quarterly Check-In — [Quarter]

Scheduled for [date at time].

**Active goals this quarter:**
1. [headline]
2. [headline]
3. [headline]

**When the reminder fires:** open `goals.md` and `journal.md`, then run `quarterly-review-template.md`.
```

This file acts as a backstop — if the user clears their calendar or loses the .ics, the Coach can still see the scheduled review on the next session.

---

## Frontmatter to append to `goals.md`

After the reminder is set (or declined), update `goals.md` frontmatter:

```yaml
reminder:
  preference: monthly | quarterly | custom | declined
  scheduled_for: YYYY-MM-DD  # omit if declined
  scheduled_time: HH:MM       # omit if declined
  format: google_calendar | ics | copy_paste
  created_at: YYYY-MM-DD
  # For Google Calendar only:
  calendar_event_id: [id returned from MCP]
  # For .ics only:
  ics_file: [relative path]
```

---

## Failure modes

| Mode | Symptom | Correction |
|---|---|---|
| **Pushing when user declined** | Coach re-asking every session after a declined reminder | Record `reminder_preference: declined` and honor it for 6 months minimum. |
| **Format whiplash** | Offering all 4 formats with no guidance | Always lead with a recommendation based on what's connected. |
| **Recurring reminder lock-in** | Defaulting to RRULE in the .ics or Google Calendar | Don't. Each quarterly review should schedule its own next reminder. Recurrence makes stale reminders fire after life changes. |
| **Forgetting the shell reminder file** | Only creating the calendar event | Always write the markdown reminder too. It's the Coach's memory of what was scheduled. |
| **Double-booking** | User already has an active reminder and Coach creates another | Check `goals.md` frontmatter `reminder.scheduled_for` before creating a new one. If it exists and is within 10 days of the proposed date, offer to update instead of creating. |

---

## Detecting calendar MCP availability

At the start of the format conversation, the Coach should know whether the Google Calendar MCP is connected. Check at runtime by attempting `list_calendars` — if it succeeds, Path 1 is available. If it errors with a "not connected" / tool-not-available response, fall back to Path 2 as the recommended option.

If the user asks *"can you just put it on my calendar?"* and the MCP isn't connected, tell them honestly:

> *"I can generate an .ics file right now that'll drop into any calendar when you double-click it. If you want me to create events directly in Google Calendar going forward, you can connect the Google Calendar integration — want me to point you to how?"*

Offer `suggest_connectors` here if the user wants to connect.

---

*Last updated: 2026-04-19 (initial flow)*
