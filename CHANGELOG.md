# Changelog

All notable changes to AI2FI are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The welcome page at [anorby515.github.io/AI2FI](https://anorby515.github.io/AI2FI/)
fetches this file at runtime and renders the "What's new" section from it, so
every edit here updates the public notes without a rebuild.

## [Unreleased]

### Added
- **Dashboard template-fallback pattern.** The web app now reads
  `user-profiles/<name>/private/Finances.xlsx` first and falls back to
  the committed `core/sample-data/Financial Template.xlsx` when the
  user's file doesn't exist yet. Result: a fresh clone renders a fully
  functional dashboard immediately, and the moment the Coach copies
  the template into the user's profile, the dashboard pivots to the
  user's data on the next poll without a server restart. Implemented
  in `server/profile-resolver.js → resolveSpreadsheet()`; every xlsx-
  reading route uses it.
- **`/api/profile.isTemplate` flag** (replaces the old `isSampleData`).
  True whenever the dashboard is reading from the committed template.
  The client uses it to render a sticky "Demo template" banner across
  all views and to pin a "Getting Started" entry to the top of the
  sidebar. Banner copy explicitly names the template path so the user
  always knows whose data they're looking at.
- **`/api/sync` write-guard.** Refuses to run when `isTemplate === true`
  so the splits / quotes / benchmark caches don't get polluted with
  template tickers. The user must copy the template into their profile
  before sync becomes available.

### Changed
- **Spreadsheet placement is now Coach-driven.** `dashboard/setup.command`
  no longer auto-seeds `private/Finances.xlsx`. The Coach asks for
  consent during the Module Build Out flow, explains the local /
  gitignored privacy posture, and copies the template into the profile
  on a yes. Procedure: `core/finances-template-setup.md`.
- **`core/sample-data/Finances.xlsx` renamed to
  `core/sample-data/Financial Template.xlsx`** to make its role
  unambiguous: it is a structural template, not the user's live file.
  The Coach also drops a reference copy at
  `user-profiles/<name>/Financial Template.xlsx` in addition to the
  live `private/Finances.xlsx`.
### Added
- `core/module-memory.md` — per-module memory spec defining where
  module state persists, the sub-topic schema, and the Coach's
  read/write protocol at session boundaries.
- `core/finances-template-setup.md` — Coach consent + copy procedure +
  Accounts-sheet walkthrough. Runs as the first step of Module Build
  Out, before any sub-topic teaching begins.
- `modules/financial-strategy/topics/net-worth-tracking.md` — first
  sub-topic content under the new flat-modules + sub-topics
  convention. Reference / spec layer (definitions, traps, readiness,
  memory schema). The conversational coaching script is queued as the
  next task.

### Removed
- The auto-seed block in `dashboard/setup.command`. The `.sample-data`
  marker is no longer written by setup; the Coach manages
  template-vs-live state via module memory instead.

### Previously (before this revision)
- **Functional first-run experience with sample data.** Setup
  previously seeded new profiles from `core/sample-data/Finances.xlsx`
  on first install with a `.sample-data` marker. Replaced by the
  Coach-driven flow above.
- **"Getting Started" dashboard view** (`client/src/components/GettingStarted.jsx`).
  Selected by default when the server reports `isSampleData: true`.
  Explains that the user is looking at demo data, and points them into
  Claude to run the boot-experience onboarding (`let's start my financial
  journey` / `/financial-check-in`).
- **Sticky "sample data" banner** across other dashboard views when
  running on seeded data, with a one-click jump back to Getting Started.
- `/api/profile` now returns `isSampleData` based on the marker file.
- `core/sample-data/` directory with a README documenting the seeding
  mechanism, shape expectations, and teardown path.
- `Welcome-to-AI2FI.html` at the repo root — a local, path-aware welcome
  page users double-click after unzipping. Browsers don't hit Gatekeeper,
  so the file opens immediately. JavaScript inspects `window.location` to
  detect the folder's absolute path and pre-fills a copy-to-clipboard
  install command with that path already baked in. Renders the local
  `CHANGELOG.md` (works offline); falls back to a GitHub link if the
  local read fails.
- Static welcome page at `docs/index.html`, served via GitHub Pages from
  the `main` branch `/docs` folder. Mirrors the same 4-section structure
  (Install / After install / Start coaching / What's new). Terminal-style
  branding with macOS title bar and pixel wordmark.
- `CHANGELOG.md` at the repo root. Single source of truth for release
  notes; rendered by both welcome pages.
- `RELEASING.md` describing the tag-and-release flow.
- "Release process & public surface" section in
  `ai-to-fi-architecture.md`.
- One-line Terminal install path as the recommended way to set up the
  dashboard (`curl ... | tar xz && cd ... && bash dashboard/setup.command`)
  — avoids the macOS Gatekeeper block that affects Finder double-clicks of
  `.command` files downloaded from the internet.

### Changed
- **Dashboard is now multi-user.** The previously hardcoded `andrew` profile
  has been replaced with a profile resolver at
  `dashboard/server/profile-resolver.js`. Resolution order: `AI2FI_PROFILE`
  env var → `.ai2fi-config` at repo root → auto-detect the first non-`example`
  directory under `user-profiles/`. All five call sites (server index,
  portfolio, networth, moat, profile routes) use the resolver instead of
  baking in a username.
- **Onboarding empty state.** When the server has no profile configured or
  no spreadsheet, endpoints return a structured `{ noProfile | noSpreadsheet }`
  404 instead of a generic 500. The client renders a new
  `OnboardingEmptyState` component with concrete "create your profile /
  drop in your spreadsheet" instructions — replacing the old red
  "Server error 500" screen that every new user was hitting.
- **`setup.command` configures the profile.** Prompts for a profile name
  on first run (or auto-detects if a non-example folder already exists),
  creates `user-profiles/<name>/private/` + `research/`, and writes
  `.ai2fi-config` at the repo root. Skips the prompt if a config already
  exists.
- **`FinancialStrategy.jsx` resolves the profile dynamically** — fetches
  `/api/profile` first to learn the active user's name, then loads that
  user's `financial-dashboard.md`. Handles `no-profile` and `no-artifact`
  states with their own messaging.
- Welcome page restructure: `1. Install` now presents three paths ranked by
  friction (one-line, git clone, ZIP+Finder); `2. After install` covers
  spreadsheet placement and uninstall.
- `README.md` expanded to the same 4-section structure so the GitHub repo
  page shows the full welcome. Layout block updated to include
  `Welcome-to-AI2FI.html`.
- `dashboard/README.md` Gatekeeper instructions updated for macOS 15+
  (System Settings → Privacy & Security → Open Anyway). The old right-click
  → Open trick no longer works on Sequoia and newer.

### Added (continued)
- `GET /api/profile` endpoint returns the active profile's name and a list
  of all configured profiles. Lets the client discover the current user
  instead of hardcoding one.
- `.ai2fi-config` (gitignored) at the repo root is the per-machine pointer
  to the active profile.

## [0.1.0] - 2026-04-18

Initial public layout of the project.

### Added
- Two-surface architecture: Claude as coach, local dashboard as viewer.
- `core/` with the master financial order-of-operations, master assessment,
  and temperament tracker.
- `modules/` with the first encapsulated topic modules, each carrying its own
  curriculum, knowledge checks, scenarios, and `metadata.md`.
- `skills/` — `financial-check-in`, `module-coach`, `knowledge-check`.
- `dashboard/` — Node/Express + Vite/React app that reads a local spreadsheet
  and serves at `http://localhost:3001`. Ships with `setup.command` and
  `uninstall.command` for one-click macOS install via `launchd`.
- `user-profiles/example/` template; all other profile folders gitignored.
- Architecture doc (`ai-to-fi-architecture.md`) as the design source of truth.

[Unreleased]: https://github.com/anorby515/AI2FI/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anorby515/AI2FI/releases/tag/v0.1.0
