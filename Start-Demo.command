#!/bin/bash
#
# AI2FI — Start Demo (no-install preview)
#
# Right-click this file → Open the first time (to clear macOS Gatekeeper).
# After that you can double-click it like any normal app.
#
# What this does:
#   1. Verifies Node.js is installed (offers a clear next step if not).
#   2. Installs dashboard dependencies on first run.
#   3. Starts the Express API + Vite dev servers and opens your browser.
#
# The dashboard runs in DEMO mode against the committed sample template under
# core/sample-data/ — nothing personal needed, nothing transmitted.
#
# To stop the demo: close this Terminal window.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$REPO_ROOT/dashboard"
CLIENT_DIR="$DASHBOARD_DIR/client"
DEMO_URL="http://localhost:5173"

BOLD=$(tput bold 2>/dev/null || true)
DIM=$(tput dim 2>/dev/null || true)
GREEN=$(tput setaf 2 2>/dev/null || true)
YELLOW=$(tput setaf 3 2>/dev/null || true)
RED=$(tput setaf 1 2>/dev/null || true)
RESET=$(tput sgr0 2>/dev/null || true)

step()  { echo ""; echo "${BOLD}==>${RESET} $1"; }
ok()    { echo "${GREEN}✓${RESET} $1"; }
warn()  { echo "${YELLOW}!${RESET} $1"; }
fail()  { echo "${RED}✗${RESET} $1" >&2; }

clear
echo "${BOLD}AI2FI demo — starting up${RESET}"
echo ""
echo "${DIM}This window stays open while the demo is running."
echo "Close it (or press Ctrl-C) to stop.${RESET}"

# --- Step 1: Node ---
step "Checking for Node.js"
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is not installed."
  echo ""
  echo "The demo needs Node.js. The simplest fix is to run the full installer"
  echo "once — it will install Node for you and then this demo will work."
  echo ""
  echo "  1. Open ${BOLD}Install-AI2FI.html${RESET} in this same folder."
  echo "  2. Follow the one-line install."
  echo ""
  echo "After that, double-click Start-Demo.command anytime to preview."
  echo ""
  echo "Press any key to close this window..."
  read -n 1 -s
  exit 1
fi
ok "Node.js $(node --version)"

# --- Step 2: Install deps on first run ---
step "Checking demo dependencies"
cd "$DASHBOARD_DIR"
if [ ! -d "node_modules" ]; then
  echo "First run — installing dashboard server dependencies (≈30s)…"
  if ! npm install --no-audit --no-fund; then
    fail "npm install failed for the server. Check your internet connection."
    echo "Press any key to close this window..."
    read -n 1 -s
    exit 1
  fi
fi
ok "Server dependencies ready"

cd "$CLIENT_DIR"
if [ ! -d "node_modules" ]; then
  echo "First run — installing dashboard client dependencies (≈30s)…"
  if ! npm install --no-audit --no-fund; then
    fail "npm install failed for the client. Check your internet connection."
    echo "Press any key to close this window..."
    read -n 1 -s
    exit 1
  fi
fi
ok "Client dependencies ready"

# --- Step 3: Free up ports ---
step "Checking ports 3001 and 5173"
for port in 3001 5173; do
  if lsof -ti :$port >/dev/null 2>&1; then
    warn "Something is on port $port — stopping it so the demo can bind."
    lsof -ti :$port | xargs kill 2>/dev/null || true
    sleep 1
  fi
done
ok "Ports clear"

# --- Step 4: Open browser once Vite is up ---
(
  for i in $(seq 1 60); do
    if curl -sf "$DEMO_URL" >/dev/null 2>&1; then
      open "$DEMO_URL"
      exit 0
    fi
    sleep 0.5
  done
) &

# --- Step 5: Run the dev servers in foreground ---
step "Starting demo servers"
echo "${DIM}Your browser will open at ${BOLD}$DEMO_URL${RESET}${DIM} once the servers are ready."
echo "Close this window to stop the demo.${RESET}"
echo ""
cd "$DASHBOARD_DIR"
exec npm run dev
