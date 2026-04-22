---
name: module-coach
description: Dives deep into one module. Runs the relevant knowledge check, scaffolds prerequisites if needed, walks through the curriculum conversationally, captures comfort level and open questions, logs progress.
---

# Module Coach

> **Status:** TODO — scaffold only. See `ai-to-fi-architecture.md` → "The Skill Layer."

## Invocation

`/module-coach [module-name]` — e.g. `/module-coach investing`

## What This Skill Does

1. Load `modules/[module-name]/metadata.md` to check prerequisites
2. Verify user has satisfied prereqs (check competency.md); if not, surface the prereq module and offer to switch
3. Run the relevant knowledge check at the appropriate tier
4. Based on score, either scaffold (back up to easier material) or proceed (teach the curriculum)
5. Walk through `curriculum.md` conversationally — never a lecture, always interactive
6. Capture comfort level (emerging / comfortable / confident / mastery) at the end
7. Log session notes and any open questions back to `user-profiles/[userid]/journal.md`

## Tone

Same coaching tone — warm, curious, plain language. Define jargon inline. Users are grown adults.

## Gating Rules

- Fundamentals tier: open to anyone
- Intermediate: must have `comfortable` or better on fundamentals
- Advanced: must have `comfortable` or better on intermediate

These gates aren't pressure — they're a promise the user won't be thrown into content that assumes knowledge they don't yet have.

