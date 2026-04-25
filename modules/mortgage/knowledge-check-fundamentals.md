# Mortgage Fundamentals — Knowledge Check

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

If the user has a mortgage on file in their dashboard (`Mortgage` tab in `private/Finances.xlsx`), ground every answer in **their actual numbers** — original principal, rate, current balance, projected total interest. Pull these from the dashboard's `/api/mortgage` view rather than asking the user to recite them.

---

## Question 1 — How Amortization Works

**Scenario:** You take out a 30-year fixed mortgage of $400,000 at 6%. Your monthly P&I payment is about $2,398. In the very first month, your payment is split between principal and interest.

**Roughly how much of that first $2,398 payment goes to principal?**

- A) About $400 — most of it is interest in year one
- B) About $1,200 — it's split roughly 50/50
- C) About $2,000 — most of it goes to principal from day one
- D) The full $2,398 — principal first, interest at the end

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: A — about $400**

Month-one interest = $400,000 × (0.06 / 12) = $2,000. So roughly $2,000 of the $2,398 is interest, leaving ~$398 toward principal. That ratio flips slowly over time — by year 22, more than half of each payment goes to principal. This is *why* the early years of a mortgage feel like running in place.

*Concept being tested:* The fundamental shape of an amortization schedule — interest is calculated on the *remaining* balance, so it's front-loaded. Internalizing this changes how a homeowner thinks about extra payments.

</details>

---

## Question 2 — The Cost of Interest Over Time

**Scenario:** You borrow $500,000 at 6% on a 30-year fixed mortgage. You make every payment on time, never pay extra, never refinance.

**Roughly how much total interest will you pay over the life of the loan?**

- A) About $90,000 — barely more than the rate suggests
- B) About $300,000 — a meaningful chunk
- C) About $580,000 — more than the original loan
- D) About $1,000,000 — twice the loan, easily

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: C — about $580,000**

Monthly P&I ≈ $2,998. Over 360 payments that's ~$1,079,000 total. Subtract the $500,000 principal and you've paid roughly $579,000 in interest — *more than the house cost*. This is the math that makes "should I pay extra?" worth taking seriously.

*Concept being tested:* The compounding cost of long-term interest. Most people are surprised by this number. The point isn't "all mortgages are bad" — it's "know what you're signing up for."

</details>

---

## Question 3 — Extra Payment vs. Opportunity Cost

**Scenario:** You have $1,000 of "extra" cash this month. Your mortgage is 3.25% (locked in 2021). Your employer offers a 50% match on 401(k) contributions, but you're not maxing it. You also have a credit card balance at 22% APR.

**Where does the $1,000 go first?**

- A) Pay extra on the mortgage — debt is debt
- B) Knock down the 22% credit card balance
- C) Add it to the 401(k) to capture the match
- D) Split it evenly across all three

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: B — the 22% credit card.**

22% guaranteed return (avoided interest) beats both the 50% match (which requires you to also have the matched contribution) and the 3.25% mortgage by a wide margin. After the credit card is gone, the order is usually: capture the full 401(k) match, *then* think about the mortgage. A 3.25% fixed-rate mortgage in 2026 dollars is one of the cheapest debts most people will ever carry — paying it down early often loses to almost any other use of the money.

*Concept being tested:* Mortgage prepayment is an opportunity-cost question, not a virtue question. The right answer depends on the rate, the match, the alternatives, and the homeowner's psychology. A high-rate mortgage (7%+) changes the math significantly.

</details>

---

## Question 4 — PITI

**Scenario:** Your monthly mortgage payment to the bank is $3,400. You hear the term "PITI" and want to know what it stands for.

**Which of these is the most accurate breakdown?**

- A) Principal, Interest, Taxes, Insurance
- B) Principal, Income, Taxes, Insurance
- C) Payment, Interest, Term, Interest-only
- D) Principal, Interest, Title, Inspection

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: A — Principal, Interest, Taxes, Insurance.**

P&I (principal + interest) is the loan portion — fixed for fixed-rate loans. Taxes and insurance are usually escrowed: the lender collects 1/12 of the annual amount each month and pays the bills on the homeowner's behalf. When property taxes go up or insurance premiums spike, **the escrow portion of the payment changes — even though the loan itself didn't.** That's the source of most "wait, my payment went up?" surprises.

*Concept being tested:* Knowing what's in the payment, what's negotiable (taxes, insurance shopping), and what isn't (the underlying P&I, until you refinance or recast).

</details>

---

## Question 5 — Refinance Break-Even

**Scenario:** You're offered a refinance that lowers your rate by 1.0%. The closing costs are $6,000. The new loan would save you about $200 per month.

**Roughly how long do you need to stay in the home for the refinance to pay off?**

- A) About 12 months
- B) About 30 months (2.5 years)
- C) About 60 months (5 years)
- D) The refinance always pays off — go ahead

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: B — about 30 months.**

$6,000 closing costs ÷ $200/month savings = 30 months to break even. If the homeowner plans to sell or refinance again before then, the math doesn't work. This is the **break-even period** and it's the single most useful number in any refinance conversation.

*Concept being tested:* Refinancing isn't "free money" — it's a trade between upfront cost and ongoing savings. The break-even period turns the question into "how confident am I that I'll stay in this loan for at least N months?" If yes: refinance. If unsure: usually don't.

A more sophisticated answer also considers: the new loan resets the amortization clock, and a 1% rate cut on a recently-originated loan is much more valuable than the same cut on a loan with only 5 years left.

</details>

---

## Question 6 — Recast vs. Prepay vs. Refinance (Stretch Question)

**Scenario:** You just received a $50,000 windfall and want to apply it to your mortgage. Your rate is fine (4.5%) — you don't want to refinance. You have two options at your bank:

1. **Make a $50,000 lump-sum principal payment** (your monthly payment stays the same, but the loan ends earlier).
2. **Pay $50,000 and request a "recast"** (the bank re-amortizes the smaller balance over the original term — your monthly payment drops, but the loan ends on the same date).

**Which of these statements is TRUE?**

- A) Recasting saves you more total interest than a straight prepayment
- B) Both options save the same total interest — the only difference is the monthly payment shape
- C) A straight prepayment saves more total interest than a recast
- D) Recasting is always free; prepaying always has a fee

<details>
<summary>Answer (for Claude's reference)</summary>

**Correct: C — a straight prepayment saves more total interest.**

A lump-sum prepayment without recasting keeps the same monthly payment, so more of each future payment goes to principal — the loan ends years earlier and total interest is lower. A recast keeps the original payoff date but lowers the monthly payment, which means you pay off the smaller balance more slowly relative to the prepay-and-keep-paying scenario.

**When recasting wins:** when cash flow flexibility matters more than maximizing total interest savings (e.g., the homeowner wants the lower monthly payment to free up money for investing or for a job change).

**Practical note:** Most lenders charge a small recast fee ($150–$500). Both options usually require a minimum lump sum.

*Concept being tested:* Three levers — refinance changes the rate, recast changes the payment, prepay shortens the term. Mastery means knowing which lever fits which goal.

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
> **My read on your comfort level:** [emerging / comfortable / confident / mastery] with mortgage fundamentals.
>
> **What I'd suggest next:**
> - If emerging: Let's walk your actual mortgage numbers together — the dashboard's Mortgage view is the easiest place to start.
> - If comfortable: You're ready to think about levers. Want to run a What-If scenario on prepay or recast?
> - If confident: Ready for the intermediate knowledge check (refinance math, ARM mechanics, PMI removal) when you are.
> - If mastery: Let's skip ahead to the advanced tier or work directly on a current decision you're sitting on.
>
> I'll make a note of where we landed so next time we pick up from here. Sound good?"

---

## Journal Entry Template (for Claude to log after the quiz)

```
## [Date] — Mortgage Fundamentals Knowledge Check

- Comfort level: [level]
- Strong areas: [topics]
- Growth areas: [topics]
- User's mortgage on file: [yes/no — if yes, summarize: rate, balance, payoff]
- Notable moments: [any aha-moments, resistance points, or questions they raised]
- Next recommended step: [specific action]
- User's stated feeling: [optional — how did they feel doing this?]
```

---

*Prototype version 0.1 — iterate freely. Adjust question difficulty, tone, and scenarios based on user testing.*
