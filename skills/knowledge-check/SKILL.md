---
name: knowledge-check
description: Standalone quiz runner. Runs tiered assessments (fundamentals / intermediate / advanced) for any module. Can be invoked directly by the user or called by other skills.
---

# Knowledge Check

> **Status:** TODO — scaffold only. See `ai-to-fi-architecture.md` → "The Skill Layer."

## Invocation

- `/knowledge-check [topic]` — defaults to the next unlocked tier
- `/knowledge-check [topic] [level]` — e.g. `/knowledge-check investing intermediate`

## What This Skill Does

1. Load the specified `modules/[topic]/knowledge-check-[level].md`
2. Run the quiz conversationally — ask one question at a time, give feedback after each
3. Record score and comfort level to `user-profiles/[userid]/competency.md`
4. On a meaningful change (e.g. "comfortable → confident"), note it in journal with narrative framing ("Three months ago you weren't sure about X — today you explained it back clearly.")
5. If score indicates the user is ready for the next tier, offer it (don't auto-advance)

## Retention Tracking

When a user retakes a check, compare against their last result. Surface patterns over time:
- Did they remember this? → note in temperament-tracker
- Did they regress? → not a failure; might be a cue to revisit the module

## Tone

Feedback is always teaching. Never "wrong" as a verdict — always "here's why the other answer gets us closer."

