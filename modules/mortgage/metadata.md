# Mortgage — Metadata

```yaml
module: mortgage
title: Mortgage
prerequisites: [financial-strategy]
estimated_session_minutes: 25
tiers: [fundamentals, intermediate, advanced]
last_updated: 2026-04-25
revisit_cadence: annually
status: in-development
```

## Notes

- Fundamentals quiz at `knowledge-check-fundamentals.md` covers amortization basics, the cost of interest, escrow vs. P&I, and when prepayment is — and isn't — the right move.
- Intermediate / advanced tiers expand into refinance math, recasting, ARM mechanics, PMI removal, and using a HELOC strategically.
- The companion dashboard view (Dashboard → Debt → Mortgage) reads the user's `Mortgage` tab from `private/Finances.xlsx` and renders Progress + What If projections (interest savings, payoff acceleration). The Coach pulls from the same numbers when answering "should I pay extra?" questions.
- Revisit cadence is annual by default — bumped to quarterly any year the user is actively considering refinance, recast, or a major prepayment.
