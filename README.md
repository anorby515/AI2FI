# AI2FI

> **New here?** The [welcome page](https://anorby515.github.io/AI2FI/) walks through download, setup, and how to start coaching with Claude.

A coaching platform for people who want to understand their money, not just track it. Claude plays coach — warm, curious, patient — and a local web dashboard gives you a place to see your own financial picture while you work through the material.

The intent is the opposite of most finance tools: instead of collecting your data and telling you what to do, AI2FI teaches you the framework and lets your data live on your own machine. Nothing is uploaded. No account to create.

## Two surfaces

**Claude** handles the thinking work — assessing where you are, asking good questions, explaining concepts, and adapting the pace to how you're feeling that week. The coaching logic lives in `skills/` and the curriculum content lives in `core/` and `modules/`.

**The dashboard** handles the seeing work — charts and tables built from a spreadsheet on your machine (`user-profiles/<you>/private/Finances.xlsx`). It's a small Node + React app in `dashboard/` that auto-starts on login and serves `http://localhost:3001`.

The architecture doc (`ai-to-fi-architecture.md`) is the source of truth for how the pieces fit together. Read that before making structural changes.

## Layout

```
AI2FI/
├── ai-to-fi-architecture.md    # Source of truth — read first
├── CHANGELOG.md                # Release notes (fetched by the welcome page)
├── RELEASING.md                # How to cut a release
├── core/                       # Platform-wide content (assessment, order of operations, temperament tracker)
├── docs/                       # Static welcome page, served via GitHub Pages
├── modules/                    # Topic modules (investing, saving, earning, etc.)
│   └── investing/
├── skills/                     # Claude-side skills (financial-check-in, module-coach, knowledge-check)
├── user-profiles/              # Per-user journals, goals, competency, research
│   └── andrew/
│       └── private/            # Personal financial data — gitignored, never leaves the machine
└── dashboard/                  # Local web app (Node/Express + Vite/React)
    └── README.md               # Setup, dev workflow, troubleshooting
```

## Getting started

If you just want the dashboard running: open `dashboard/` in Finder and double-click `setup.command`. Details, caveats, and how to uninstall are in `dashboard/README.md`.

If you want to understand the design first: read `ai-to-fi-architecture.md`, then skim one of the skills in `skills/` to see how coaching is structured.

## Principles

A few things that aren't negotiable, pulled forward so they're hard to miss:

- **Never collect personal financial data.** The user's numbers stay on the user's machine, full stop. The dashboard reads a local spreadsheet; nothing is transmitted.
- **Teach, don't prescribe.** The goal is comfort and confidence with the material — not compliance with a playbook. The comfort scale (emerging → comfortable → confident → mastery) lives in `core/` and drives pacing.
- **Warm, curious, never condescending.** Applies to every Claude-facing piece of content.

The architecture doc has the full version of the design principles.
