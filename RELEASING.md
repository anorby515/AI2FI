# Releasing AI2FI

This document describes how to cut a release and how a release flows through
to the public welcome page at
[anorby515.github.io/AI2FI](https://anorby515.github.io/AI2FI/).

Keep this process boring on purpose. The welcome page, the `CHANGELOG.md`, and
a git tag are the only moving parts.

---

## What "a release" means here

AI2FI ships as a git repository — users clone or download a ZIP of `main`.
A release is therefore just:

1. A state of `main` that is worth telling users about.
2. A tag on that commit.
3. A GitHub Release attached to the tag, with notes.
4. An updated `CHANGELOG.md` that describes what changed.

There is no build artifact. There is no package registry. There is nothing to
publish anywhere else.

---

## Versioning

We use [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **MAJOR** — a breaking change to the shape of the repo that forces users to
  reinstall the dashboard, re-run the master assessment, or migrate their
  profile. (Example: renaming `user-profiles/` or changing the spreadsheet
  schema.)
- **MINOR** — new module, new skill, new dashboard feature, new core
  framework. Additive.
- **PATCH** — fixes, copy edits, small dashboard tweaks, content corrections.

Pre-1.0 versions (`0.x.y`) treat minor bumps as potentially breaking — that's
normal semver practice and matches the early-project reality.

---

## Release checklist

Run through this every time.

1. **Confirm `main` is green.** Dashboard builds, any tests pass.
2. **Decide the version bump.** Check recent commits since the last tag with
   `git log --oneline $(git describe --tags --abbrev=0)..HEAD`.
3. **Update `CHANGELOG.md`:**
   - Move the relevant lines out of `[Unreleased]` into a new
     `## [X.Y.Z] - YYYY-MM-DD` section.
   - Leave an empty `[Unreleased]` block at the top with the standard
     subheadings (`### Added`, `### Changed`, `### Fixed`, `### Removed`).
   - Update the compare links at the bottom of the file.
4. **Commit** with message `release: vX.Y.Z`.
5. **Tag** the commit: `git tag -a vX.Y.Z -m "AI2FI vX.Y.Z"`.
6. **Push** the branch and the tag: `git push && git push --tags`.
7. **Create the GitHub Release.** In the GitHub UI, "Draft a new release" →
   pick the tag → title `AI2FI vX.Y.Z` → paste the matching section from
   `CHANGELOG.md` as the body (or click "Generate release notes" and
   reconcile).
8. **Verify the welcome page.** Visit
   [anorby515.github.io/AI2FI](https://anorby515.github.io/AI2FI/) and confirm
   the "What's new" section reflects the new release. GitHub Pages usually
   updates within a minute or two.

---

## How the welcome page picks up the notes

The welcome page is static HTML at `docs/index.html`, served by GitHub Pages
from the `main` branch `/docs` folder. It does **not** need to be rebuilt when
the changelog changes.

At page load it runs:

```
fetch('https://raw.githubusercontent.com/anorby515/AI2FI/main/CHANGELOG.md')
```

and renders the result with [marked](https://marked.js.org/) (loaded from a
CDN). Two consequences:

- Updating `CHANGELOG.md` on `main` is sufficient to update the public notes.
  No HTML edit, no rebuild.
- If the fetch fails (offline, CDN down, raw.githubusercontent.com blocked),
  the section falls back to a link to `CHANGELOG.md` on GitHub.

---

## First-time GitHub Pages setup

Do this once, then never again.

1. Go to the repo → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to `main` and the folder to `/docs`. Click **Save**.
4. Wait ~1–2 minutes. The URL will be
   `https://anorby515.github.io/AI2FI/`.
5. Optional: add that URL to the repo's "About" sidebar on the main GitHub
   page so it's discoverable.

---

## What does *not* go in a release

- **Anything under `user-profiles/<name>/`.** That's user data, gitignored,
  never committed. The template `user-profiles/example/` is the only profile
  path that lives on `main`.
- **`internal/`.** Dev backlog, drafts, working notes. Gitignored.
- **Build output, logs, caches.** See `.gitignore`.

If a change is user-facing but *content only* (new module curriculum, a
knowledge-check revision, a new scenario), it still counts as a release —
content is the product. Bump the minor version and write it up in the
changelog.

---

## Hotfix flow

For urgent fixes (dashboard broken on install, wrong number in a
curriculum file):

1. Branch from `main`, fix, open a PR, merge.
2. Follow the same checklist above with a `PATCH` bump.
3. In the release body, lead with what was broken and the user-visible impact.
