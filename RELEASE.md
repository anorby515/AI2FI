# AI2FI v0.2.0 — First Real Release

> A coaching platform for people who want to **understand** their money,
> not just track it. Claude plays coach. A local web dashboard shows you
> your own picture. Nothing leaves your machine.

This is the first release of AI2FI as a finished product. v0.1.0 laid down
the bones; v0.2.0 is the version we'd hand to a friend.

---

## What AI2FI is

Most personal-finance tools collect your data, push you toward a checkout,
and tell you what to do. AI2FI does the opposite: it **teaches you the
framework** and lets your data live on your own machine.

It has two surfaces:

- **Claude is the coach.** Warm, curious, patient. Runs an assessment to
  figure out where you are, asks good questions, explains concepts at the
  right level, and adapts the pace to how you're feeling that week. The
  coaching logic and curriculum live in this repo as plain markdown — no
  proprietary backend.
- **A local dashboard is the seer.** A small Node + React app that reads a
  spreadsheet on your machine and renders portfolio, net worth, budget,
  retirement, and education-savings views. Auto-starts at login. Serves at
  `http://localhost:3001`. Nothing is uploaded.

The two halves are designed to work together. The dashboard answers
"*what does my picture look like right now?*"; the Coach answers "*what
should I do about it, and why?*"

---

## What's in v0.2.0

### The AI Coach
- A **financial check-in** skill (`/financial-check-in`) that runs the
  master assessment, consults the financial order-of-operations, and
  routes you into whichever module fits where you are today.
- **Topic modules** for financial strategy, investing, saving, earning,
  retirement, education savings, and more. Each module is self-contained
  curriculum, knowledge checks at fundamentals → intermediate → advanced,
  and a metadata file the Coach uses to plan its session.
- A **net-worth coaching flow** — the Coach now teaches net worth
  conversationally with a privacy-first protocol: numbers go in your
  spreadsheet, never into the chat.
- **Per-module memory** so the Coach remembers what you've covered, what
  you're working on, and what's next, across sessions and weeks.
- **Knowledge checks** (`/knowledge-check <topic> <level>`) — standalone,
  tiered quizzes that calibrate competency without prescribing answers.

### The dashboard
- **Net Worth view** — composition donut and at-a-glance grid for cash,
  debt, debt ratio, brokerage assets, RSUs, retirement, and education,
  plus a hero line chart over a selectable range.
- **Portfolio** — holdings, allocation, sign-colored returns, dividends
  folded into total-return CAGR / Alpha, and benchmark overlay.
- **Stock performance** — per-position chart with dividends and quotes
  cached locally so you can revisit history without hitting Yahoo every
  time.
- **Annual budget** — income, fixed and variable spend, savings rate.
- **Education savings (529 / ESA)** — per-account progress and
  contribution tracking.
- **Mortgage and refinance calculator** for the housing decisions that
  the Coach can talk you through.
- **First-run experience that just works** — fresh clones render the
  dashboard immediately against a built-in template, with a clear
  "Demo template" banner. The dashboard pivots to your real numbers the
  moment you save your `Finances.xlsx`. No restart needed.
- **Multi-user** — pick a profile name on install; the dashboard reads
  whichever profile is active. Profiles live under
  `user-profiles/<your-name>/private/` and are gitignored.

### Privacy posture
- **Personal financial data is local-first by design.** Your
  spreadsheet, journal, goals, and competency notes live under
  `user-profiles/<you>/` and are gitignored — they never leave the
  machine.
- The Coach is instructed to **never receive line-item financial
  numbers** in chat. You type figures into the spreadsheet yourself; the
  Coach helps you frame the categories.
- The dashboard runs entirely on `localhost`. Yahoo Finance is the only
  outbound call, and quotes are cached on disk.

---

## Install

The fastest path is one line in Terminal:

```
curl -L https://github.com/anorby515/AI2FI/archive/refs/heads/release.tar.gz | tar xz && cd AI2FI-release && bash dashboard/setup.command
```

Other paths (git clone, ZIP + Finder) are documented on the
[install page](https://anorby515.github.io/AI2FI/#install).

---

## What's next

The roadmap that's already taking shape:

- **More modules** — quarterly review templates, additional retirement
  scenarios, charitable-giving frameworks.
- **Calendar integrations** so check-ins surface at the right cadence
  rather than waiting for you to remember.
- **Continued dashboard polish** — porting the remaining views to the
  Bento design system that `NetWorthView` already uses.

If you want to follow along or contribute, the repo is at
[github.com/anorby515/AI2FI](https://github.com/anorby515/AI2FI). The
[architecture doc](https://github.com/anorby515/AI2FI/blob/release/ai-to-fi-architecture.md)
is the source of truth for how the pieces fit together.
