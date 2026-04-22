# Investing Fundamentals — Knowledge Check

*Interactive markdown quiz. Claude uses this file to run a conversational assessment, score in real time, explain reasoning, and adapt based on answers.*

---

## Instructions for Claude (the Coach)

When this file is invoked:

1. Greet the user warmly. Remind them this isn't a pass/fail test — it's a way to figure out where to start.
2. Ask questions **one at a time**, conversationally. Wait for an answer before moving on.
3. For each question: present the scenario, then the options as A/B/C/D.
4. After the user answers:
   - If correct: affirm briefly, give a *one-sentence* reason why, and ask if they want a deeper explanation.
   - If incorrect: don't say "wrong." Instead: "That's a common intuition, but here's what's actually going on..." Explain the correct answer simply.
5. Track answers silently. Don't announce a running score.
6. After all questions, synthesize:
   - Comfort level: **emerging / comfortable / confident / mastery**
   - Which concepts landed, which need reinforcement
   - Recommended next step (stay in fundamentals, move to intermediate, revisit a specific topic)
7. Offer to update the user's journal with what you learned about them.

**Tone:** encouraging, curious, never condescending. The user is a grown adult. Don't over-explain unless asked. Use plain language — if a term is jargon, define it briefly inline.

---

## Question 1 — Capital Gains

**Scenario:** You bought 100 shares of a stock for $50 each, and sold them a year later for $70 each.

**What's your capital gain?**

- A) $50
- B) $70
- C) $2,000
- D) $7,000

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: C — $2,000**

($70 − $50) × 100 shares = $2,000

*Concept being tested:* Basic understanding that capital gain = sale price minus cost basis, multiplied by number of shares. A foundational building block.

</details>

---

## Question 2 — Cost Basis

**Scenario:** You buy 10 shares at $100, then six months later buy 10 more shares at $150. A year after that, you sell 5 shares.

**What is your cost basis for the 5 shares you sold (assuming FIFO — first in, first out)?**

- A) $100 per share
- B) $125 per share (average)
- C) $150 per share
- D) It depends on which shares you specify

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: A — $100 per share** (under FIFO, the first shares purchased are the first sold)

But D is also acceptable and arguably more sophisticated — brokers let you specify lots. This is a good chance to introduce **specific lot identification** as a tax strategy tool. If user picks D, affirm and explain why sophisticated investors often prefer specific identification for tax control.

*Concept being tested:* Cost basis isn't one number — it's per-lot, and how you identify which lot you sold affects your tax outcome.

</details>

---

## Question 3 — Short vs. Long Holding Period

**Scenario:** You bought a stock on March 1, 2025. You want your gain to qualify for long-term capital gains tax treatment.

**What's the earliest date you can sell?**

- A) September 1, 2025 (6 months)
- B) March 1, 2026 (exactly 1 year)
- C) March 2, 2026 (1 year + 1 day)
- D) December 31, 2025 (end of tax year)

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: C — March 2, 2026**

Long-term treatment requires holding **more than one year** — meaning one year *and one day*. Selling exactly on the anniversary date is still short-term.

*Concept being tested:* The "more than one year" rule — not "one year or more." This tripping point catches many investors. Short-term gains are taxed as ordinary income; long-term gains get preferential rates (0%, 15%, or 20% depending on bracket).

</details>

---

## Question 4 — Dividends

**Scenario:** You own shares of a company that declares a $2 per share dividend.

**Which of the following is most accurate?**

- A) The dividend is tax-free because you already paid tax on the shares
- B) Dividends are always taxed as ordinary income
- C) Qualified dividends are taxed at long-term capital gains rates; non-qualified are taxed as ordinary income
- D) Dividends only get taxed when you sell the stock

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: C**

Qualified dividends (most U.S. corporate dividends held for the required period) get preferential tax treatment — same rates as long-term capital gains. Non-qualified dividends (REITs, some foreign stocks, short holding periods) are taxed as ordinary income.

*Concept being tested:* Not all dividends are taxed the same. The qualified/non-qualified distinction has real impact on after-tax returns.

</details>

---

## Question 5 — Index vs. Active (Conceptual)

**Scenario:** Over the past 20 years, what percentage of actively managed U.S. large-cap mutual funds have underperformed the S&P 500 index (after fees)?

- A) Around 25%
- B) Around 50%
- C) Around 75%
- D) Around 90%

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: D — around 90%**

Per SPIVA reports, roughly 85–90% of active large-cap funds underperform their benchmark over 20-year periods. This is why index investing has become the default for most fundamentals-focused investors.

*Concept being tested:* The empirical case for low-cost index investing. Not "indexing is always right" — but an understanding of why fees and persistence matter enormously over time.

</details>

---

## Question 6 — Tax-Loss Harvesting (Gentle Stretch Question)

**Scenario:** One of your stocks is down $3,000 from where you bought it. The rest of your portfolio has gains. You're considering selling the losing stock to offset some of your gains for tax purposes.

**Which of these is TRUE?**

- A) You can use the loss to offset gains, and up to $3,000 of ordinary income per year
- B) You can only use the loss to offset gains, not income
- C) You'd have to wait 90 days before buying the stock back to avoid a wash sale
- D) Losses only help if they're long-term losses

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: A**

Capital losses offset capital gains dollar-for-dollar. Any excess loss can offset up to $3,000 of ordinary income per year, with the remainder carried forward indefinitely. The wash sale window is 30 days (before AND after), not 90.

*Concept being tested:* The mechanics of tax-loss harvesting. If the user nails this, they're ready to move toward the intermediate tier.

</details>

---

## Synthesis Prompt (Claude uses after all 6 questions)

Now reflect back to the user:

> "Here's what I noticed from our conversation:
>
> **Concepts that landed:** [list the ones they answered well, in plain language]
>
> **Concepts worth revisiting:** [list the ones that tripped them up, with a brief note on why they matter]
>
> **My read on your comfort level:** [emerging / comfortable / confident / mastery] with investing fundamentals.
>
> **What I'd suggest next:**
> - If emerging: Let's walk through [specific module] together before touching any investment decisions.
> - If comfortable: You're ready to go deeper. Want to dig into [specific intermediate topic]?
> - If confident: Ready for the intermediate knowledge check when you are.
> - If mastery: Let's skip ahead to advanced topics or start working on your portfolio strategy.
>
> I'll make a note of where we landed so next time we pick up from here. Sound good?"

---

## Journal Entry Template (for Claude to log after the quiz)

```
## [Date] — Investing Fundamentals Knowledge Check

- Comfort level: [level]
- Strong areas: [topics]
- Growth areas: [topics]
- Notable moments: [any aha-moments, resistance points, or questions they raised]
- Next recommended step: [specific action]
- User's stated feeling: [optional — how did they feel doing this?]
```

---

*Prototype version 0.1 — iterate freely. Adjust question difficulty, tone, and scenarios based on user testing.*
