@echo off
setlocal
title Joshua Kimmich Archive - Private Test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-private-site.ps1"
if errorlevel 1 (
  echo.
  echo The private archive could not be started.
  pause
)
endlocal
