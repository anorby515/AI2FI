#Requires -Version 5.1
<#
.SYNOPSIS
  AI2FI - Dashboard uninstall (Windows)

.DESCRIPTION
  Unregisters the Scheduled Task that auto-starts the dashboard on
  login, and kills any lingering process on port 3001. Does NOT touch
  your project files, your spreadsheet, or anything under user-profiles\.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'

$DashboardDir = $PSScriptRoot
$RunBat   = Join-Path $DashboardDir 'run-server.bat'
$TaskName = 'AI2FI Dashboard'

function Step { Write-Host ''; Write-Host '==> ' -ForegroundColor Cyan -NoNewline; Write-Host $args[0] -ForegroundColor White }
function Ok   { Write-Host '[OK] ' -ForegroundColor Green -NoNewline; Write-Host $args[0] }
function Warn { Write-Host '[!]  ' -ForegroundColor Yellow -NoNewline; Write-Host $args[0] }

Step "Unregistering Scheduled Task ($TaskName)"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  try { Stop-ScheduledTask -TaskName $TaskName } catch { }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Ok 'Task removed'
} else {
  Warn 'Task was not registered (nothing to remove)'
}

Step 'Stopping anything on port 3001'
$conns = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($conns) {
  $conns | ForEach-Object {
    try { Stop-Process -Id $_.OwningProcess -Force } catch { }
  }
  Ok 'Port released'
} else {
  Ok 'Nothing was listening on 3001'
}

Step 'Cleaning up the run-server wrapper'
if (Test-Path $RunBat) {
  Remove-Item -Path $RunBat -Force
  Ok 'run-server.bat removed'
} else {
  Ok 'No wrapper found (already clean)'
}

Write-Host ''
Write-Host 'Your project files, spreadsheet, and user-profiles\ are untouched.' -ForegroundColor DarkGray
Write-Host ''
Read-Host 'Press Enter to close this window' | Out-Null
