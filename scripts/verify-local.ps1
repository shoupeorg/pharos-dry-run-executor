$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "Tests failed with exit code $LASTEXITCODE." }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE." }
node --check public\app.js
if ($LASTEXITCODE -ne 0) { throw "Browser JavaScript syntax check failed with exit code $LASTEXITCODE." }
Write-Host 'LOCAL VERIFICATION PASSED' -ForegroundColor Green
