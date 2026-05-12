@echo off
REM AI2FI - Dashboard setup wrapper (Windows)
REM
REM Double-click this file from File Explorer. Calls setup.ps1 with
REM -ExecutionPolicy Bypass so users don't have to mess with Windows
REM script-signing policies.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

if errorlevel 1 (
  echo.
  echo Setup exited with an error. Scroll up for details.
  pause
)
