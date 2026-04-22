#!/usr/bin/env python3
"""
schedule_checkin.py — orchestrator for the cadence-reminder flow.

Implements the canonical defaults documented in cadence-reminders.md as
executable code. Picks the right format based on what's available,
computes dates, renders the description block, and emits either:

  (a) an .ics file + shell reminder markdown (fallback path), or
  (b) a JSON manifest the Coach passes to the Google Calendar MCP
      create_event tool, plus shell reminder markdown (primary path).

The Coach calls this script, inspects the manifest, and takes the
remaining step (MCP call or file hand-off). This keeps the Python side
pure — no MCP dependency, no credentials, no side effects beyond files.

Usage:

    # Primary path (MCP will be called by the Coach):
    python3 schedule_checkin.py \\
        --user-id andrew \\
        --cadence quarterly \\
        --mcp-available \\
        --goal-headlines "Be done with the Visa by birthday" \\
                         "Top off emergency fund to 6 months" \\
                         "Increase HSA contribution to family max" \\
        --deferred-count 2 --skipped-count 4 \\
        --timezone America/Los_Angeles

    # Fallback path (writes .ics):
    python3 schedule_checkin.py \\
        --user-id andrew \\
        --cadence quarterly \\
        --goal-headlines "..." "..." "..." \\
        --timezone America/Los_Angeles

Outputs a JSON manifest to stdout describing what was scheduled and
which artifacts exist on disk. Exit code is 0 on success.
"""

import argparse
import json
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path


# ---------- Canonical defaults (mirrors cadence-reminders.md) ----------

CADENCE_CONFIG = {
    "monthly": {
        "offset_days": 30,
        "duration_minutes": 15,
        "reminders": "30m",
        "title_suffix": "Monthly Pulse",
    },
    "quarterly": {
        "offset_days": 90,
        "duration_minutes": 30,
        "reminders": "1d,1h",
        "title_suffix": "Quarterly Check-In",
    },
}

DEFAULT_TIME = "09:00"                     # Saturday 9am local
DEFAULT_WEEKDAY_TARGET = 5                 # Saturday (0=Mon..6=Sun)
FALLBACK_TIMEZONE = "America/Los_Angeles"


# ---------- Date helpers ----------

def compute_target_date(cadence: str, today: date) -> date:
    """Add the cadence offset, then nudge to the nearest Saturday."""
    if cadence not in CADENCE_CONFIG:
        raise ValueError(f"Unknown cadence: {cadence}")
    raw = today + timedelta(days=CADENCE_CONFIG[cadence]["offset_days"])

    # Nudge to the nearest Saturday (prefer later over earlier to keep
    # the full cadence interval intact).
    delta_to_target = (DEFAULT_WEEKDAY_TARGET - raw.weekday()) % 7
    return raw + timedelta(days=delta_to_target)


def quarter_label(d: date) -> str:
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


# ---------- Description block ----------

def render_description(
    cadence: str,
    quarter: str,
    goal_headlines: list[str],
    deferred_count: int,
    skipped_count: int,
) -> str:
    title_suffix = CADENCE_CONFIG[cadence]["title_suffix"]
    lines = [f"AI2FI {title_suffix} — {quarter}", ""]

    if cadence == "quarterly":
        lines.append("This quarter's active goals:")
    else:
        lines.append("Active goals to pulse on:")

    for i, headline in enumerate(goal_headlines, 1):
        lines.append(f"{i}. {headline}")

    lines.append("")
    lines.append(f"Deferred: {deferred_count} | Skipped: {skipped_count}")
    lines.append("")

    if cadence == "quarterly":
        lines.append(
            "To open the session: read goals.md and journal.md, "
            "then run quarterly-review-template.md."
        )
    else:
        lines.append(
            "Light pulse only — scan goals.md for anything off-track, "
            "flag for next quarterly."
        )
    return "\n".join(lines)


# ---------- Shell reminder file ----------

def write_shell_reminder(
    *,
    profiles_root: Path,
    user_id: str,
    target_date: date,
    target_time: str,
    cadence: str,
    timezone_name: str,
    quarter: str,
    goal_headlines: list[str],
    format_delivered: str,
    ics_path: Path | None,
) -> Path:
    reminders_dir = profiles_root / user_id / "reminders"
    reminders_dir.mkdir(parents=True, exist_ok=True)
    md_path = reminders_dir / f"{target_date.isoformat()}-{cadence}.md"

    frontmatter = {
        "reminder_type": cadence,
        "scheduled_for": target_date.isoformat(),
        "scheduled_time": target_time,
        "timezone": timezone_name,
        "format_delivered": format_delivered,
        "ics_file": str(ics_path.relative_to(profiles_root.parent))
        if ics_path
        else None,
        "calendar_event_id": None,  # filled in by Coach after MCP call
        "created_at": date.today().isoformat(),
    }
    fm_lines = ["---"]
    for k, v in frontmatter.items():
        if v is None:
            continue
        fm_lines.append(f"{k}: {v}")
    fm_lines.append("---")

    body = [
        "",
        f"# {CADENCE_CONFIG[cadence]['title_suffix']} — {quarter}",
        "",
        f"Scheduled for {target_date.strftime('%A, %B %d, %Y')} at {target_time} {timezone_name}.",
        "",
        "**Active goals this quarter:**",
    ]
    for i, h in enumerate(goal_headlines, 1):
        body.append(f"{i}. {h}")
    body.extend(
        [
            "",
            "**When the reminder fires:** open `goals.md` and `journal.md`, "
            "then run `quarterly-review-template.md` (or a monthly pulse "
            "for monthly cadence).",
            "",
        ]
    )

    md_path.write_text("\n".join(fm_lines + body), encoding="utf-8")
    return md_path


# ---------- .ics generation (fallback path) ----------

def emit_ics(
    *,
    scripts_dir: Path,
    profiles_root: Path,
    user_id: str,
    target_date: date,
    target_time: str,
    duration: int,
    timezone_name: str,
    title: str,
    description: str,
    reminders: str,
    cadence: str,
) -> Path:
    generator = scripts_dir / "generate_ics.py"
    reminders_dir = profiles_root / user_id / "reminders"
    reminders_dir.mkdir(parents=True, exist_ok=True)
    ics_path = reminders_dir / f"{target_date.isoformat()}-{cadence}.ics"

    # Write description to a temp file (stdin works too but this is more
    # robust if anyone ever runs this interactively).
    desc_path = reminders_dir / f".{target_date.isoformat()}-{cadence}.desc.txt"
    desc_path.write_text(description, encoding="utf-8")

    cmd = [
        sys.executable,
        str(generator),
        "--title", title,
        "--date", target_date.isoformat(),
        "--time", target_time,
        "--duration", str(duration),
        "--timezone", timezone_name,
        "--description-file", str(desc_path),
        "--reminders", reminders,
        "--output", str(ics_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    # Always clean up the temp desc file
    try:
        desc_path.unlink()
    except OSError:
        pass
    if result.returncode != 0:
        raise RuntimeError(
            f"generate_ics.py failed (exit {result.returncode}):\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
    return ics_path


# ---------- MCP manifest (primary path) ----------

def emit_mcp_manifest(
    *,
    title: str,
    target_date: date,
    target_time: str,
    duration: int,
    timezone_name: str,
    description: str,
) -> dict:
    start_local = datetime.strptime(
        f"{target_date.isoformat()} {target_time}", "%Y-%m-%d %H:%M"
    )
    end_local = start_local + timedelta(minutes=duration)
    return {
        "tool": "mcp__calendar__create_event",
        "arguments": {
            "summary": title,
            "startTime": start_local.strftime("%Y-%m-%dT%H:%M:%S"),
            "endTime": end_local.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": timezone_name,
            "description": description,
            "addGoogleMeetUrl": False,
            "notificationLevel": "NONE",
        },
        "note": (
            "Non-recurring by design. Each review schedules its own next "
            "reminder at close. See cadence-reminders.md canonical defaults."
        ),
    }


# ---------- Main ----------

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--user-id", required=True)
    p.add_argument("--cadence", required=True, choices=list(CADENCE_CONFIG))
    p.add_argument(
        "--mcp-available",
        action="store_true",
        help="Set when the Google Calendar MCP is connected. Picks primary path.",
    )
    p.add_argument(
        "--goal-headlines",
        nargs="+",
        required=True,
        help="User's own language for each active goal headline.",
    )
    p.add_argument("--deferred-count", type=int, default=0)
    p.add_argument("--skipped-count", type=int, default=0)
    p.add_argument("--timezone", default=FALLBACK_TIMEZONE)
    p.add_argument("--time", default=DEFAULT_TIME, help="HH:MM local, default 09:00")
    p.add_argument(
        "--target-date",
        default=None,
        help="YYYY-MM-DD override. If omitted, computed from cadence.",
    )
    p.add_argument(
        "--profiles-root",
        default=None,
        help="Path to user-profiles/ root. Defaults to AI2FI/user-profiles.",
    )
    p.add_argument(
        "--scripts-dir",
        default=None,
        help="Path to this script's directory. Defaults to the file's own dir.",
    )
    args = p.parse_args()

    scripts_dir = Path(args.scripts_dir or Path(__file__).resolve().parent)
    # Default profiles_root = <module>/../../user-profiles
    if args.profiles_root:
        profiles_root = Path(args.profiles_root)
    else:
        profiles_root = scripts_dir.parent.parent.parent / "user-profiles"
    profiles_root.mkdir(parents=True, exist_ok=True)

    today = date.today()
    target_date = (
        date.fromisoformat(args.target_date)
        if args.target_date
        else compute_target_date(args.cadence, today)
    )
    quarter = quarter_label(target_date)
    cfg = CADENCE_CONFIG[args.cadence]
    title = f"AI2FI {cfg['title_suffix']} — {quarter}"
    description = render_description(
        cadence=args.cadence,
        quarter=quarter,
        goal_headlines=args.goal_headlines,
        deferred_count=args.deferred_count,
        skipped_count=args.skipped_count,
    )

    if args.mcp_available:
        format_delivered = "google_calendar"
        ics_path = None
        manifest = emit_mcp_manifest(
            title=title,
            target_date=target_date,
            target_time=args.time,
            duration=cfg["duration_minutes"],
            timezone_name=args.timezone,
            description=description,
        )
    else:
        format_delivered = "ics"
        ics_path = emit_ics(
            scripts_dir=scripts_dir,
            profiles_root=profiles_root,
            user_id=args.user_id,
            target_date=target_date,
            target_time=args.time,
            duration=cfg["duration_minutes"],
            timezone_name=args.timezone,
            title=title,
            description=description,
            reminders=cfg["reminders"],
            cadence=args.cadence,
        )
        manifest = None

    shell_path = write_shell_reminder(
        profiles_root=profiles_root,
        user_id=args.user_id,
        target_date=target_date,
        target_time=args.time,
        cadence=args.cadence,
        timezone_name=args.timezone,
        quarter=quarter,
        goal_headlines=args.goal_headlines,
        format_delivered=format_delivered,
        ics_path=ics_path,
    )

    output = {
        "cadence": args.cadence,
        "target_date": target_date.isoformat(),
        "target_time": args.time,
        "timezone": args.timezone,
        "duration_minutes": cfg["duration_minutes"],
        "title": title,
        "format_delivered": format_delivered,
        "shell_reminder_file": str(shell_path),
        "ics_file": str(ics_path) if ics_path else None,
        "mcp_manifest": manifest,
        "goals_md_frontmatter_update": {
            "reminder": {
                "preference": args.cadence,
                "scheduled_for": target_date.isoformat(),
                "scheduled_time": args.time,
                "format": format_delivered,
                "created_at": today.isoformat(),
                "ics_file": str(ics_path) if ics_path else None,
                "calendar_event_id": None,
            }
        },
    }
    json.dump(output, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
