#!/usr/bin/env python3
"""
boot_status.py — introspect a user-profiles/{name}/ directory and return a
structured state dict describing where the user is in the AI2FI journey.

Spec: ../boot-experience.md
Stdlib only.

Usage:
    python3 boot_status.py --profile-dir /path/to/user-profiles/andrew
    python3 boot_status.py --profile-dir ... --json
"""

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path


# ---- Frontmatter parsing -----------------------------------------------------

def parse_frontmatter(text: str) -> dict:
    """Minimal YAML frontmatter parser sufficient for AI2FI's own files.

    Handles:
      - leading '---' / trailing '---' delimiters
      - simple `key: value` lines
      - list values introduced by an empty key followed by `  - item` lines
      - quoted strings (single or double)
    Does NOT handle: nested mappings, multi-line scalars, anchors, tags.
    """
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    block = text[3:end].strip("\n")

    out: dict = {}
    current_list: list | None = None

    for raw_line in block.split("\n"):
        line = raw_line.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue

        # List item under a previously-opened key
        stripped = line.lstrip()
        if stripped.startswith("- ") and current_list is not None:
            value = stripped[2:].strip()
            value = _unquote(value)
            current_list.append(value)
            continue

        m = re.match(r"^([a-zA-Z_][\w-]*):\s*(.*)$", line)
        if not m:
            continue
        key, value = m.group(1), m.group(2).strip()
        if not value:
            current_list = []
            out[key] = current_list
        else:
            out[key] = _unquote(value)
            current_list = None

    return out


def _unquote(s: str) -> str:
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        return s[1:-1]
    return s


# ---- Body parsing ------------------------------------------------------------

_PLACEHOLDER_RE = re.compile(r"\*\(.*(populated|no .*yet|none yet|not yet).*\)\*",
                              re.IGNORECASE)


def _strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end >= 0:
            return text[end + 4:]
    return text


def count_in_section(text: str, heading: str) -> int:
    """Count top-level list items under a `## Heading` section.

    Returns 0 if the section contains a placeholder marker like
    *(Populated during the first ...)* or *(no revisions yet)*.
    """
    pattern = rf"^##\s+{re.escape(heading)}\s*$"
    m = re.search(pattern, text, flags=re.MULTILINE | re.IGNORECASE)
    if not m:
        return 0
    body = text[m.end():]
    next_heading = re.search(r"^##\s+\S", body, flags=re.MULTILINE)
    if next_heading:
        body = body[:next_heading.start()]
    if _PLACEHOLDER_RE.search(body):
        return 0
    items = re.findall(r"^[-*]\s+\S", body, flags=re.MULTILINE)
    return len(items)


def latest_session(journal_text: str) -> tuple[date | None, str | None]:
    """Find the most recent dated session entry in journal.md.

    Looks for headers like:  ### YYYY-MM-DD — Title
    Both em-dash (—) and hyphen (-) accepted as separator.
    """
    pattern = r"^###\s+(\d{4}-\d{2}-\d{2})\s*[—\-]\s*(.+?)\s*$"
    matches = re.findall(pattern, journal_text, flags=re.MULTILINE)
    if not matches:
        return None, None
    parsed = []
    for d_str, title in matches:
        try:
            d = datetime.strptime(d_str, "%Y-%m-%d").date()
            parsed.append((d, title.strip()))
        except ValueError:
            continue
    if not parsed:
        return None, None
    parsed.sort(reverse=True)
    return parsed[0]


# ---- Main state assembly -----------------------------------------------------

def get_state(profile_dir: Path, today: date | None = None) -> dict:
    today = today or date.today()
    competency = profile_dir / "competency.md"
    goals = profile_dir / "goals.md"
    journal = profile_dir / "journal.md"

    state: dict = {
        "profile_exists": competency.exists(),
        "profile_name": profile_dir.name,
        "parts_completed": [],
        "next_session": None,
        "goals_active_count": 0,
        "goals_deferred_count": 0,
        "cadence_scheduled": False,
        "cadence_next_date": None,
        "cadence_next_time": None,
        "days_until_next": None,
        "last_session_date": None,
        "last_session_title": None,
    }

    if not state["profile_exists"]:
        return state

    # competency.md frontmatter -> parts_completed, next_session
    comp_fm = parse_frontmatter(competency.read_text(encoding="utf-8"))
    parts = comp_fm.get("parts_completed")
    state["parts_completed"] = parts if isinstance(parts, list) else []
    state["next_session"] = comp_fm.get("next_session")

    # goals.md -> active/deferred counts + cadence frontmatter
    if goals.exists():
        goals_text = goals.read_text(encoding="utf-8")
        goals_fm = parse_frontmatter(goals_text)
        body = _strip_frontmatter(goals_text)
        state["goals_active_count"] = count_in_section(body, "Active Goals")
        state["goals_deferred_count"] = count_in_section(body, "Deferred Goals")

        cadence_date = (goals_fm.get("next_checkin_date")
                        or goals_fm.get("cadence_next_date"))
        cadence_time = (goals_fm.get("next_checkin_time")
                        or goals_fm.get("cadence_next_time"))
        if cadence_date:
            try:
                d = datetime.strptime(cadence_date, "%Y-%m-%d").date()
                state["cadence_scheduled"] = True
                state["cadence_next_date"] = d.isoformat()
                state["cadence_next_time"] = cadence_time
                state["days_until_next"] = (d - today).days
            except ValueError:
                pass

    # journal.md -> latest session
    if journal.exists():
        last_date, last_title = latest_session(journal.read_text(encoding="utf-8"))
        if last_date:
            state["last_session_date"] = last_date.isoformat()
            state["last_session_title"] = last_title

    return state


# ---- CLI ---------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(
        description="Inspect a user-profile directory and emit AI2FI boot state.",
    )
    p.add_argument("--profile-dir", required=True,
                   help="Path to user-profiles/{name}/")
    p.add_argument("--json", action="store_true",
                   help="Emit JSON to stdout (default: human-readable)")
    args = p.parse_args()

    profile_dir = Path(args.profile_dir)
    state = get_state(profile_dir)

    if args.json:
        print(json.dumps(state, indent=2, default=str))
    else:
        for k, v in state.items():
            print(f"{k:24s} {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
