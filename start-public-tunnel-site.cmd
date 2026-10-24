@echo off
setlocal
title Joshua Kimmich Archive - Public Tunnel
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-public-tunnel-site.ps1"
if errorlevel 1 pause
endlocal
