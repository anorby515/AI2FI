#!/bin/bash
#
# AI2FI — Dashboard setup (macOS)
#
# Double-click this file from Finder. After a one-time setup, the dashboard will
# auto-start every time you log into your Mac, reachable at http://localhost:3001.
#
# What this script does:
#   1. Verifies Homebrew and Node are installed (offers to install Node if missing)
#   2. Installs npm dependencies for the server and client
#   3. Builds the client
#   4. Registers a launchd agent so the server runs on login
#   5. Starts the server now and opens it in your browser
#
# To undo: double-click uninstall.command in this same folder.

set -e

# --- Resolve paths ---
DASHBOARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$DASHBOARD_DIR/client"
SERVER_ENTRY="$DASHBOARD_DIR/server/index.js"
LOGS_DIR="$DASHBOARD_DIR/logs"
PLIST_TEMPLATE="$DASHBOARD_DIR/com.ai2fi.dashboard.plist.template"
PLIST_LABEL="com.ai2fi.dashboard"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

# --- Pretty output helpers ---
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

# --- Step 1: Homebrew ---
step "Checking for Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  fail "Homebrew is not installed."
  echo ""
  echo "Homebrew is the macOS package manager this setup uses to install Node."
  echo "Install it by running the command on this page: https://brew.sh"
  echo "Then double-click this file again."
  echo ""
  echo "Press any key to close this window..."
  read -n 1 -s
  exit 1
fi
ok "Homebrew found at $(command -v brew)"

# --- Step 2: Node ---
step "Checking for Node.js"
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js is not installed."
  echo ""
  read -p "Install Node.js now via Homebrew? [Y/n] " -n 1 -r REPLY
  echo ""
  if [[ $REPLY =~ ^[Nn]$ ]]; then
    fail "Setup cannot continue without Node.js."
    echo "Press any key to close this window..."
    read -n 1 -s
    exit 1
  fi
  brew install node
fi
NODE_PATH="$(command -v node)"
ok "Node.js $(node --version) at $NODE_PATH"

# --- Step 3: Install dependencies ---
step "Installing server dependencies"
cd "$DASHBOARD_DIR"
npm install --no-audit --no-fund
ok "Server dependencies installed"

step "Installing client dependencies"
cd "$CLIENT_DIR"
npm install --no-audit --no-fund
ok "Client dependencies installed"

# --- Step 4: Build the client ---
step "Building the client for production"
npm run build
ok "Client built to $CLIENT_DIR/dist"

# --- Step 5: Launchd agent ---
step "Registering launchd agent ($PLIST_LABEL)"
mkdir -p "$LOGS_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# If the agent is already loaded (re-running setup), unload cleanly before replacing.
if launchctl list | grep -q "$PLIST_LABEL"; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Kill anything else holding port 3001 (e.g. an old `npm run dev` session or a
# previous bare-hands `node server/index.js`). Without this, the new agent will
# crash-loop on EADDRINUSE and the old ghost will keep answering /health.
if lsof -ti :3001 >/dev/null 2>&1; then
  warn "Found an existing process on port 3001 — stopping it so the new agent can bind."
  lsof -ti :3001 | xargs kill -9 2>/dev/null || true
  # Give the kernel a moment to release the socket.
  sleep 1
fi

# Generate the plist from the template by substituting placeholders.
sed \
  -e "s|{{LABEL}}|$PLIST_LABEL|g" \
  -e "s|{{NODE_PATH}}|$NODE_PATH|g" \
  -e "s|{{SERVER_ENTRY}}|$SERVER_ENTRY|g" \
  -e "s|{{WORKING_DIR}}|$DASHBOARD_DIR|g" \
  -e "s|{{STDOUT_LOG}}|$LOGS_DIR/server.log|g" \
  -e "s|{{STDERR_LOG}}|$LOGS_DIR/server.err.log|g" \
  "$PLIST_TEMPLATE" > "$PLIST_DEST"

launchctl load "$PLIST_DEST"
ok "Agent registered. The dashboard will now auto-start every time you log in."

# --- Step 6: Wait for the server to come up, then open it ---
step "Waiting for the server to come up"
for i in $(seq 1 20); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    ok "Server is responding at http://localhost:3001"
    break
  fi
  sleep 0.5
  if [ "$i" = "20" ]; then
    warn "Server did not respond within 10 seconds. Check $LOGS_DIR/server.err.log for details."
  fi
done

step "Opening the dashboard in your browser"
open http://localhost:3001

echo ""
echo "${BOLD}${GREEN}Setup complete.${RESET}"
echo ""
echo "  Dashboard URL:  ${BOLD}http://localhost:3001${RESET}"
echo "  Server logs:    ${DIM}$LOGS_DIR/server.log${RESET}"
echo "  To uninstall:   ${DIM}double-click uninstall.command in this folder${RESET}"
echo ""
echo "Press any key to close this window..."
read -n 1 -s
