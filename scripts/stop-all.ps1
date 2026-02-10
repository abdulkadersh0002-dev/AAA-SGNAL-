param(
  [string]$Ports = '4101,4173'
)

& (Join-Path $PSScriptRoot 'free-ports.ps1') -Ports $Ports
exit $LASTEXITCODE
