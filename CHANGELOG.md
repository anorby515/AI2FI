# Changelog

All notable changes to AI2FI are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The welcome page at [anorby515.github.io/AI2FI](https://anorby515.github.io/AI2FI/)
fetches this file at runtime and renders the "What's new" section from it, so
every edit here updates the public notes without a rebuild.

## [Unreleased]

### Added
- Static welcome page at `docs/index.html`, served via GitHub Pages from the
  `main` branch `/docs` folder. Covers download, dashboard setup, coach entry
  point, and release notes.
- `CHANGELOG.md` at the repo root. The welcome page fetches it client-side.
- `RELEASING.md` describing the tag-and-release flow.
- "Release process & public surface" section in
  `ai-to-fi-architecture.md`.

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
