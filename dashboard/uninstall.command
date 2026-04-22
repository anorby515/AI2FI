#!/bin/bash
#
# AI2FI — Dashboard uninstaller (macOS)
#
# Double-click to stop the dashboard server and remove the launchd agent.
# This does NOT delete your data or the project files — only the auto-start hook.

set -e

PLIST_LABEL="com.ai2fi.dashboard"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

BOLD=$(tput bold 2>/dev/null || true)
GREEN=$(tput setaf 2 2>/dev/null || true)
YELLOW=$(tput setaf 3 2>/dev/null || true)
RESET=$(tput sgr0 2>/dev/null || true)

echo "${BOLD}==>${RESET} Stopping and unregistering the dashboard agent"

if [ -f "$PLIST_DEST" ]; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm "$PLIST_DEST"
  echo "${GREEN}✓${RESET} Agent removed."
else
  echo "${YELLOW}!${RESET} No agent was installed — nothing to remove."
fi

# Best-effort kill of any lingering process on 3001, in case one was started manually.
if lsof -ti :3001 >/dev/null 2>&1; then
  lsof -ti :3001 | xargs kill -9 2>/dev/null || true
  echo "${GREEN}✓${RESET} Stopped process on port 3001."
fi

echo ""
echo "${BOLD}${GREEN}Uninstall complete.${RESET} Your project files and data are untouched."
echo ""
echo "Press any key to close this window..."
read -n 1 -s
