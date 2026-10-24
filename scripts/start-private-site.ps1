$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Find-Node {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $runtimeRoot = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\runtimes\cua_node"
  if (Test-Path -LiteralPath $runtimeRoot) {
    $candidate = Get-ChildItem -LiteralPath $runtimeRoot -Directory |
      Sort-Object LastWriteTime -Descending |
      ForEach-Object { Join-Path $_.FullName "bin\node.exe" } |
      Where-Object { Test-Path -LiteralPath $_ } |
      Select-Object -First 1
    if ($candidate) { return $candidate }
  }
  throw "Node.js 22.13 or newer was not found. Install Node.js 24, then run this launcher again."
}

function Find-FreePort {
  foreach ($port in @(4173, 8080, 3000, 3001, 4174)) {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
    try {
      $listener.Start()
      $listener.Stop()
      return $port
    } catch {
      try { $listener.Stop() } catch {}
    }
  }
  throw "No free local port was found. Close programs using ports 4173, 8080, or 3000 and retry."
}

$node = Find-Node
$nodeDirectory = Split-Path -Parent $node
$env:PATH = "$nodeDirectory;$env:PATH"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:DATA_DIR = Join-Path $root ".data"
$env:LOCAL_RESET_LINKS = "true"
$env:PRIVATE_AUTO_LOGIN = "true"

foreach ($existingPort in @(4173, 8080, 3000, 3001, 4174)) {
  try {
    $existingHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$existingPort/api/health" -TimeoutSec 2
    if ($existingHealth.ok -and $existingHealth.service -eq "kimmich-archive") {
      $existingUrl = "http://127.0.0.1:$existingPort/"
      Write-Host "The private archive is already running at $existingUrl" -ForegroundColor Green
      Start-Process $existingUrl
      return
    }
  } catch {}
}

$port = Find-FreePort
$siteUrl = "http://127.0.0.1:$port/"
$healthUrl = "${siteUrl}api/health"
$env:BASE_URL = $siteUrl.TrimEnd("/")
$env:PORT = "$port"
$env:HOSTNAME = "127.0.0.1"

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\next\dist\bin\next"))) {
  throw "Dependencies are missing. Run npm ci in $root first."
}

$envFile = Join-Path $root ".env.local"
if (-not (Test-Path -LiteralPath $envFile)) {
  $localConfig = @"
# Private local test configuration.
DATA_DIR=./.data
BASE_URL=http://127.0.0.1:4173
LOCAL_RESET_LINKS=true
PRIVATE_AUTO_LOGIN=true

# Optional: add your server-side API-Football key to load real scores and ratings.
API_FOOTBALL_API_KEY=
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_TEAM_IDS=157,25
API_FOOTBALL_LOOKBACK_DAYS=365
API_FOOTBALL_LOOKAHEAD_DAYS=180
API_FOOTBALL_RATING_LIMIT=8
"@
  [System.IO.File]::WriteAllText(
    $envFile,
    $localConfig,
    (New-Object System.Text.UTF8Encoding($false))
  )
  Write-Host "Created .env.local. Add API_FOOTBALL_API_KEY there to enable live scores and ratings." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Joshua Kimmich Archive - private test" -ForegroundColor Cyan
Write-Host "Local address: $siteUrl" -ForegroundColor Green
Write-Host "Demo admin: admin@example.com / KimmichArchive!2026"
Write-Host "API configuration: edit .env.local, then restart this window."
Write-Host "Press Ctrl+C to stop the site."
Write-Host "The browser will open only after the server is ready."
Write-Host ""

Start-Job -ArgumentList $siteUrl, $healthUrl -ScriptBlock {
  param($address, $health)
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        Start-Process $address
        return
      }
    } catch {}
    Start-Sleep -Milliseconds 750
  }
  Start-Process $address
} | Out-Null

& $node "node_modules\next\dist\bin\next" dev -H 127.0.0.1 -p $port
