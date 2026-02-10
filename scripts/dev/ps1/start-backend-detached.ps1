param(
  [int]$Port = 4101,
  [switch]$FreePort,
  [int]$TimeoutSec = 30,
  [string]$LogDir = 'logs'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
Set-Location $repoRoot

$healthUrl = "http://127.0.0.1:$Port/api/healthz"

function Test-BackendReady {
  param([string]$Url)
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $Url
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

if (Test-BackendReady -Url $healthUrl) {
  Write-Host "Backend already running: $healthUrl" -ForegroundColor Green
  exit 0
}

if ($FreePort) {
  $freePortsScript = Join-Path (Join-Path $repoRoot 'scripts') 'free-ports.ps1'
  & $freePortsScript -Ports "$Port" | Out-Host
}

$logDirPath = Join-Path $repoRoot $LogDir
New-Item -ItemType Directory -Path $logDirPath -Force | Out-Null

$outLog = Join-Path $logDirPath "backend-$Port.out.log"
$errLog = Join-Path $logDirPath "backend-$Port.err.log"

Remove-Item -Force $outLog, $errLog -ErrorAction SilentlyContinue

$nodePath = (Get-Command node -ErrorAction Stop).Source
$env:PORT = "$Port"

$p = Start-Process -FilePath $nodePath -ArgumentList 'src/server.js' -WorkingDirectory $repoRoot -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

Write-Host "Started backend pid=$($p.Id) port=$Port" -ForegroundColor Cyan
Write-Host "Logs: $outLog" -ForegroundColor DarkGray
Write-Host "Logs: $errLog" -ForegroundColor DarkGray

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$ready = $false
while ((Get-Date) -lt $deadline) {
  if (Test-BackendReady -Url $healthUrl) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if ($ready) {
  Write-Host "Backend READY: $healthUrl" -ForegroundColor Green
  exit 0
}

Write-Host "Backend did not become ready within ${TimeoutSec}s: $healthUrl" -ForegroundColor Yellow
Write-Host "ERR tail:" -ForegroundColor Yellow
if (Test-Path $errLog) {
  Get-Content $errLog -Tail 160 | Out-Host
}
exit 1
