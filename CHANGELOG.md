# Changelog

All notable changes to AI2FI are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The welcome page at [anorby515.github.io/AI2FI](https://anorby515.github.io/AI2FI/)
fetches this file at runtime and renders the "What's new" section from it, so
every edit here updates the public notes without a rebuild.

## [Unreleased]

### Added
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
- Welcome page restructure: `1. Install` now presents three paths ranked by
  friction (one-line, git clone, ZIP+Finder); `2. After install` covers
  spreadsheet placement and uninstall.
- `README.md` expanded to the same 4-section structure so the GitHub repo
  page shows the full welcome. Layout block updated to include
  `Welcome-to-AI2FI.html`.
- `dashboard/README.md` Gatekeeper instructions updated for macOS 15+
  (System Settings → Privacy & Security → Open Anyway). The old right-click
  → Open trick no longer works on Sequoia and newer.

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
