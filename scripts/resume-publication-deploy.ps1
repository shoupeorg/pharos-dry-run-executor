$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
$Git = { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args) & git -c "safe.directory=$Project" @Args; if ($LASTEXITCODE -ne 0) { throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE." } }

Write-Host '==> Push completed source' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'publish-source.ps1')

Write-Host '==> Verify existing Cloudflare authentication' -ForegroundColor Cyan
npx.cmd wrangler whoami
if ($LASTEXITCODE -ne 0) { throw 'Wrangler authentication is unavailable. Run npx wrangler login once, then rerun this same resume command.' }

Write-Host '==> Provision D1, migrate, and deploy once' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'provision-deploy.ps1')

Write-Host '==> Publish the deployed D1 configuration if it changed' -ForegroundColor Cyan
& $Git add wrangler.jsonc
& git -c "safe.directory=$Project" diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & $Git commit -m 'Configure deployed Cloudflare D1'
  & $Git push origin main
}

Write-Host '==> Verify public UI, logo, API, and saved examples' -ForegroundColor Cyan
$env:DRY_RUN_BASE_URL = 'https://pharos-dry-run-executor.shoupeorg.workers.dev'
node scripts\verify-public.mjs
if ($LASTEXITCODE -ne 0) { throw 'Public verification failed.' }

$localHead = (& git -c "safe.directory=$Project" rev-parse HEAD).Trim()
& git -c "safe.directory=$Project" fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Remote verification fetch failed.' }
$remoteHead = (& git -c "safe.directory=$Project" rev-parse origin/main).Trim()
if ($localHead -ne $remoteHead) { throw "Commit mismatch: local=$localHead remote=$remoteHead" }
Write-Host "DELIVERY VERIFIED: $localHead" -ForegroundColor Green
