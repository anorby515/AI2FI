# core/assets

Static visual assets that live with the project source.

## Files

| File | Used by |
|---|---|
| `banner.txt` | Terminal ASCII banner — printed by setup scripts and the boot experience. |
| `NetWorth.png` | Public welcome page screenshot — Net Worth view (hero shot). |
| `Portfolio.png` | Public welcome page screenshot — Portfolio breakdown. |
| `StockPerformance.png` | Public welcome page screenshot — per-position chart. |
| `Budget.png` | Public welcome page screenshot — Annual Budget view. |
| `ESA.png` | Public welcome page screenshot — Education Savings view. |

## Welcome-page screenshots

The PNGs in this folder are referenced from `docs/index.html` via raw
release-branch URLs:

```
https://raw.githubusercontent.com/anorby515/AI2FI/release/core/assets/<name>.png
```

So the page only shows whatever is on the `release` branch — updates to
these images on `main` are invisible publicly until the next release
fast-forward.

When replacing or adding a screenshot, keep these conventions:

- Capture from the example template (`AI2FI_PROFILE=example npm start`),
  not from a real profile.
- 1600x1000 or larger for the hero (`NetWorth.png`); 1200x800 is fine for
  the rest.
- If you change a filename, update the `<img src=>` paths in
  `docs/index.html` to match.
