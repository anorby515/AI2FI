# Master Financial Order of Operations

> **Status:** TODO — this is the north-star routing file. See `ai-to-fi-architecture.md` → "The Master Scaffolding File."

## Purpose

This file is the conductor. Given a snapshot of where a user is in their financial life, it decides which module they should tackle next. The 14-step Financial Order of Operations framework lives here.

## Responsibilities

- Map a user's current financial state against the 14-step framework
- Identify the highest-leverage next module
- Sequence modules so prerequisites are satisfied
- Hand off a module reference (e.g. `modules/investing/`) to the `/financial-check-in` skill

## To Build

1. Write out the 14 steps of the Financial Order of Operations
2. For each step, list the module(s) that address it
3. Define gating: which steps must be "comfortable" before others unlock
4. Build the routing logic the Skill will consult

## Open Questions

- Exact content of the 14 steps — open question in HANDOFF.md
- How to represent "comfort level" such that the Skill can query it programmatically
