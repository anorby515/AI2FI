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

# --- Step 2.5: User profile ---
# The dashboard reads from user-profiles/<name>/private/Finances.xlsx. The server
# resolves the active profile via (env → .ai2fi-config → auto-detect). We make sure
# one of those signals exists before launching, so the first page load has data
# (or at least a configured directory to drop the spreadsheet into).
step "Configuring your profile"
REPO_ROOT="$(cd "$DASHBOARD_DIR/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/.ai2fi-config"
PROFILES_DIR="$REPO_ROOT/user-profiles"

configured_profile=""
if [ -f "$CONFIG_FILE" ]; then
  configured_profile="$(node -e 'try { const c = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(c.profile || ""); } catch { process.stdout.write(""); }' "$CONFIG_FILE")"
fi

if [ -n "$configured_profile" ]; then
  ok "Using existing profile: $configured_profile (from .ai2fi-config)"
else
  # Auto-detect: any non-example directory under user-profiles/
  detected=""
  if [ -d "$PROFILES_DIR" ]; then
    for dir in "$PROFILES_DIR"/*/; do
      [ -d "$dir" ] || continue
      name="$(basename "$dir")"
      if [ "$name" != "example" ]; then
        detected="$name"
        break
      fi
    done
  fi

  if [ -n "$detected" ]; then
    echo "{\"profile\": \"$detected\"}" > "$CONFIG_FILE"
    ok "Detected existing profile \"$detected\" — wrote .ai2fi-config"
  else
    echo ""
    echo "The dashboard reads your financial data from a local spreadsheet at:"
    echo "  ${DIM}user-profiles/<name>/private/Finances.xlsx${RESET}"
    echo ""
    echo "What name should we use for your profile? (lowercase letters, numbers, dashes)"
    printf "Profile name: "
    read -r profile_name
    # Normalize + validate
    profile_name="$(echo "$profile_name" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
    if [ -z "$profile_name" ] || [ "$profile_name" = "example" ]; then
      fail "Invalid name. Using 'you' as a fallback — rename the folder later if you want."
      profile_name="you"
    fi
    mkdir -p "$PROFILES_DIR/$profile_name/private"
    mkdir -p "$PROFILES_DIR/$profile_name/research"
    echo "{\"profile\": \"$profile_name\"}" > "$CONFIG_FILE"
    ok "Created user-profiles/$profile_name/ and wrote .ai2fi-config"
  fi
fi

# --- Step 2.6: Seed with sample data so the first-run dashboard is functional ---
# If the user's profile has no Finances.xlsx yet, copy the committed sample into
# place and drop a .sample-data marker. The dashboard uses the marker to
# default to the "Getting Started" view and show a sample-data banner. The
# onboarding skill (/financial-check-in, State A) removes the marker once the
# user completes Part 3 and has their own data.
step "Seeding sample data (first-run only)"
# Re-read which profile is active now (could be from config, detected, or just-created)
active_profile="$(node -e 'try { const c = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(c.profile || ""); } catch { process.stdout.write(""); }' "$CONFIG_FILE")"

if [ -z "$active_profile" ]; then
  warn "No active profile configured — skipping sample-data seed."
else
  user_xlsx="$PROFILES_DIR/$active_profile/private/Finances.xlsx"
  sample_xlsx="$REPO_ROOT/core/sample-data/Finances.xlsx"
  marker="$PROFILES_DIR/$active_profile/.sample-data"

  if [ -f "$user_xlsx" ]; then
    ok "Your spreadsheet is already in place — not touching it."
  elif [ ! -f "$sample_xlsx" ]; then
    warn "No sample xlsx at core/sample-data/Finances.xlsx — the dashboard will show the empty-state screen until you drop your own in."
  else
    mkdir -p "$(dirname "$user_xlsx")"
    cp "$sample_xlsx" "$user_xlsx"
    date -u +"%Y-%m-%dT%H:%M:%SZ" > "$marker"
    ok "Copied sample data to user-profiles/$active_profile/private/Finances.xlsx"
    ok "Wrote .sample-data marker — the dashboard will start on the Getting Started screen."
  fi
fi

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
