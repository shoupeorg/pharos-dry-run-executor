$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
$Git = { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args) & git -c "safe.directory=$Project" @Args; if ($LASTEXITCODE -ne 0) { throw "git $($Args -join ' ') failed with exit code $LASTEXITCODE." } }
if (-not (Test-Path -LiteralPath '.git')) { & $Git init -b main }
& $Git add --all
& $Git commit -m 'Deliver Pharos Dry-Run Executor'
$remotes = & git -c "safe.directory=$Project" remote
if ($remotes -notcontains 'origin') { & $Git remote add origin https://github.com/shoupeorg/pharos-dry-run-executor.git }
& $Git push -u origin main
Write-Host 'SOURCE PUBLICATION COMPLETE' -ForegroundColor Green
