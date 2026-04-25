# AI2FI Design System (PR 1 — Foundation)

This folder holds the Bento-inspired design system. Built in two PRs:

- **PR 1 (this one)** — tokens, theme context, UI primitives, one reference screen ported (`NetWorthView`)
- **PR 2 (next)** — port remaining feature screens (Dashboard, HoldingsList, PositionDetail, ClosedPositions…) and delete legacy `App.css`

## Folder layout

```
src/
  styles/
    tokens.css          ← All design tokens. Edit here; everything else updates.
    ThemeContext.jsx    ← Runtime accent / density / radius switcher.
  ui/
    index.js            ← Public surface. import { Card, Stat, … } from '../ui';
    Card.jsx + .css
    Stat.jsx + .css
    Button.jsx + .css
    Segment.jsx + .css
    Chart.jsx + .css    ← Line chart w/ hover crosshair + tooltip + axes.
    Sparkline.jsx       ← Tiny SVG line for table rows.
    ProgressBar.jsx + .css
  components/
    NetWorthView.jsx    ← Reference screen — ported to use primitives.
    NetWorthView.css    ← Layout-only CSS for this screen (no tokens inlined).
    <others>.jsx        ← Not yet ported. Still use App.css.
  App.css               ← Legacy. Shrinks as each screen is ported. Delete in PR 2.
```

## The rules

1. **Never write raw hex colors in components.** Use `var(--accent)`, `var(--pos)`, `var(--ink-2)` etc.
2. **Never set `font-family` in a component.** Tokens control it.
3. **Spacing: use `var(--pad)`, `var(--gap)`.** Don't invent `padding: 17px`.
4. **Component CSS owns layout only.** `tokens.css` owns look. The boundary is enforced by rule 1.
5. **Each screen gets its own `.css` file** as it's ported. No more global stylesheet.
6. **Accent palette:** emerald (default), blue, violet, amber, rose. Add new ones in `tokens.css` and they just work.

## Using the primitives

```jsx
import { Card, Stat, Segment, Chart } from '../ui';

<Card variant="grad">
  <Stat label="Net worth" value="$2,146,820" size="lg" />
  <Chart data={series} valueFn={fmtUSD} />
</Card>
```

## Changing the theme

The `ThemeProvider` wraps the app in `main.jsx`. Anywhere inside:

```jsx
import { useTheme } from '../styles/ThemeContext';

const { accent, setAccent, density, setDensity } = useTheme();
// setAccent('blue') — UI re-themes live. Persists to localStorage.
```

## Porting a legacy component (the recipe)

1. Copy the old `.jsx`, rename the old to `.legacy.jsx` if you want a backup.
2. At the top, `import { Card, Stat, … } from '../ui';`
3. Replace `<div className="nw-card">` with `<Card>`. Replace scoreboard markup with `<Stat>`.
4. Create `ComponentName.css` alongside — keep only **layout** rules (grid, flex, spacing between cards).
5. Delete the matching rules from `App.css`.
6. Test at every accent: `document.body.className = 'accent-amber'` in the console.

## What still lives in App.css

Everything that hasn't been ported yet — Sidebar, Dashboard, HoldingsList, PositionDetail, ClosedPositions, Welcome, FinancialStrategy, app-header, status-bar. PR 2 takes these out one by one.
