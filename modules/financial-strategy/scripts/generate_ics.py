#!/usr/bin/env python3
"""
generate_ics.py — emit a valid RFC 5545 .ics file for an AI2FI check-in reminder.

Called by the Coach during the cadence-reminders flow. No third-party
dependencies — stdlib only, so it runs anywhere Python 3 is installed.

Usage:
    python3 generate_ics.py \\
        --title "AI2FI Quarterly Check-In — 2026-Q3" \\
        --date 2026-07-18 \\
        --time 09:00 \\
        --duration 30 \\
        --timezone America/Los_Angeles \\
        --description-file /tmp/ai2fi-description.txt \\
        --output /path/to/2026-07-18-quarterly.ics

    # Or pipe description through stdin:
    echo "Quarterly review..." | python3 generate_ics.py \\
        --title "..." --date 2026-07-18 --time 09:00 \\
        --output /path/to/reminder.ics
"""

import argparse
import hashlib
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


def fold_line(line: str, limit: int = 75) -> str:
    """RFC 5545 requires lines be folded at 75 octets with CRLF + space continuation.

    Continuation lines carry a leading space that counts toward their length,
    so every piece after the first is cut at limit-1 to leave room for it.
    """
    encoded = line.encode("utf-8")
    if len(encoded) <= limit:
        return line
    pieces: list[str] = []
    first = True
    while len(encoded) > (limit if first else limit - 1):
        cut = limit if first else limit - 1
        # Walk back to a valid UTF-8 boundary so we never split a multibyte char.
        while cut > 0 and (encoded[cut] & 0xC0) == 0x80:
            cut -= 1
        pieces.append(encoded[:cut].decode("utf-8"))
        encoded = encoded[cut:]
        first = False
    pieces.append(encoded.decode("utf-8"))
    return "\r\n ".join(pieces)


def escape_text(value: str) -> str:
    """RFC 5545 text escaping: backslash, comma, semicolon, newline."""
    return (
        value.replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\n", "\\n")
        .replace("\r", "")
    )


def format_local(dt: datetime) -> str:
    """Format a naive/local datetime as YYYYMMDDTHHMMSS for TZID-qualified fields."""
    return dt.strftime("%Y%m%dT%H%M%S")


def format_utc(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def stable_uid(title: str, start_local: datetime, timezone_name: str) -> str:
    """Deterministic UID so re-running with same inputs produces an importable update."""
    seed = f"{title}|{start_local.isoformat()}|{timezone_name}".encode("utf-8")
    digest = hashlib.sha1(seed).hexdigest()[:16]
    return f"ai2fi-{digest}@ai2fi.local"


def read_description(path: str | None) -> str:
    if path and path != "-":
        return Path(path).read_text(encoding="utf-8")
    if not sys.stdin.isatty():
        data = sys.stdin.read()
        if data.strip():
            return data
    return ""


def build_ics(
    title: str,
    start_local: datetime,
    end_local: datetime,
    timezone_name: str,
    description: str,
    location: str,
    reminder_minutes: list[int],
) -> str:
    uid = stable_uid(title, start_local, timezone_name)
    dtstamp = format_utc(datetime.now(timezone.utc))

    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//AI2FI//Financial Strategy Reminder//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART;TZID={timezone_name}:{format_local(start_local)}",
        f"DTEND;TZID={timezone_name}:{format_local(end_local)}",
        f"SUMMARY:{escape_text(title)}",
    ]

    if description:
        lines.append(f"DESCRIPTION:{escape_text(description)}")
    if location:
        lines.append(f"LOCATION:{escape_text(location)}")

    lines.extend([
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
    ])

    for minutes in reminder_minutes:
        lines.extend([
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{escape_text(title)}",
            f"TRIGGER:-PT{minutes}M",
            "END:VALARM",
        ])

    lines.extend(["END:VEVENT", "END:VCALENDAR"])

    return "\r\n".join(fold_line(line) for line in lines) + "\r\n"


def parse_reminders(spec: str) -> list[int]:
    if not spec.strip():
        return []
    out: list[int] = []
    for piece in spec.split(","):
        piece = piece.strip().lower()
        if not piece:
            continue
        if piece.endswith("d"):
            out.append(int(piece[:-1]) * 24 * 60)
        elif piece.endswith("h"):
            out.append(int(piece[:-1]) * 60)
        elif piece.endswith("m"):
            out.append(int(piece[:-1]))
        else:
            out.append(int(piece))  # bare number = minutes
    return out


def main() -> int:
    p = argparse.ArgumentParser(
        description="Generate an AI2FI check-in .ics reminder.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--title", required=True, help="Event title")
    p.add_argument("--date", required=True, help="YYYY-MM-DD")
    p.add_argument("--time", default="09:00", help="HH:MM (24-hour), default 09:00")
    p.add_argument("--duration", type=int, default=30, help="Duration in minutes, default 30")
    p.add_argument(
        "--timezone",
        default="America/Los_Angeles",
        help="IANA timezone, default America/Los_Angeles",
    )
    p.add_argument(
        "--description-file",
        default=None,
        help="Path to description text file (use '-' for stdin)",
    )
    p.add_argument("--location", default="", help="Optional location")
    p.add_argument(
        "--reminders",
        default="1d,1h",
        help="Comma-separated reminders before event, e.g. '1d,1h,15m'. Default: 1d,1h",
    )
    p.add_argument("--output", required=True, help="Output .ics file path")
    # Intentionally no --rrule / --recurrence flag.
    # See cadence-reminders.md Canonical Defaults: reminders are non-recurring
    # by design. Each check-in schedules its own next reminder at close.
    # Refuse any attempt to smuggle one in via environment.
    if any(k.upper().startswith("ICS_RRULE") for k in sorted(__import__("os").environ)):
        print(
            "ERROR: RRULE input is not supported by design. "
            "See modules/financial-strategy/cadence-reminders.md — "
            "Canonical Defaults: reminders are non-recurring.",
            file=sys.stderr,
        )
        return 2

    args = p.parse_args()

    start_local = datetime.strptime(f"{args.date} {args.time}", "%Y-%m-%d %H:%M")
    end_local = start_local + timedelta(minutes=args.duration)
    description = read_description(args.description_file)
    reminders = parse_reminders(args.reminders)

    ics = build_ics(
        title=args.title,
        start_local=start_local,
        end_local=end_local,
        timezone_name=args.timezone,
        description=description,
        location=args.location,
        reminder_minutes=reminders,
    )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(ics, encoding="utf-8", newline="")

    print(f"Wrote {out_path} ({len(ics)} bytes)")
    print(f"Event:    {args.title}")
    print(f"When:     {start_local.strftime('%A, %B %d, %Y at %H:%M')} {args.timezone}")
    print(f"Duration: {args.duration} min")
    if reminders:
        print(f"Alerts:   {args.reminders} before")
    return 0


if __name__ == "__main__":
    sys.exit(main())
