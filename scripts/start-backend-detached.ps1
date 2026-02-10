$target = Join-Path (Join-Path (Join-Path $PSScriptRoot 'dev') 'ps1') 'start-backend-detached.ps1'
& $target @args
exit $LASTEXITCODE
