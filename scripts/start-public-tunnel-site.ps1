$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

$runtimeRoot = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\runtimes\cua_node"
$node = Get-ChildItem -LiteralPath $runtimeRoot -Directory |
  Sort-Object LastWriteTime -Descending |
  ForEach-Object { Join-Path $_.FullName "bin\node.exe" } |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1
if (-not $node) { throw "Node.js runtime not found." }

$env:PATH = "$(Split-Path -Parent $node);$env:PATH"
$env:NODE_ENV = "production"
$env:DATA_DIR = Join-Path $root ".data"
$env:BASE_URL = if ($env:PUBLIC_TUNNEL_URL) { $env:PUBLIC_TUNNEL_URL } else { "http://127.0.0.1:4173" }
$env:PRIVATE_AUTO_LOGIN = "false"
$env:LOCAL_RESET_LINKS = "false"
$env:NEXT_TELEMETRY_DISABLED = "1"

Write-Host "Starting private archive for public tunnel: $($env:BASE_URL)" -ForegroundColor Cyan
Write-Host "Private auto-login: disabled"
& $node "node_modules\next\dist\bin\next" start -H 127.0.0.1 -p 4173
