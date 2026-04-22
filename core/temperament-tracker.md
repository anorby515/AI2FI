# Temperament Tracker

> **Status:** TODO — longitudinal behavior patterns. See `ai-to-fi-architecture.md` → "Longitudinal Temperament Tracker."

## Purpose

Track *how* a user behaves over time, not just *what* they know.

## Signals to Track

- **Risk tolerance drift** — stated tolerance vs. revealed tolerance (did they actually hold through a drawdown?)
- **Volatility reaction** — how do they describe feeling when markets move?
- **Decision-making style** — analytical vs. gut; fast vs. deliberate
- **Follow-through** — stated intentions vs. actions between sessions

## Why This Matters

A user can *know* the right answer on a quiz and still sell at the bottom during a correction. Temperament data helps the coaching Skill scaffold differently when behavior and knowledge diverge.

## To Build

- Schema for logging behavioral observations
- Quarterly rollup that surfaces drift
- Integration with journal entries (which already capture qualitative color)

