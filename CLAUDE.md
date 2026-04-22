# AI2FI — Claude Context

A local-first financial coaching platform. Claude is the coach; a local web dashboard visualizes data. All personal data lives on the user's machine — nothing is transmitted.

---

## Directory map

| Path | Purpose |
|---|---|
| `core/` | Platform-wide content: master assessment, financial order of operations, temperament tracker, boot experience |
| `modules/` | Topic modules — each is a self-contained directory (curriculum, knowledge checks, scenarios, `metadata.md`) |
| `skills/` | Claude-side skills: `financial-check-in`, `module-coach`, `knowledge-check` |
| `user-profiles/<name>/` | Per-user journal, goals, competency, scenarios, research — **gitignored, never commit** |
| `user-profiles/<name>/private/` | Personal financial files (xlsx, csv, bank statements) — **gitignored, never commit** |
| `user-profiles/example/` | Template only — the one profile folder that is committed |
| `dashboard/` | Local Node/Express + Vite/React web app |
| `internal/` | Dev backlog and working notes — **gitignored, never commit** |

---

## Key conventions

**Modules are self-contained.** Each module in `modules/` owns its curriculum, knowledge checks, scenarios, and `metadata.md`. Never spread a module's content across directories.

**Skills orchestrate; modules contain content.** Skills in `skills/` load content from `modules/` and `core/`. They don't contain curriculum themselves.

**User profiles are local only.** Everything under `user-profiles/<name>/` is the user's private data. Only `user-profiles/example/` (the template) and `user-profiles/README.md` are committed.

---

## Where new content goes

| What | Where |
|---|---|
| New coaching module | `modules/<topic>/` — add `curriculum.md`, `metadata.md`, and at least one knowledge check |
| New skill | `skills/<skill-name>/SKILL.md` |
| Platform-wide logic or frameworks | `core/` |
| User session notes, goals, competency | `user-profiles/<name>/` (gitignored — written by Claude at session close) |
| Personal financial files | `user-profiles/<name>/private/` (gitignored) |
| Stock or asset research | `user-profiles/<name>/research/` (gitignored) |
| Named financial scenarios | `user-profiles/<name>/scenarios/` (gitignored) |
| Dev backlog, working notes, drafts | `internal/` (gitignored) |

---

## What is always gitignored

- All of `user-profiles/<name>/` (only `example/` and `README.md` are committed)
- `dashboard/server/cache/`, `dashboard/scripts/cache/`, `server/cache/`
- `dashboard/logs/`
- `internal/`
- `.env`, `node_modules/`, build output (`dist/`)
- `.claude/settings.local.json` (per-machine Claude Code permissions)
