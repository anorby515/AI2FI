@echo off
REM AI2FI - Dashboard uninstall wrapper (Windows)
REM Double-click this file from File Explorer.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"

if errorlevel 1 (
  echo.
  echo Uninstall exited with an error. Scroll up for details.
  pause
)
