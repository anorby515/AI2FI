#!/usr/bin/env python3
"""
render_boot.py — compose the AI2FI boot banner for the current profile state.

Spec: ../boot-experience.md
Stdlib only.

Usage:
    python3 render_boot.py --profile-dir /path/to/user-profiles/andrew
    python3 render_boot.py --profiles-base /path/to/user-profiles
    python3 render_boot.py --no-profile          # force new-user render
"""

import argparse
import sys
from datetime import date, datetime
from pathlib import Path

# Allow importing boot_status.py from the same directory
sys.path.insert(0, str(Path(__file__).parent))
from boot_status import get_state  # noqa: E402


CORE_DIR = Path(__file__).parent.parent
BANNER_PATH = CORE_DIR / "assets" / "banner.txt"

COMPACT_HEADER = "  ████  AI2FI  ████"

PRIVACY_LONG_TEMPLATE = (
    "PRIVACY  : your profile lives in this folder, on this machine.\n"
    "             the conversation itself runs through Claude (Anthropic)."
)
PRIVACY_SHORT = "PRIVACY  : local profile · conversation via Claude"

# Map session IDs (as stored in competency.md frontmatter) to display titles.
SESSION_TITLES = {
    "part-1-getting-to-know-you": "Part 1 — Getting to Know You",
    "part-2-walkthrough":         "Part 2 — Framework Walkthrough",
    "part-3-goal-setting":        "Part 3 — Goal Setting",
}


# ---- Render helpers ----------------------------------------------------------

def _menu_block(rows: list[tuple[str, str, str]]) -> str:
    """Render a list of `> cmd  (k)   description` lines."""
    lines = []
    for cmd, key, desc in rows:
        lines.append(f"  > {cmd:<10s} ({key})   {desc}")
    return "\n".join(lines)


def _session_title(session_id: str | None) -> str:
    if not session_id:
        return "—"
    return SESSION_TITLES.get(session_id, session_id)


# ---- State A: New user -------------------------------------------------------

def render_new_user() -> str:
    if BANNER_PATH.exists():
        banner = BANNER_PATH.read_text(encoding="utf-8").rstrip()
    else:
        banner = "  AI2FI"
    parts = [
        banner,
        "  Your AI co-pilot for financial strategy.",
        "",
        "  PROFILE  : not detected — looks like you're new here",
        "  " + PRIVACY_LONG_TEMPLATE,
        "  SESSIONS : we'll do three short ones to get you set up.",
        "",
        "  > To begin, type:  let's start my financial journey",
        "  > For a tour:      /help",
        "",
    ]
    return "\n".join(parts)


# ---- State B: Onboarding in progress ----------------------------------------

def render_onboarding(state: dict) -> str:
    name = state["profile_name"].capitalize()
    last_date = state.get("last_session_date") or "—"
    last_title = state.get("last_session_title") or ""
    if last_date != "—" and last_title:
        last_line = f"{last_date} — {last_title} ✓"
    elif last_date != "—":
        last_line = f"{last_date} ✓"
    else:
        last_line = "—"

    next_line = _session_title(state.get("next_session"))

    has_goals = state["goals_active_count"] > 0
    goals_line = (f"{state['goals_active_count']} active"
                  if has_goals else "(none yet — set during Part 3)")

    if state.get("cadence_scheduled"):
        cadence_line = state.get("cadence_next_date") or "scheduled"
    else:
        cadence_line = "(none yet — schedule during Part 3 close)"

    parts = [
        f"{COMPACT_HEADER}   Welcome back, {name}.",
        "",
        f"  LAST     : {last_line}",
        f"  NEXT     : {next_line}",
        f"  GOALS    : {goals_line}",
        f"  CADENCE  : {cadence_line}",
        f"  {PRIVACY_SHORT}",
        "",
        _menu_block([
            ("continue", "c", "resume with the next part"),
            ("journal",  "j", "read what we captured last time"),
            ("profile",  "p", "review or edit your competency snapshot"),
            ("help",     "?", "full command list"),
        ]),
        "",
    ]
    return "\n".join(parts)


# ---- State C: Established ----------------------------------------------------

def render_established(state: dict) -> str:
    name = state["profile_name"].capitalize()

    last_date = state.get("last_session_date") or "—"
    last_title = state.get("last_session_title") or ""
    if last_date != "—":
        try:
            d = datetime.strptime(last_date, "%Y-%m-%d").date()
            ago = (date.today() - d).days
            if last_title:
                last_line = f"{ago} days ago — {last_title} ({last_date})"
            else:
                last_line = f"{ago} days ago ({last_date})"
        except ValueError:
            last_line = f"{last_date} — {last_title}" if last_title else last_date
    else:
        last_line = "—"

    days = state.get("days_until_next")
    if state.get("cadence_scheduled") and state.get("cadence_next_date"):
        time_part = f" ({state['cadence_next_time']})" if state.get("cadence_next_time") else ""
        if days is None:
            when = ""
        elif days < 0:
            when = f" — overdue by {-days} days"
        elif days == 0:
            when = " — due today"
        else:
            when = f" — in {days} days"
        next_line = f"{state['cadence_next_date']}{time_part}{when}"
    else:
        next_line = "(none — schedule one with /add-cadence)"

    goals_line = f"{state['goals_active_count']} active"
    if state["goals_deferred_count"]:
        goals_line += f" · {state['goals_deferred_count']} deferred"

    if state.get("cadence_scheduled") and days is not None and days <= 0:
        first_cmd = ("check-in", "c", "start your check-in (due now)")
    else:
        first_cmd = ("check-in", "c", "start your scheduled check-in")

    rows = [
        first_cmd,
        ("goals",    "g", f"review or revise your {state['goals_active_count']} active goals"),
        ("add-goal", "a", "set a new goal"),
        ("journal",  "j", "read past sessions"),
        ("help",     "?", "full command list"),
    ]

    parts = [
        f"{COMPACT_HEADER}   Welcome back, {name}.",
        "",
        f"  LAST     : {last_line}",
        f"  NEXT     : {next_line}",
        f"  GOALS    : {goals_line}",
        f"  {PRIVACY_SHORT}",
        "",
        _menu_block(rows),
        "",
    ]
    return "\n".join(parts)


# ---- Selector ----------------------------------------------------------------

def select_render(state: dict) -> str:
    if not state["profile_exists"]:
        return render_new_user()
    parts_done = state.get("parts_completed") or []
    if "part-3-goal-setting" in parts_done or state.get("cadence_scheduled"):
        return render_established(state)
    return render_onboarding(state)


def detect_profile_dir(base: Path) -> Path | None:
    """If exactly one subdirectory under base contains competency.md, return it."""
    if not base.exists() or not base.is_dir():
        return None
    candidates = [p for p in base.iterdir()
                  if p.is_dir() and (p / "competency.md").exists()]
    if len(candidates) == 1:
        return candidates[0]
    return None


# ---- CLI ---------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(
        description="Render the AI2FI boot banner for the current profile state.",
    )
    g = p.add_mutually_exclusive_group()
    g.add_argument("--profile-dir",
                   help="Path to user-profiles/{name}/")
    g.add_argument("--profiles-base",
                   help="Path to user-profiles/ root (auto-detect single profile)")
    p.add_argument("--no-profile", action="store_true",
                   help="Force the new-user render (testing)")
    args = p.parse_args()

    if args.no_profile:
        sys.stdout.write(render_new_user())
        return 0

    if args.profile_dir:
        profile_dir = Path(args.profile_dir)
        if not (profile_dir / "competency.md").exists():
            sys.stdout.write(render_new_user())
            return 0
    elif args.profiles_base:
        detected = detect_profile_dir(Path(args.profiles_base))
        if detected is None:
            sys.stdout.write(render_new_user())
            return 0
        profile_dir = detected
    else:
        # No arguments — assume a default location relative to this script
        default_base = CORE_DIR.parent / "user-profiles"
        detected = detect_profile_dir(default_base)
        if detected is None:
            sys.stdout.write(render_new_user())
            return 0
        profile_dir = detected

    state = get_state(profile_dir)
    sys.stdout.write(select_render(state))
    return 0


if __name__ == "__main__":
    sys.exit(main())
