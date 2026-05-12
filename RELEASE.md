# AI2FI v1.0.0 — First Stable Release

> A coaching platform for people who want to **understand** their money,
> not just track it. Claude plays coach. A local web dashboard shows you
> your own picture. Nothing leaves your machine.

---

## What AI2FI is

Most personal-finance tools collect your data, push you toward a checkout,
and tell you what to do. AI2FI does the opposite: it **teaches you the
framework** and lets your data live on your own machine.

It has two surfaces:

- **Claude is the coach.** Warm, curious, patient. Runs an assessment to
  figure out where you are, asks good questions, explains concepts at the
  right level, and adapts the pace to how you're feeling that week.
- **A local dashboard is the seer.** A small Node + React app that reads
  a spreadsheet on your machine and renders portfolio, net worth,
  retirement, charitable, budget, and education-savings views. Auto-starts
  at login. Serves at `http://localhost:3001`. Nothing is uploaded.

---

## What's new in v1.0.0

- **Retirement Modeling.** Model retirement scenarios across 401(k),
  brokerage, and pension accounts. Editable "what if I retired at X"
  inputs roll the numbers forward; the view summarizes the picture
  end-to-end.
- **Charitable Giving.** A Charitable Trust view that tracks
  contributions, distributions, and tax impact across the year. YTD
  hero, three-scope timeline (YTD / 1Y / 3Y / All), sector pie,
  quarterly running table, sortable Org and Ticker columns, and a
  donation planner that excludes short-term lots.
- **Gain / Loss Harvesting tool.** Surface harvestable lots with running
  proceeds scoped to the rows you've selected, hide realized lots by
  default, and exclude charitable donations from the realized view so
  numbers don't double-count.

---

## Install

The fastest path is one line in Terminal:

```
curl -L https://github.com/anorby515/AI2FI/archive/refs/heads/release.tar.gz | tar xz && cd AI2FI-release && bash dashboard/setup.command
```

Other paths (git clone, ZIP + Finder) are documented on the
[install page](https://anorby515.github.io/AI2FI/#install).

**Your data stays local.** The dashboard runs entirely on `localhost`;
your spreadsheet and notes are gitignored and never leave your machine.
