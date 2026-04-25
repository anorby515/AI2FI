# AI2FI — Style System Handoff

## What changed

A new design system replaces the monolithic `dashboard/client/src/App.css`.
**`NetWorthView`** is the reference implementation. Your job is to port the
remaining screens to use the same primitives, then delete `App.css`.

## Where things live

```
dashboard/client/src/
├── styles/
│   ├── tokens.css           ← all design tokens (colors, radii, spacing, fonts, shadows)
│   └── ThemeContext.jsx     ← useTheme(): { accent, density, radius, setAccent, ... }
└── ui/
    ├── README.md            ← rules for using the primitives — READ THIS FIRST
    ├── index.js             ← barrel import
    ├── Card / Stat / Button / Segment / ProgressBar / Sparkline / Chart
    └── *.css                ← per-component styles
```

`tokens.css` is loaded in `main.jsx` BEFORE `index.css` and `App.css`. Body
classes (`accent-blue`, `density-compact`, `radius-square`) switch the live
palette by overriding the CSS custom properties — never hardcode a hex value
in a component.

## The ten rules (also in ui/README.md)

1. **Never write a raw color in a component.** Use `var(--accent)`, `var(--ink)`,
   `var(--pos)`, `var(--neg)`, etc. The whole system breaks if you do.
2. **Compose with primitives first.** A "stat tile" is `<Card><Stat /></Card>`,
   not a new bespoke div.
3. **Layout CSS lives next to the component** as `MyComponent.css`, scoped by a
   single root class (e.g. `.networth-view`). No selectors leak globally.
4. **Use the design tokens for spacing too.** `padding: var(--pad)`, not `22px`.
5. **`Chart` is the line-chart primitive.** Use it for everything time-series
   that's bigger than a sparkline. Recharts is allowed only where the chart
   type isn't a line (stacked bars, treemaps, pies) — but prefer rebuilding in
   SVG against tokens if you can.
6. **Status colors are semantic, not literal.** Gain → `var(--pos)`, loss →
   `var(--neg)`. Don't pick `#34d399` directly.
7. **Density-aware spacing** — use `var(--pad)` and `var(--gap)` so
   `body.density-compact` actually does something.
8. **Numbers use mono.** Add `font-family: var(--font-mono); font-variant-numeric:
   tabular-nums;` to anything where digits should align across rows.
9. **Tables: header row uses uppercase 10.5px dim labels. Rows: 14px ink. Hover
   row → `background: var(--card-hi)`.** Same pattern across every table.
10. **Hover lift only for clickable cards.** Use `<Card hover onClick={...} />`,
    not custom transforms.

## Port recipe (per screen)

Take any screen that still uses `App.css` classes and do this:

1. Create `MyScreen.css` next to the component. Move its layout rules out of
   `App.css` into a single `.my-screen { ... }` scope. Replace every hex with
   `var(--…)`.
2. Replace bespoke divs:
   - `<div className="card">` → `<Card>` or `<Card variant="grad">`
   - `<div className="stat">label + big number` → `<Stat label="..." value="..." />`
   - `<button className="tab active">` (group) → `<Segment options={[...]} />`
   - Inline-styled `<div className="bar">` → `<ProgressBar value={n} max={m} />`
   - Tiny SVG/canvas spark → `<Sparkline data={...} />`
   - Recharts line/area chart → `<Chart data={...} valueFn={...} labelFn={...} />`
3. Delete the now-unused rules from `App.css`.
4. Confirm the screen still works against the same backend endpoints — no API
   contracts change in this handoff.
5. Run the app, click through the screen, confirm parity.

## Port order (suggested)

1. **Dashboard.jsx** — heavy stat tiles, easy win. Use `Card` + `Stat`.
2. **HoldingsList.jsx** — the table pattern. Define this once and the rest of
   the tables fall in line.
3. **PositionDetail.jsx** — uses `Chart` for price history; reuse the table
   styling from HoldingsList.
4. **ClosedPositions.jsx** — table, mirrors HoldingsList.
5. **LossHarvesting.jsx** — table.
6. **Sidebar.jsx + App.jsx header/status-bar** — the chrome. Restyle last;
   touching it changes every page at once.
7. **Welcome.jsx, ComingSoon.jsx, CollegeView.jsx, FinancialStrategy.jsx,
   MoatCard.jsx** — sweep through these.
8. **PortfolioChart.jsx, PortfolioPies.jsx** — keep Recharts here, but restyle
   tooltips/grids to use `var(--…)`.
9. **Delete `App.css`.** Verify nothing visually regresses.

## Theme switching

`useTheme()` exposes `setAccent('emerald' | 'blue' | 'violet' | 'amber' | 'rose')`,
`setDensity('comfortable' | 'compact')`, `setRadius('pillowy' | 'standard' |
'square')`. Persisted to localStorage. Wire a small theme picker into the
status bar or settings menu when convenient.

## Done = these are true

- `App.css` is deleted.
- No component file contains a hex code (other than `tokens.css`).
- Every screen renders correctly with `body.accent-violet` set in DevTools.
- Every screen renders correctly with `body.density-compact` set.
- The Net Worth page still looks like the reference.
