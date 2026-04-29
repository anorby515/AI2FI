#!/usr/bin/env bash
# Detached reboot helper. The /api/reboot route spawns this with `setsid` so
# it survives the parent server exiting. It waits a beat for the HTTP response
# to flush, then kills anything bound to the dev ports and relaunches the
# concurrently-managed dev pair.

set -u

DASHBOARD_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$DASHBOARD_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/reboot.log"

{
  echo "[$(date)] reboot.sh starting"

  # Give the HTTP response a moment to reach the browser before we tear the
  # server down — otherwise the client never sees the 200.
  sleep 1

  for port in 3001 5173; do
    pids=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "killing pids on :$port -> $pids"
      kill -9 $pids 2>/dev/null || true
    fi
  done

  cd "$DASHBOARD_DIR"
  echo "starting npm run dev"
  nohup npm run dev >> "$LOG_FILE" 2>&1 &
  echo "spawned pid $!"
} >> "$LOG_FILE" 2>&1
