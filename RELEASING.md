# Releasing AI2FI

This document describes how to cut a release and how a release flows through
to the public welcome page at
[anorby515.github.io/AI2FI](https://anorby515.github.io/AI2FI/).

Keep this process boring on purpose. The welcome page, the `RELEASE.md`,
the `VERSION` / `version.json` files, the `release` branch, and a git tag
are the only moving parts.

---

## What "a release" means here

AI2FI ships as a git repository — users clone or download a ZIP of the
`release` branch. A release is therefore:

1. A state of `main` that is worth telling users about, fast-forwarded onto
   the long-lived `release` branch.
2. A tag (`vX.Y.Z`) on that commit.
3. A GitHub Release attached to the tag, with notes.
4. An updated `RELEASE.md`, `VERSION`, and `version.json` that describe
   what changed and what version the public is now seeing.

There is no build artifact. There is no package registry. The welcome page
and the release ZIP are both served straight from the `release` branch.

---

## Branch model

| Branch | Role |
|---|---|
| `main` | Active development. May contain unreleased work. **Not** the source for the public welcome page. |
| `release` | Long-lived. Always points at the latest published release. GitHub Pages serves from here. The "Download ZIP" button on the welcome page is `archive/refs/heads/release.zip`. |
| `vX.Y.Z` (tags) | Immutable snapshots of `release` at each version. |

The benefit of separating `release` from `main`: the public site only ever
shows shipped notes and shipped code. Anything in `[Unreleased]` on `main`
is invisible to users until the release branch is fast-forwarded.

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
3. **Rewrite `RELEASE.md`** as the public summary for this version:
   - Lead with `# AI2FI vX.Y.Z` and a one-line tagline.
   - High-level, user-facing only — what someone actually sees or does
     differently. No file paths, class names, or implementation detail
     (those belong in commit messages and PR descriptions).
   - Group by *AI Coach*, *Dashboard*, *Privacy posture* (or whatever
     groupings the release suggests). Past releases are not preserved
     here — the file always describes the current release.
4. **Bump `VERSION` and `version.json`** at the repo root:
   - `VERSION` — single line, e.g. `0.2.0`.
   - `version.json` — update `version`, `released` (today's date), and
     `tag` (`vX.Y.Z`). Leave `branch`, `downloadUrl`, `tarballUrl`,
     `releasesUrl`, and `releaseNotesUrl` alone — they reference the
     `release` branch and don't change between versions.
5. **Commit on `main`** with message `release: vX.Y.Z`.
6. **Fast-forward `release` to `main`:**

   ```sh
   git checkout release
   git merge --ff-only main
   git checkout main
   ```

   If `release` has diverged (it shouldn't), investigate before forcing.
7. **Tag the commit:** `git tag -a vX.Y.Z -m "AI2FI vX.Y.Z"`.
8. **Push everything:** `git push origin main release && git push --tags`.
9. **Create the GitHub Release.** In the GitHub UI, "Draft a new release" →
   pick the tag → title `AI2FI vX.Y.Z` → paste `RELEASE.md` as the body
   (or click "Generate release notes" and reconcile).
10. **Verify the welcome page.** Visit
    [anorby515.github.io/AI2FI](https://anorby515.github.io/AI2FI/) and
    confirm:
    - The version pill in the hero reads `vX.Y.Z · released YYYY-MM-DD`.
    - The "Download release" card shows the new version.
    - The "What's in this release" section renders the new `RELEASE.md`.

    GitHub Pages usually updates within a minute or two.

---

## How the welcome page picks up the release

The welcome page is static HTML at `docs/index.html`, served by GitHub Pages
from the `release` branch's `/docs` folder. It does **not** need to be
rebuilt when `RELEASE.md` or `version.json` changes.

At page load it runs:

```
fetch('https://raw.githubusercontent.com/anorby515/AI2FI/release/version.json')
fetch('https://raw.githubusercontent.com/anorby515/AI2FI/release/RELEASE.md')
```

and renders the result. Three consequences:

- Updating `RELEASE.md` and `version.json` on `release` is sufficient to
  update the public surface. No HTML edit, no rebuild.
- The page only sees what is on `release` — anything on `main` that hasn't
  been fast-forwarded into `release` is invisible to users.
- If a fetch fails (offline, CDN down, raw.githubusercontent.com blocked),
  the affected section falls back to a sensible default and a link to
  GitHub.

---

## First-time GitHub Pages setup

Do this once after creating the `release` branch, then never again.

1. Create the `release` branch locally and push it:

   ```sh
   git checkout -b release
   git push -u origin release
   git checkout main
   ```

2. Go to the repo → **Settings** → **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set **Branch** to `release` and the folder to `/docs`. Click **Save**.
5. Wait ~1–2 minutes. The URL will be
   `https://anorby515.github.io/AI2FI/`.
6. Optional: add that URL to the repo's "About" sidebar on the main GitHub
   page so it's discoverable.

If you previously had Pages serving from `main` / `/docs`, this step
**replaces** that configuration. The same URL keeps working; only the
source branch changes.

---

## What does *not* go in a release

- **Anything under `user-profiles/<name>/`.** That's user data, gitignored,
  never committed. The template `user-profiles/example/` is the only profile
  path that lives on `main` or `release`.
- **`internal/`.** Dev backlog, drafts, working notes. Gitignored.
- **Build output, logs, caches.** See `.gitignore`.

If a change is user-facing but *content only* (new module curriculum, a
knowledge-check revision, a new scenario), it still counts as a release —
content is the product. Bump the minor version and write it up in
`RELEASE.md`.

---

## Hotfix flow

For urgent fixes (dashboard broken on install, wrong number in a
curriculum file):

1. Branch from `main`, fix, open a PR, merge.
2. Follow the same checklist above with a `PATCH` bump.
3. In the release body, lead with what was broken and the user-visible impact.

If the fix is so urgent it can't wait for the next planned release, that's
fine — the checklist is the same regardless of how much else is in the
release.
