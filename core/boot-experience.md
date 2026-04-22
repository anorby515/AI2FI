---
file: core/boot-experience.md
status: design-draft
owner: AI2FI
last_updated: 2026-04-18
---

# Boot Experience — Design

The terminal-style opening surface every AI2FI session renders. It is the first thing a new user sees and the standing menu returning users come back to. This doc is the spec; implementation lives in `core/scripts/boot_status.py`, `core/assets/banner.txt`, and the boot block of `skills/financial-check-in/SKILL.md`.

---

## Purpose

The boot screen does four things in one render:

1. **Identifies the surface.** A visible AI2FI mark tells the user where they are.
2. **Locates them.** "You are new" vs. "Welcome back, Andrew" vs. "Next check-in in 12 days" — they know what the system knows about them before they have to ask.
3. **Offers the next move.** Always. Never render a banner without an actionable next step.
4. **Reinforces the posture.** Local-first privacy, deliberate pace, user in control.

If the boot screen ever feels slow, noisy, or ambiguous about what to do next, it is failing.

---

## Aesthetic principles

- **Terminal styling is style, not requirement.** ASCII, monospace layout, slash commands — but the user can always drop out and type freely in natural language at any moment. The terminal never blocks.
- **One screen, no scroll.** The banner + status + menu fits in a standard terminal viewport (~20 lines).
- **Warm, not cold.** Terminals can feel sterile. AI2FI's do not — copy is warm and respectful, consistent with the coaching tone (warm, curious, never condescending).
- **Predictable shape.** The banner looks the same every session. The status block is what changes. Users should be able to eyeball the status block in under two seconds.

---

## One profile per folder

A single installation serves a single profile. Detection is path-based:

- Profile directory: `user-profiles/{name}/`
- Presence of `competency.md` = the profile exists
- No profile directory = new-user state

This is a deliberate constraint. Multi-profile support (household mode, persona testing) is out of scope for v1. Users running stress-tests against multiple personas (as Andrew plans for 2026-04-19) should copy or switch the `user-profiles/` contents between runs, or use a distinct installation per persona.

---

## Privacy line (always-on)

Every boot render includes a one-line privacy statement. It is not a toggle.

**First-run form (longer, educational):**
```
PRIVACY  : your profile lives in this folder, on this machine.
           the conversation itself runs through Claude (Anthropic).
```

**Returning-user form (compact, single line):**
```
PRIVACY  : local profile · conversation via Claude
```

Rationale: the privacy story is a load-bearing differentiator for AI2FI. Collapsing it after session one would undermine trust just as users are building it. The compact form respects their time without hiding the truth.

---

## State detection

The state-detector script (`core/scripts/boot_status.py`) reads `user-profiles/{name}/` and returns a structured dict. The renderer composes the banner from it.

**Returned fields:**

| Field | Type | Meaning |
|---|---|---|
| `profile_exists` | bool | `competency.md` present? |
| `profile_name` | str | Folder name (e.g., `andrew`) |
| `parts_completed` | list[str] | From `competency.md` frontmatter |
| `next_session` | str \| null | From `competency.md` frontmatter (`next_session` field) |
| `goals_active_count` | int | Count of goals in `goals.md` Active Goals section |
| `goals_deferred_count` | int | Count of deferred goals |
| `cadence_scheduled` | bool | Is there a scheduled check-in? |
| `cadence_next_date` | date \| null | Next check-in date |
| `cadence_next_time` | str \| null | Next check-in time + TZ |
| `days_until_next` | int \| null | Days from today to `cadence_next_date` |
| `last_session_date` | date \| null | Latest entry in `journal.md` |
| `last_session_title` | str \| null | Title of latest journal entry |

The dict drives which of the canonical renders below is selected, and fills in the status block.

---

## Canonical renders

Three states cover the vast majority of sessions. Other states are variants of these.

### State A — New user (no profile detected)

```
   █████╗ ██╗██████╗ ███████╗██╗
  ██╔══██╗██║╚════██╗██╔════╝██║
  ███████║██║ █████╔╝█████╗  ██║
  ██╔══██║██║██╔═══╝ ██╔══╝  ██║
  ██║  ██║██║███████╗██║     ██║
  ╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝
  Your AI co-pilot for financial strategy.

  PROFILE  : not detected — looks like you're new here
  PRIVACY  : your profile lives in this folder, on this machine.
             the conversation itself runs through Claude (Anthropic).
  SESSIONS : we'll do three short ones to get you set up.

  > To begin, type:  let's start my financial journey
  > For a tour:      /help
```

**Transition:** typing the full phrase OR `/start` begins Part 1.

### State B — Onboarding in progress (Part 1 or Part 2 done, goals not yet set)

```
  ████  AI2FI  ████   Welcome back, Andrew.

  LAST     : 2026-04-18 — Part 1: Getting to Know You ✓
  NEXT     : Part 2 — Framework Walkthrough
  GOALS    : (none yet — set during Part 3)
  CADENCE  : (none yet — schedule during Part 3 close)
  PRIVACY  : local profile · conversation via Claude

  > continue   (c)   resume with Part 2
  > journal    (j)   read what we captured last time
  > profile    (p)   review or edit your competency snapshot
  > help       (?)   full command list
```

### State C — Established (Part 3 complete, cadence + goals live)

```
  ████  AI2FI  ████   Welcome back, Andrew.

  LAST     : 47 days ago — quarterly review (2026-03-02)
  NEXT     : 2026-07-18 (Sat, 9:00 PT) — quarterly check-in in 91 days
  GOALS    : 4 active · 1 deferred
  SURPLUS  : Q2 deploy decision pending
  PRIVACY  : local profile · conversation via Claude

  > check-in   (c)   start your quarterly review
  > goals      (g)   review or revise your 4 active goals
  > add-goal   (a)   set a new goal
  > surplus    (s)   run the quarterly surplus deploy
  > journal    (j)   read past sessions
  > help       (?)   full command list
```

### Variants worth noting

- **Check-in due or overdue:** replace `in N days` with `due today` or `overdue by N days` and promote `check-in` to the top of the menu.
- **Mid-part (e.g., Part 1 incomplete, was interrupted mid-session):** show `LAST: Part 1, Anchor 4 of 7` and offer `/resume`.
- **No surplus flag:** omit the `SURPLUS` line rather than showing `(none)`. Empty rows create noise.

---

## Command router

Every session accepts input in three forms, tried in this order:

1. **Slash command** — `/check-in`, `/goals`, `/add-goal`, `/surplus`, `/journal`, `/profile`, `/continue`, `/start`, `/resume`, `/help`
2. **Single-letter shortcut** — `c`, `g`, `a`, `s`, `j`, `p`, `?` (mapped per state's menu)
3. **Full natural-language input** — anything else routes to the conversational coach, which interprets intent

**First-run trigger phrase:** the literal string `let's start my financial journey` is also accepted as equivalent to `/start` for new users. It is not shown to returning users.

### Fallback behavior

When slash/shortcut input is unrecognized:

```
  > /flargle
  Didn't catch that. Try `/help`, or just tell me what you want in plain English.
```

When natural-language input is ambiguous: the coach asks one clarifying question rather than routing wrong.

---

## Integration with `/financial-check-in`

`/financial-check-in` is the master orchestrator per the architecture doc. The boot experience is its opening surface. Concrete sequence on any session start:

1. Load `user-profiles/{name}/` (or detect absent)
2. Run `boot_status.py` → state dict
3. Render banner for the detected state
4. Wait for input
5. Route per the command router
6. Hand off to the appropriate module/part/skill

The boot banner IS `/financial-check-in`'s Pass-1 surface for returning users — the "what's changed since last time" lives in conversation *after* the menu selection, not in the banner itself.

---

## Open items

- **Width target.** 60 columns safe, 80 columns normal, 100 columns for generous dashboards. Renderer should probably auto-detect or default to 80 and pad.
- **Color.** ANSI color on terminals that support it? First pass: no color, maximum compatibility. Re-evaluate once the renderer ships.
- **Sound / notification on overdue check-in.** Out of scope for boot; belongs to the cadence-reminder system.
- **Accessibility / screen reader.** ASCII art needs an `alt`-equivalent one-liner. Currently: `Your AI co-pilot for financial strategy.` tagline doubles as this.
- **Compact mode.** For users who boot many times per day — a `--compact` flag that skips the ASCII mark and shows only the status block + menu? Revisit after usage data.

---

## Tasks tracking this doc

- **#28** Write this doc *(in progress)*
- **#29** Build state-detector + banner renderer
- **#30** Wire boot experience into `/financial-check-in` skill
