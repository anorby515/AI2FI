---
name: create-release
description: Cut a new AI2FI release end-to-end. Reads VERSION, proposes the next minor bump, updates all version-bearing files (VERSION, version.json, RELEASE.md), commits on main, fast-forwards the release branch, tags, pushes, and creates the GitHub Release. Single command replaces the whole RELEASING.md checklist.
---

# Create Release

Cuts a new AI2FI release in one go. Replaces the manual ten-step checklist
in `RELEASING.md` with a single guided flow.

> Invoke as `/create-release` — Claude Code's slash-command discovery
> matches `/cre…` so `/createrelease` typed casually also resolves.

---

## What this skill does

1. Pre-flight checks — clean tree, on `main`, in sync with origin, required files present.
2. Reads current version from `VERSION`, proposes the next minor bump.
3. Confirms the version with the user (default = bump minor; user can override with any valid semver).
4. Confirms the user has updated `RELEASE.md` for this release.
5. Updates `VERSION`, `version.json`, and the `RELEASE.md` H1 to the new version.
6. Commits on `main` with message `release: vX.Y.Z`.
7. Fast-forwards `release` to `main` and pushes — this is the actual publish.
8. Creates and pushes an annotated tag `vX.Y.Z`.
9. Creates the GitHub Release with `gh release create`, using `RELEASE.md` as the body.
10. Reports verification URLs.

The skill **never deletes prior tags or releases.** Each release is a
historical artifact; new versions supersede old ones, they don't replace
them.

---

## Running contexts

This skill runs in two environments. The procedure below is the same in
both; only the write-permission boundary differs.

### Local Mac (terminal Claude Code) — full flow

Direct push to `main` and to tags works (assuming the user is authed to
GitHub with push rights). `gh` CLI, if installed and authed, auto-creates
the GitHub Release at step 9. End-to-end in one go, no PR detour.

### Claude Code on the web (sandbox) — PR detour required

The sandbox does **not** have push access to `main` or to tags — GitHub
returns HTTP 403 on both. `gh` is typically not installed either. The
skill detects these and pivots:

- **Step 6 fallback** — when `git push origin main` 403s: move the
  commit onto a feature branch `claude/release-vX.Y.Z`, push that
  branch, hand the user the PR URL, and **pause** until they confirm
  the merge. On confirm, `git checkout main && git pull --ff-only` and
  resume from step 7.
- **Step 8 fallback** — when `git push origin vX.Y.Z` 403s: tag exists
  locally but won't reach origin. Give the user the three commands to
  recreate and push the tag from their Mac.
- **Step 9 fallback** — `gh` not present: print the manual draft URL
  (`https://github.com/anorby515/AI2FI/releases/new?tag=vX.Y.Z`) and
  the `RELEASE.md` path so the user can paste the body into the UI.

Anything that succeeded before a fallback (the file bumps, the local
commit, the release-branch push) stays as-is — never roll back partial
state.

---

## Procedure

### 1. Pre-flight checks

Run all of these. If any fail, stop and report — do not proceed to
destructive steps with a broken precondition.

```sh
git rev-parse --is-inside-work-tree   # are we in a git repo?
git status --porcelain                 # must be empty (clean tree)
git branch --show-current              # should be `main` — if not, ask user before switching
git fetch origin                       # sync remote refs
git rev-list --count main..origin/main # 0 = we're current; non-zero = pull first
test -f VERSION                        # must exist
test -f version.json                   # must exist
test -f RELEASE.md                     # must exist
git rev-parse --verify origin/release  # release branch must exist on origin
command -v gh && gh auth status        # gh CLI installed and authed
```

If `git status --porcelain` returns non-empty: tell the user to commit
or stash first, then re-run.

If not on `main`: ask "Switch to main?" and `git checkout main` on yes.

If main is behind origin: `git pull --ff-only` (abort if not a fast-forward — that's the user's problem to resolve).

If `gh` is missing or unauthenticated: continue but skip step 9; tell the user to draft the GitHub Release in the UI at the end.

### 2. Read current version + propose next

```sh
cat VERSION
```

Parse as `MAJOR.MINOR.PATCH` (semver). Propose **MINOR + 1, PATCH = 0**:

| Current | Proposed |
|---|---|
| `0.2.0` | `0.3.0` |
| `1.0.0` | `1.1.0` |
| `1.4.7` | `1.5.0` |

### 3. Confirm version with user

Ask the user via `AskUserQuestion` (or plain text if AskUserQuestion isn't available):

> Current is **vX.Y.Z**. Cut as **vX.(Y+1).0** (minor bump)?
> - **Use vX.(Y+1).0** *(recommended)*
> - **Patch bump (vX.Y.(Z+1))**
> - **Major bump (v(X+1).0.0)**
> - **Other** — type any valid semver (e.g., `2.0.0-rc1`)

Validate the chosen version against semver:
- Pattern: `^\d+\.\d+\.\d+(-[\w.]+)?$`
- Must be strictly greater than the current `VERSION` (use semver comparison).
- If invalid or not greater: re-prompt.

### 4. Confirm RELEASE.md is ready

Show the user the first ~15 lines of `RELEASE.md` (the H1, tagline, and
opening sentence). Ask:

> This is what will appear on the welcome page and as the GitHub Release
> body. Is `RELEASE.md` ready to ship as **vX.Y.Z**?
> - **Yes — proceed**
> - **No — let me edit it first** *(aborts the skill)*

If "no": tell the user to update `RELEASE.md`, then re-run `/create-release`.

### 5. Apply file updates

The release date is **today's date in `YYYY-MM-DD`** (use `date +%F` or the system date — not a guess).

**`VERSION`** — overwrite with single line:
```
X.Y.Z
```

**`version.json`** — update three fields, leave the rest alone:
```json
"version": "X.Y.Z",
"released": "YYYY-MM-DD",
"tag": "vX.Y.Z"
```

**`RELEASE.md`** — replace the H1 line. Match the existing pattern:
```
# AI2FI vX.Y.Z — <existing tagline after the em-dash>
```
Only the version number changes. Leave the body untouched (the user
already updated it in step 4).

Show a summary of the diff (counts of lines changed per file is enough,
or call `git diff --stat`).

### 6. Commit on main

```sh
git add VERSION version.json RELEASE.md
git commit -m "release: vX.Y.Z"
git push origin main
```

**If the push 403s** (sandbox running against a protected `main`):

```sh
git checkout -b claude/release-vX.Y.Z          # carry the commit forward
git push -u origin claude/release-vX.Y.Z
```

Tell the user the PR URL
(`https://github.com/anorby515/AI2FI/compare/main...claude/release-vX.Y.Z`)
and **pause** until they confirm the merge. On confirm:

```sh
git checkout main
git pull --ff-only
```

Then continue to step 7.

### 7. Fast-forward `release` and push

This is the publish. The welcome page and ZIP download both serve from
this branch.

```sh
# CRITICAL: pull main first. If local main is behind origin/main (very
# common right after a PR merge), `git merge --ff-only main` below is a
# silent no-op — release stays at the old commit, the push has nothing
# to send, and Pages doesn't rebuild. Pulling main first guarantees the
# merge actually moves the branch.
git checkout main
git pull --ff-only

git checkout release
git pull --ff-only
git merge --ff-only main
git push origin release
git checkout main
```

If `git merge --ff-only main` fails ("Not possible to fast-forward"):
- Stop. The release branch has diverged from main.
- Diagnose: `git log --oneline main..release` shows what's on release
  that isn't on main.
- Tell the user; do not force-anything.

If `git merge --ff-only main` reports "Already up to date" when you
expected commits to land, local main is still stale somehow — fetch
again (`git fetch origin && git pull --ff-only` while on main) before
retrying.

### 8. Tag and push the tag

```sh
git tag -a vX.Y.Z -m "AI2FI vX.Y.Z"
git push origin vX.Y.Z
```

**If the tag push 403s** (sandbox): the local tag exists but won't reach
origin. Hand the user these commands to run on their Mac:

```sh
git checkout main && git pull
git tag -a vX.Y.Z -m "AI2FI vX.Y.Z"
git push origin vX.Y.Z
```

### 9. Create the GitHub Release

```sh
gh release create vX.Y.Z \
  --title "AI2FI vX.Y.Z" \
  --notes-file RELEASE.md
```

If this fails (gh missing, not authed, network error): tell the user to
draft the release in the UI at
`https://github.com/anorby515/AI2FI/releases/new?tag=vX.Y.Z` and paste
`RELEASE.md` as the body.

### 10. Verify

Print these URLs for the user to check:

- **Welcome page** (Pages deploy ~1 min): https://anorby515.github.io/AI2FI/
- **GitHub Release**: `gh release view vX.Y.Z --web`
  (or `https://github.com/anorby515/AI2FI/releases/tag/vX.Y.Z`)
- **All releases**: https://github.com/anorby515/AI2FI/releases

Tell the user to confirm:
- Hero pill on the welcome page reads `vX.Y.Z · released YYYY-MM-DD`
- Download card shows `AI2FI vX.Y.Z`
- "What's in this release" section renders the new `RELEASE.md`

---

## Tone

Mechanical and precise — this is plumbing, not coaching. Confirm before
each destructive step (commit, push, tag, gh release). Show the user
what's about to happen so nothing is surprising.

If anything fails partway through, **stop**. Report what succeeded,
what failed, and what the user needs to do to recover (usually a
manual command). Don't try to "fix" partial state — that's a fast path
to a broken release.

---

## Safety rules

- **Never** force-push, reset --hard, or delete tags. If something has
  diverged, ask the user.
- **Never** edit anything outside `VERSION`, `version.json`, and the H1
  of `RELEASE.md`. Body of `RELEASE.md` is the user's writing — leave it.
- **Never** skip the confirmation in step 4. Shipping a release with
  stale `RELEASE.md` content is the worst failure mode this skill can
  produce.
- **Never** delete prior tags or releases. Past releases are immutable
  history.
