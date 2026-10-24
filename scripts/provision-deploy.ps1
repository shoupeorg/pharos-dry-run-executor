$ErrorActionPreference = 'Stop'
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
$Config = Join-Path $Project 'wrangler.jsonc'
$text = Get-Content -LiteralPath $Config -Raw
if ($text -match '00000000-0000-0000-0000-000000000000') {
  $created = npx.cmd wrangler d1 create pharos-dry-run-executor 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $created.Trim() }
  $match = [regex]::Match($created, 'database_id\s*=\s*"([0-9a-f-]{36})"|"database_id"\s*:\s*"([0-9a-f-]{36})"')
  if (-not $match.Success) { throw "D1 was created but its database ID could not be parsed. Output: $($created.Trim())" }
  $id = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
  $text = $text.Replace('00000000-0000-0000-0000-000000000000', $id)
  Set-Content -LiteralPath $Config -Value $text -NoNewline
}
npx.cmd wrangler d1 migrations apply pharos-dry-run-executor --remote
if ($LASTEXITCODE -ne 0) { throw 'Remote D1 migration failed.' }
npm.cmd run deploy
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare deployment failed.' }
Write-Host 'CLOUDFLARE DEPLOYMENT COMPLETE' -ForegroundColor Green
