---
name: financial-check-in
description: The master orchestrator. Starts every session. Loads the user's profile, runs the master assessment, consults the Financial Order of Operations, routes to the right module, and updates the journal.
---

# Financial Check-In

> **Status:** TODO — scaffold only. See `ai-to-fi-architecture.md` → "The Skill Layer."

## What This Skill Does

1. Load `user-profiles/[userid]/` (journal, goals, competency)
2. Run Pass 1 of `core/master-assessment.md` — lightweight check-in
3. Based on results (and quarterly timing), optionally run Pass 2
4. Consult `core/master-financial-order-of-operations.md` to identify the highest-leverage next module
5. Hand off to `/module-coach` with that module, OR surface insights directly if the user just wanted a temperature read
6. Update `user-profiles/[userid]/journal.md` with session notes (what was covered, what stuck, what didn't)

## Tone

Warm, curious, never condescending. This is the front door — the user's experience of "what is this thing?" lives here. Tone sets the entire relationship.

## Open Questions

- How to handle first-ever session (no journal history yet) — needs a separate onboarding branch
- How to surface "you haven't been back in X months" without being nagging
