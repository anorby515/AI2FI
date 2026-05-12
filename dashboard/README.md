# AI2FI Dashboard

The dashboard is the "seeing" half of AI2FI — a local web app that reads your financial data (a spreadsheet on your own machine) and renders portfolio, net worth, and benchmark views. It pairs with Claude, who handles the "thinking" half: coaching, framing, and teaching.

Everything runs locally. No data leaves your machine. No account to create.

## Prerequisites

**macOS:**
- macOS (`launchd`, `open`)
- Homebrew — the setup script will install it for you if missing (one Y/N prompt; the official installer asks for your password once)
- Node.js — `setup.command` installs it via Homebrew if missing

**Windows:**
- Windows 10/11
- winget — ships with Windows 11 and recent Windows 10 builds; install "App Installer" from the Microsoft Store if missing
- Node.js — `setup.cmd` installs it via winget if missing
- PowerShell 5.1+ — ships with Windows

Note on Node: if you use `nvm` on macOS, see the caveat at the bottom. The short version is that a Homebrew-managed Node is more stable for something that needs to auto-start on login.

## Quick start

### macOS

The path with the least friction is a one-line Terminal install from the repo root:

```
curl -L https://github.com/anorby515/AI2FI/archive/refs/heads/release.tar.gz | tar xz && cd AI2FI-release && bash dashboard/setup.command
```

This downloads, unpacks, and runs setup in one step. No Gatekeeper prompt, no rename.

Alternatively, if you already have the repo locally (via `git clone` or an unzipped download):

```
cd /path/to/AI2FI
bash dashboard/setup.command
```

The script installs dependencies, builds the client, registers a launchd agent, and opens `http://localhost:3001` in your browser. First run takes a couple of minutes; subsequent logins are near-instant.

### Windows

One-line PowerShell install from the repo root:

```
iwr https://github.com/anorby515/AI2FI/archive/refs/heads/release.zip -OutFile ai2fi.zip; Expand-Archive ai2fi.zip -DestinationPath . -Force; cd AI2FI-release; .\dashboard\setup.cmd
```

If you already have the repo locally, double-click `dashboard\setup.cmd` from File Explorer, or run it from PowerShell:

```
cd C:\path\to\AI2FI
.\dashboard\setup.cmd
```

The script installs dependencies, builds the client, registers a Scheduled Task (`AI2FI Dashboard`), and opens `http://localhost:3001` in your browser.

### If you double-click `setup.command` from Finder

It works, but on macOS 15+ Gatekeeper will block the file if it was downloaded from the internet (ZIP downloads get the quarantine flag; git clones don't). You'll see a "setup.command cannot be opened" dialog with only "Move to Trash" and "Done" options.

To get past it:

1. Click **Done**.
2. Open **System Settings → Privacy & Security**.
3. Scroll to the Security section at the bottom.
4. Next to "*setup.command was blocked to protect your Mac*", click **Open Anyway**.
5. Confirm and authenticate.

The `bash dashboard/setup.command` path above avoids all of this — `bash` reads the script contents and doesn't invoke the Gatekeeper check that Finder does.

## What the installer does

The same flow on both platforms, with platform-specific tools.

| Step | macOS (`setup.command`) | Windows (`setup.cmd` → `setup.ps1`) |
|---|---|---|
| 1. Package manager | Offers to install Homebrew if missing (Y/N prompt; official installer). | Verifies winget is present (bails with a link to the Microsoft Store if missing — Microsoft ships winget as a Store app). |
| 2. Node | Offers to `brew install node` if missing. | Offers to `winget install OpenJS.NodeJS.LTS` if missing. |
| 3. Profile | Auto-detects or prompts for a profile name; creates `user-profiles/<name>/` and writes `.ai2fi-config`. | Same. |
| 4. npm deps | `npm install` in `dashboard/` and `dashboard/client/`. | Same. |
| 5. Build | `npm run build` → `dashboard/client/dist/`. | Same. |
| 6. Auto-start | Generates `~/Library/LaunchAgents/com.ai2fi.dashboard.plist` from the template and `launchctl load`s it. | Generates `dashboard/run-server.bat` and registers Scheduled Task `AI2FI Dashboard` (trigger: AtLogOn). |
| 7. Port cleanup | Kills anything on port 3001 first (belt and suspenders). | Same — uses `Get-NetTCPConnection`. |
| 8. Verify | Polls `http://localhost:3001/health`, opens browser when ready. | Same. |

Both auto-restart on crash with a 10-second throttle (launchd `KeepAlive` on Mac; Task Scheduler `RestartCount` on Windows).

## How to uninstall

**macOS:** double-click `uninstall.command` in this folder. Unloads the launchd agent, removes the plist, kills any lingering process on port 3001.

**Windows:** double-click `uninstall.cmd` in this folder. Unregisters the Scheduled Task, kills any lingering process on port 3001, removes the generated `run-server.bat`.

Neither touches your project files, your spreadsheet, or anything in `user-profiles/`.

## Day-to-day

- **Dashboard URL:** http://localhost:3001
- **Server logs:** `dashboard/logs/server.log`
- **Server errors:** `dashboard/logs/server.err.log`
- **Agent / task status:**
  - macOS: `launchctl list | grep ai2fi` — the middle column is the PID. A number means running; `-` means it crashed (check `server.err.log`).
  - Windows: `Get-ScheduledTask -TaskName "AI2FI Dashboard"` — the `State` is `Running` when active.

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
├── setup.command               # Double-click installer (macOS)
├── uninstall.command           # Double-click uninstaller (macOS)
├── setup.cmd / setup.ps1       # Double-click installer (Windows)
├── uninstall.cmd / uninstall.ps1  # Double-click uninstaller (Windows)
├── com.ai2fi.dashboard.plist.template  # launchd agent template (macOS)
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

The server reads from one of two places, in this order:

1. **`user-profiles/<active-profile>/private/Finances.xlsx`** — the user's own data, once the Coach has copied the template into their profile (see `core/finances-template-setup.md`).
2. **`core/sample-data/Financial Template.xlsx`** *(committed demo template)* — fallback when the user's file doesn't exist yet, so the dashboard renders meaningful demo data immediately on a fresh clone.

The active profile is resolved by `server/profile-resolver.js` in this order: `AI2FI_PROFILE` env var → `.ai2fi-config` at the repo root → first non-`example` directory under `user-profiles/`.

The user-vs-template selection lives in the same resolver (`resolveSpreadsheet()`), and every route that reads xlsx data goes through it. When the dashboard is on the demo template, `/api/profile` returns `isTemplate: true`; the client renders a sticky banner across all views and defaults the sidebar to "Getting Started." As soon as `private/Finances.xlsx` appears, the next poll flips `isTemplate` to false and the dashboard pivots — no server restart required.

`/api/sync` refuses to run when `isTemplate` is true, to keep the demo template's tickers from polluting the splits/quotes/benchmark caches.

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

**Windows: setup.cmd was blocked by Windows SmartScreen.**
On a freshly downloaded ZIP, Windows may show "Windows protected your PC" on the first run. Click **More info** → **Run anyway**. The PowerShell one-liner install path avoids this.

**Windows: the Scheduled Task is registered but the server isn't responding.**
Check `dashboard\logs\server.err.log` first. If empty, run `Get-ScheduledTask -TaskName "AI2FI Dashboard" | Get-ScheduledTaskInfo` to see `LastTaskResult` (0 = success; non-zero is the exit code or error). The most common cause is Node not being on PATH when the task ran — re-run `setup.cmd` to regenerate `run-server.bat` with the current Node path.
