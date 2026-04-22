# User Profiles

Each user's coaching data lives in its own folder here. Everything under `<your-name>/` is gitignored — your journal, goals, competency tracking, research notes, and financial files stay on your machine only.

## Getting started

Copy the `example/` folder and rename it to anything you like (your name, a handle, whatever):

```
cp -r user-profiles/example user-profiles/your-name
```

Then open `skills/financial-check-in/SKILL.md` in Claude and run `/financial-check-in` — it will populate your profile files from there.

## Folder structure

```
your-name/
├── journal.md              # Session history — updated by Claude each session
├── goals.md                # Active goals and revision log
├── competency.md           # Per-topic comfort levels over time
├── financial-dashboard.md  # Quarterly strategy snapshot
├── private/                # Personal financial files (xlsx, csv, statements)
├── research/               # Asset and investment research notes
└── scenarios/              # Named financial scenario documents
```

Everything in `private/` is for your financial data files (e.g., `Finances.xlsx`) that the dashboard reads locally. None of it is ever transmitted anywhere.
