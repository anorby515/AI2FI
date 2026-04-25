# AI2FI Dashboard — Project Instructions

## Stack
- **Frontend:** React + Vite (`dashboard/client/`)
- **Backend:** Node/Express (`dashboard/server/`)
- **Data:** local JSON + Yahoo Finance (cached server-side)

## Design system (READ BEFORE WRITING UI)

This dashboard uses a custom design system based on the **Bento** direction —
deep navy surfaces, emerald accent (swappable), Inter + JetBrains Mono.

**Source of truth:** `dashboard/client/src/styles/tokens.css` and
`dashboard/client/src/ui/`. Read `dashboard/client/src/ui/README.md` and
`STYLE_HANDOFF.md` (repo root) before touching any component.

### Hard rules
- **Never write a raw hex color** in a `.jsx` or non-token `.css` file.
  Use `var(--accent)`, `var(--ink)`, `var(--pos)`, etc. If you need a new
  color, add it to `tokens.css` first.
- **Compose with primitives** from `src/ui/`: `Card`, `Stat`, `Button`,
  `Segment`, `Chart`, `Sparkline`, `ProgressBar`. Don't reinvent them.
- **Layout CSS lives next to the component** (`MyComponent.css`), scoped by a
  single root class. No new global selectors in `App.css`.
- **Tokens for spacing:** `padding: var(--pad)`, `gap: var(--gap)`.
- **Numbers use the mono stack:** `font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;`.
- **Status colors are semantic.** Gains → `var(--pos)`, losses → `var(--neg)`.
- **Hover lift only for clickable cards.** `<Card hover onClick={…}>`.

### Port status
- ✅ `NetWorthView` — reference implementation.
- ⏳ Everything else — still uses `App.css`. Port screen-by-screen using the
  recipe in `STYLE_HANDOFF.md`. **Do not delete `App.css` until every screen
  is ported.**

### Adding a new screen
1. Compose from `src/ui/` primitives.
2. Put layout rules in `MyScreen.css` next to the JSX.
3. Wire into routing the same way existing screens are.
4. Verify it survives `body.accent-violet` and `body.density-compact` (try in
   DevTools) before considering it done.

## Backend conventions
- API routes live in `dashboard/server/`. Frontend hooks in
  `dashboard/client/src/hooks/usePortfolio.js` already wrap them. Reuse the
  existing hooks; don't fetch directly from components.
- Quotes are cached on disk; `/api/sync` refreshes from Yahoo. Never assume
  live network access in component code.

## Don't
- Don't add Tailwind, styled-components, or another styling library — the
  CSS-variable + per-component CSS pattern is intentional.
- Don't hardcode density-relevant pixel values; use `var(--pad)` etc.
- Don't introduce a new chart library. Use `Chart` for line series; keep
  Recharts only where it already exists for stacked bars / pies / brushes.
