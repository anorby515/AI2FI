# AI2FI

> **New here?** If you've already downloaded this repo, double-click `Welcome-to-AI2FI.html` — it's a local, path-aware welcome page with a one-step install.
> Otherwise, visit the [hosted welcome page](https://anorby515.github.io/AI2FI/).

A coaching platform for people who want to understand their money, not just track it. Claude plays coach — warm, curious, patient — and a local web dashboard gives you a place to see your own financial picture while you work through the material.

The intent is the opposite of most finance tools: instead of collecting your data and telling you what to do, AI2FI teaches you the framework and lets your data live on your own machine. Nothing is uploaded. No account to create.

## Two surfaces

**Claude** handles the thinking work — assessing where you are, asking good questions, explaining concepts, and adapting the pace to how you're feeling that week. The coaching logic lives in `skills/` and the curriculum content lives in `core/` and `modules/`.

**The dashboard** handles the seeing work — charts and tables built from a spreadsheet on your machine (`user-profiles/<you>/private/Finances.xlsx`). It's a small Node + React app in `dashboard/` that auto-starts on login and serves `http://localhost:3001`.

The architecture doc (`ai-to-fi-architecture.md`) is the source of truth for how the pieces fit together. Read that before making structural changes.

## 1. Install

Three ways, ranked by least friction. All end with the dashboard running at `http://localhost:3001` and auto-starting at login.

**Option A — one-line Terminal install (recommended):**
```
curl -L https://github.com/anorby515/AI2FI/archive/refs/heads/main.tar.gz | tar xz && cd AI2FI-main && bash dashboard/setup.command
```
Downloads, unpacks, installs. No Gatekeeper prompt, no rename. This is how Homebrew, rustup, and nvm all ship.

**Option B — git clone:**
```
git clone https://github.com/anorby515/AI2FI.git
cd AI2FI
bash dashboard/setup.command
```
Good if you already have `git`. Files cloned via git aren't quarantined, so double-clicking `setup.command` in Finder also works.

**Option C — ZIP download + Finder:**

Download [AI2FI.zip](https://github.com/anorby515/AI2FI/archive/refs/heads/main.zip), unzip it, and **double-click `Welcome-to-AI2FI.html`** at the top level. That page has a path-aware install command and walks through the rest.

> **Finder path hits Gatekeeper.** If you try to double-click `dashboard/setup.command` directly from a ZIP download on macOS 15+, you'll see a "cannot be opened" dialog. Options A and B above avoid this entirely. If you hit it: **System Settings → Privacy & Security** → scroll down → **Open Anyway**.

## 2. After install

When the installer finishes, your browser opens `http://localhost:3001` and you're looking at the dashboard. It auto-starts every time you log into your Mac.

**Drop in your spreadsheet.** The dashboard reads a local spreadsheet to render portfolio, net worth, and benchmark views. Put yours at `user-profiles/<your-name>/private/Finances.xlsx`. Start from `user-profiles/example/` as a template. Everything under your profile folder is gitignored — it never leaves your machine.

**Uninstall:** `bash dashboard/uninstall.command` from the repo root.

## 3. Start coaching with Claude

The dashboard is the "seeing" half. Claude is the "thinking" half — and that's where the work happens.

Open Claude Code, Claude Desktop, or [claude.ai/code](https://claude.ai/code) with the AI2FI folder as the working directory. Then in Claude, type:

```
/financial-check-in
```

That's the front door. It runs the master assessment, consults the financial order-of-operations, and routes you into the right module. First-time users get the full two-pass assessment; returning users get the lightweight check-in.

Other skills you can call directly:

- `/module-coach <module-name>` — dives into one topic (e.g. `/module-coach investing`).
- `/knowledge-check <topic> <level>` — standalone quiz, tiered fundamentals → intermediate → advanced.

## 4. What's new

Release notes are in [`CHANGELOG.md`](./CHANGELOG.md). The local `Welcome-to-AI2FI.html` renders them automatically; the [hosted welcome](https://anorby515.github.io/AI2FI/) fetches the latest.

## Layout

```
AI2FI/
├── Welcome-to-AI2FI.html       # Double-click after unzip — local welcome + install
├── README.md                   # You are here
├── CHANGELOG.md                # Release notes (rendered by the welcome pages)
├── RELEASING.md                # How to cut a release
├── ai-to-fi-architecture.md    # Source of truth — read first
├── core/                       # Platform-wide content (assessment, order of operations, temperament tracker)
├── docs/                       # Hosted welcome page (GitHub Pages)
├── modules/                    # Topic modules (investing, saving, earning, etc.)
├── skills/                     # Claude-side skills (financial-check-in, module-coach, knowledge-check)
├── user-profiles/              # Per-user journals, goals, competency, research (gitignored except example/)
│   └── example/                # Template
└── dashboard/                  # Local web app (Node/Express + Vite/React)
    └── README.md               # Dashboard setup, dev workflow, troubleshooting
```

## Principles

A few things that aren't negotiable, pulled forward so they're hard to miss:

- **Never collect personal financial data.** The user's numbers stay on the user's machine, full stop. The dashboard reads a local spreadsheet; nothing is transmitted.
- **Teach, don't prescribe.** The goal is comfort and confidence with the material — not compliance with a playbook. The comfort scale (emerging → comfortable → confident → mastery) lives in `core/` and drives pacing.
- **Warm, curious, never condescending.** Applies to every Claude-facing piece of content.

The architecture doc has the full version of the design principles.
