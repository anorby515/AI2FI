# Welcome-page screenshots

These images are referenced from `docs/index.html` and rendered in the
"5. Screenshots" section of the public welcome page at
[anorby515.github.io/AI2FI](https://anorby515.github.io/AI2FI/).

## Expected files

| Filename | Subject | Recommended size |
|---|---|---|
| `networth.png` | Net Worth view — composition donut + value grid | ~1600x1000 (full-width hero shot) |
| `portfolio.png` | Portfolio chart with sign-colored dots and benchmark | ~1200x800 |
| `moat.png` | Moat Analysis card | ~1200x800 |

The first image is rendered full-width on the page; the remaining two sit
side-by-side on screens wider than 600px.

## Capturing

1. Run the dashboard locally with the example template loaded
   (`AI2FI_PROFILE=example npm start` from `dashboard/`).
2. Hide any private data — the example template is the only profile that
   should ever appear in published screenshots.
3. Use macOS `Cmd-Shift-4`, then drop the PNGs into this directory using
   the filenames above.
4. Commit, push, merge into `release`. The page picks them up on the
   next GitHub Pages deploy (~1 minute).

## Adding new screenshots

To add a fourth (or fifth) shot, drop the PNG here and edit the `.shots`
grid inside `docs/index.html`. Keep the responsive 1-up + 2-up layout in
mind — the first shot is featured.
