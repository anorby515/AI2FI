#Requires -Version 5.1
<#
.SYNOPSIS
  AI2FI — Dashboard setup (Windows)

.DESCRIPTION
  Double-click setup.cmd in this folder. After a one-time setup, the
  dashboard will auto-start every time you log into Windows, reachable
  at http://localhost:3001.

  What this script does:
    1. Verifies winget is installed
    2. Verifies Node is installed (offers to install via winget if missing)
    3. Configures your profile (under user-profiles/)
    4. Installs npm dependencies for the server and client
    5. Builds the client
    6. Registers a Scheduled Task so the server runs on login
    7. Starts the server now and opens it in your browser

  To undo: double-click uninstall.cmd in this same folder.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# --- Resolve paths ---
$DashboardDir = $PSScriptRoot
$RepoRoot     = Split-Path $DashboardDir -Parent
$ClientDir    = Join-Path $DashboardDir 'client'
$ServerEntry  = Join-Path $DashboardDir 'server\index.js'
$LogsDir      = Join-Path $DashboardDir 'logs'
$RunBat       = Join-Path $DashboardDir 'run-server.bat'
$TaskName     = 'AI2FI Dashboard'
$ConfigFile   = Join-Path $RepoRoot '.ai2fi-config'
$ProfilesDir  = Join-Path $RepoRoot 'user-profiles'

# --- Pretty output helpers ---
function Step  { Write-Host ''; Write-Host '==> ' -ForegroundColor Cyan -NoNewline; Write-Host $args[0] -ForegroundColor White }
function Ok    { Write-Host '[OK] ' -ForegroundColor Green -NoNewline; Write-Host $args[0] }
function Warn  { Write-Host '[!]  ' -ForegroundColor Yellow -NoNewline; Write-Host $args[0] }
function Fail  { Write-Host '[X]  ' -ForegroundColor Red -NoNewline; Write-Host $args[0] }

function Wait-And-Exit {
  param([int]$Code)
  Write-Host ''
  Read-Host 'Press Enter to close this window' | Out-Null
  exit $Code
}

# --- Step 1: winget ---
Step 'Checking for winget'
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Fail 'winget is not installed.'
  Write-Host ''
  Write-Host 'winget ships with Windows 11 and recent Windows 10 builds.'
  Write-Host "If you don't have it, install 'App Installer' from the Microsoft Store,"
  Write-Host 'or get it from https://aka.ms/getwinget, then double-click setup.cmd again.'
  Wait-And-Exit 1
}
Ok "winget is available ($((winget --version) -replace '^v',''))"

# --- Step 2: Node ---
Step 'Checking for Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Warn 'Node.js is not installed.'
  Write-Host ''
  $reply = Read-Host 'Install Node.js LTS now via winget? [Y/n]'
  if ($reply -match '^[Nn]') {
    Fail 'Setup cannot continue without Node.js.'
    Wait-And-Exit 1
  }
  winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements | Out-Host

  # Refresh PATH for this session so the freshly installed node is visible.
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node install finished but 'node' is not on PATH."
    Write-Host 'Close this window, open a new one, and double-click setup.cmd again.'
    Wait-And-Exit 1
  }
}
$NodePath = (Get-Command node).Source
Ok "Node.js $(node --version) at $NodePath"

# --- Step 2.5: User profile ---
# The dashboard reads from user-profiles\<name>\private\Finances.xlsx. The
# server resolves the active profile via (env -> .ai2fi-config -> auto-detect).
# Make sure one of those signals exists before launching.
Step 'Configuring your profile'

$configuredProfile = ''
if (Test-Path $ConfigFile) {
  try {
    $configuredProfile = (Get-Content $ConfigFile -Raw | ConvertFrom-Json).profile
  } catch { }
}

if ($configuredProfile) {
  Ok "Using existing profile: $configuredProfile (from .ai2fi-config)"
} else {
  $detected = ''
  if (Test-Path $ProfilesDir) {
    $first = Get-ChildItem $ProfilesDir -Directory -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -ne 'example' } |
             Select-Object -First 1
    if ($first) { $detected = $first.Name }
  }

  if ($detected) {
    @{ profile = $detected } | ConvertTo-Json -Compress | Set-Content -Path $ConfigFile -Encoding UTF8
    Ok "Detected existing profile `"$detected`" - wrote .ai2fi-config"
  } else {
    Write-Host ''
    Write-Host 'The dashboard reads your financial data from a local spreadsheet at:'
    Write-Host '  user-profiles\<name>\private\Finances.xlsx' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host 'What name should we use for your profile? (lowercase letters, numbers, dashes)'
    $rawName = Read-Host 'Profile name'
    $profileName = ($rawName.ToLower() -replace '[^a-z0-9\-]', '')
    if (-not $profileName -or $profileName -eq 'example') {
      Fail "Invalid name. Using 'you' as a fallback - rename the folder later if you want."
      $profileName = 'you'
    }
    New-Item -ItemType Directory -Path (Join-Path $ProfilesDir "$profileName\private")  -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $ProfilesDir "$profileName\research") -Force | Out-Null
    @{ profile = $profileName } | ConvertTo-Json -Compress | Set-Content -Path $ConfigFile -Encoding UTF8
    Ok "Created user-profiles\$profileName\ and wrote .ai2fi-config"
  }
}

# --- Step 3: Install server dependencies ---
Step 'Installing server dependencies'
Push-Location $DashboardDir
try {
  npm install --no-audit --no-fund | Out-Host
} finally {
  Pop-Location
}
Ok 'Server dependencies installed'

# --- Step 4: Install client dependencies + build ---
Step 'Installing client dependencies'
Push-Location $ClientDir
try {
  npm install --no-audit --no-fund | Out-Host
  Ok 'Client dependencies installed'

  Step 'Building the client for production'
  npm run build | Out-Host
  Ok "Client built to $ClientDir\dist"
} finally {
  Pop-Location
}

# --- Step 5: Scheduled Task ---
Step "Registering Scheduled Task ($TaskName)"
New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

# If the task already exists (re-running setup), tear it down cleanly first.
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch { }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Belt and suspenders: kill anything else holding port 3001 (e.g. a prior
# `npm run dev` session) so the new task can bind.
$conns = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($conns) {
  Warn 'Found an existing process on port 3001 - stopping it so the new task can bind.'
  $conns | ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch { }
  }
  Start-Sleep -Seconds 1
}

# Generate run-server.bat: the launchd command-line equivalent. Task
# Scheduler executes this; it cd's into the dashboard dir, runs node on
# the server entry, and appends stdout/stderr to logs/.
$batLines = @(
  '@echo off'
  'cd /d "%~dp0"'
  ('"' + $NodePath + '" "' + $ServerEntry + '" >> "' + (Join-Path $LogsDir 'server.log') + '" 2>> "' + (Join-Path $LogsDir 'server.err.log') + '"')
)
Set-Content -Path $RunBat -Value $batLines -Encoding ASCII

$userId   = "$env:USERDOMAIN\$env:USERNAME"
$action   = New-ScheduledTaskAction -Execute $RunBat -WorkingDirectory $DashboardDir
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $userId
# RestartCount 999 + 10s interval mirrors launchd's KeepAlive throttle.
# ExecutionTimeLimit = 0 disables the default 72-hour kill.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
              -RestartCount 999 `
              -RestartInterval (New-TimeSpan -Seconds 10) `
              -ExecutionTimeLimit ([TimeSpan]::Zero) `
              -AllowStartIfOnBatteries `
              -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Ok 'Scheduled Task registered. The dashboard will auto-start every time you log in.'

# --- Step 6: Wait for the server, then open it ---
Step 'Waiting for the server to come up'
$up = $false
for ($i = 1; $i -le 20; $i++) {
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $up = $true; break }
  } catch { }
  Start-Sleep -Milliseconds 500
}
if ($up) {
  Ok 'Server is responding at http://localhost:3001'
} else {
  Warn "Server did not respond within 10 seconds. Check $LogsDir\server.err.log for details."
}

Step 'Opening the dashboard in your browser'
Start-Process 'http://localhost:3001'

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host ''
Write-Host "  Dashboard URL:  http://localhost:3001"
Write-Host "  Server logs:    $LogsDir\server.log" -ForegroundColor DarkGray
Write-Host "  To uninstall:   double-click uninstall.cmd in this folder" -ForegroundColor DarkGray
Write-Host ''
Read-Host 'Press Enter to close this window' | Out-Null
