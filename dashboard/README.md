# AI2FI Dashboard

The dashboard is the "seeing" half of AI2FI — a local web app that reads your financial data (a spreadsheet on your own machine) and renders portfolio, net worth, and benchmark views. It pairs with Claude, who handles the "thinking" half: coaching, framing, and teaching.

Everything runs locally. No data leaves your machine. No account to create.

## Prerequisites

- macOS (the setup script is macOS-specific — launchd, `open`, Homebrew)
- Homebrew — installed via the command at https://brew.sh
- Node.js — the setup script will install it via Homebrew if it's missing

Note on Node: if you use `nvm`, see the caveat at the bottom. The short version is that a Homebrew-managed Node is more stable for something that needs to auto-start on login.

## Quick start

The path with the least friction is a one-line Terminal install from the repo root:

```
curl -L https://github.com/anorby515/AI2FI/archive/refs/heads/main.tar.gz | tar xz && cd AI2FI-main && bash dashboard/setup.command
```

This downloads, unpacks, and runs setup in one step. No Gatekeeper prompt, no rename.

Alternatively, if you already have the repo locally (via `git clone` or an unzipped download):

```
cd /path/to/AI2FI
bash dashboard/setup.command
```

Either way, the script installs dependencies, builds the client, registers a launchd agent, and opens `http://localhost:3001` in your browser. First run takes a couple of minutes; subsequent logins are near-instant.

### If you double-click `setup.command` from Finder

It works, but on macOS 15+ Gatekeeper will block the file if it was downloaded from the internet (ZIP downloads get the quarantine flag; git clones don't). You'll see a "setup.command cannot be opened" dialog with only "Move to Trash" and "Done" options.

To get past it:

1. Click **Done**.
2. Open **System Settings → Privacy & Security**.
3. Scroll to the Security section at the bottom.
4. Next to "*setup.command was blocked to protect your Mac*", click **Open Anyway**.
5. Confirm and authenticate.

The `bash dashboard/setup.command` path above avoids all of this — `bash` reads the script contents and doesn't invoke the Gatekeeper check that Finder does.

## What `setup.command` does

In order:

1. Verifies Homebrew is installed (bails with instructions if not).
2. Verifies Node is installed (offers to install via Homebrew if not).
3. Runs `npm install` in `dashboard/` and `dashboard/client/`.
4. Runs `npm run build` in `dashboard/client/` to produce the production bundle in `client/dist/`.
5. Generates `~/Library/LaunchAgents/com.ai2fi.dashboard.plist` from `com.ai2fi.dashboard.plist.template`, substituting your Node path and this folder's location.
6. Kills anything already listening on port 3001 (belt and suspenders — covers the case where you have an old `npm run dev` still running).
7. Loads the agent via `launchctl`, which starts the server.
8. Polls `http://localhost:3001/health` until it responds, then opens the dashboard in your browser.

The agent is configured to auto-restart if the server crashes (`KeepAlive` on non-successful exit, with a 10-second throttle so it doesn't spin).

## How to uninstall

Double-click `uninstall.command` in this same folder. It unloads the launchd agent, removes the plist, and kills any lingering process on port 3001. It does **not** touch your project files, your spreadsheet, or anything in `user-profiles/`.

## Day-to-day

- **Dashboard URL:** http://localhost:3001
- **Server logs:** `dashboard/logs/server.log`
- **Server errors:** `dashboard/logs/server.err.log`
- **Agent status:** `launchctl list | grep ai2fi` — the middle column is the PID. A number means running; `-` means it crashed (check `server.err.log`).

## Development workflow

If you're editing the client or server code:

```
cd dashboard
npm run dev
```

That starts both the Express server on port 3001 and the Vite dev server on port 5173 with hot reload. Visit http://localhost:5173 — Vite proxies `/api/*` requests to 3001.

Heads up: if you forget and the launchd-managed server is still running, Vite's proxy will hit *that* server, not a fresh one from `npm run dev`. Either stop the agent first (`launchctl unload ~/Library/LaunchAgents/com.ai2fi.dashboard.plist`) or kill the process on 3001.

## Layout

```
dashboard/
├── setup.command               # Double-click installer
├── uninstall.command           # Double-click uninstaller
├── com.ai2fi.dashboard.plist.template  # launchd agent template
├── server/                     # Express API
│   ├── index.js                # Entry point (also serves built client in prod)
│   ├── routes/                 # API endpoints
│   ├── yahooClient.js          # Yahoo Finance wrapper
│   ├── apiTracker.js           # Call counting / health tracking
│   └── cache.js                # Simple on-disk cache
├── client/                     # Vite + React app
│   ├── src/
│   └── dist/                   # Built output (generated)
├── scripts/                    # Offline data-processing helpers
└── logs/                       # Generated at first run
```

## Data source

The server reads `user-profiles/andrew/private/Finances.xlsx` (one level up from `dashboard/`). That path is currently hardcoded in `server/index.js`, `server/routes/networth.js`, `server/routes/portfolio.js`, and `scripts/split-detector.js`. When we open this up beyond a single user, we'll replace those with a configurable profile path.

## Troubleshooting

**`localhost:3001` shows "Cannot GET /" but `/health` works.**
An old server process (probably a previous `npm run dev`) is holding port 3001 and it's the one responding. Kill it:

```
lsof -ti :3001 | xargs kill -9
```

Within 10 seconds, the launchd agent's restart will grab the port and serve the real app.

**`server.err.log` shows `EADDRINUSE`.**
Same cause as above. Something else is on port 3001. Kill it, and the agent will recover on its next retry.

**The agent won't start after an `nvm` version switch.**
The plist captured a specific Node path (`/Users/you/.nvm/versions/node/vX.Y.Z/bin/node`). If you changed nvm versions or uninstalled that one, the path is dead. Re-run `setup.command` to regenerate the plist with the current Node path, or (better) install Node via Homebrew and re-run setup — Homebrew's path is stable across versions.

**The dashboard shows data that looks wrong or stale.**
The server caches Yahoo Finance responses to `dashboard/server/cache/`. Delete that folder and hit **Sync** in the UI (or restart the agent) to repopulate. Sync is also exposed via `POST /api/sync`.
