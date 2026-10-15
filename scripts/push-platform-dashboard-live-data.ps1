[CmdletBinding()]
param(
  [switch]$ApplyMigration,
  [switch]$ConfirmPush,
  [switch]$CliDebug
)

$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expectedMigration = '20261013120000_platform_directory_live_tenant_data.sql'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
$migration = Join-Path $root "supabase\migrations\$expectedMigration"
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }
if (-not (Test-Path -LiteralPath $migration)) { throw "Expected migration is missing: $expectedMigration" }

function Invoke-Supabase {
  param([string[]]$CliArguments)
  if ($CliDebug) { $CliArguments += '--debug' }
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $cli @CliArguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $previousPreference }
  [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
}

function Test-RemoteCurrent {
  param([string]$Url)
  $check = Invoke-Supabase -CliArguments @('db', 'push', '--dry-run', '--skip-vault', '--db-url', $Url)
  $check.Output | ForEach-Object { Write-Output $_ }
  if ($check.ExitCode -ne 0) { return $false }
  return (($check.Output -join "`n") -match 'Remote database is up to date')
}

try {
  Write-Host "Target Supabase project: $projectRef"
  Write-Host "Only this migration is permitted: $expectedMigration"
  $securePassword = Read-Host 'Supabase database password (hidden; not your dashboard URL)' -AsSecureString
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

  Write-Host 'DRY RUN: no database changes will be made.'
  $preview = Invoke-Supabase -CliArguments @('db', 'push', '--dry-run', '--skip-vault', '--db-url', $databaseUrl)
  $preview.Output | ForEach-Object { Write-Output $_ }
  if ($preview.ExitCode -ne 0) { throw 'Dry run failed. Nothing was pushed.' }
  $previewText = $preview.Output -join "`n"
  $pending = @($preview.Output | ForEach-Object {
    if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
  } | Sort-Object -Unique)
  if ($pending.Count -eq 0 -and $previewText -match 'Remote database is up to date') {
    Write-Host 'Remote database already has this migration.'
    return
  }
  if ($pending.Count -ne 1 -or $pending[0] -cne $expectedMigration) {
    throw "Expected only '$expectedMigration'; dry run listed: $($pending -join ', '). Nothing was pushed."
  }
  if (-not $ApplyMigration) {
    Write-Host "Review the migration, then rerun with -ApplyMigration -ConfirmPush to push only '$expectedMigration'."
    return
  }

  if (-not $ConfirmPush) {
    Write-Host "Dry run succeeded. Nothing was pushed. Review the migration, then rerun with -ApplyMigration -ConfirmPush to apply only '$expectedMigration'."
    return
  }

  $push = Invoke-Supabase -CliArguments @('db', 'push', '--skip-vault', '--db-url', $databaseUrl, '--yes')
  $push.Output | ForEach-Object { Write-Output $_ }
  if ($push.ExitCode -ne 0 -and ($push.Output -join "`n") -notmatch 'Connection terminated unexpectedly|connection reset|connection refused|timeout') {
    throw 'Migration push failed. Check the Supabase CLI error above.'
  }
  if ($push.ExitCode -ne 0) { Write-Warning 'Connection dropped during push; checking remote history before any retry.' }
  if (-not (Test-RemoteCurrent -Url $databaseUrl)) {
    throw 'Remote history did not confirm the migration. Do not retry blindly; inspect the dry-run output.'
  }
  Write-Host 'Remote migration history confirms the platform dashboard migration is applied.'
}
finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential, securePassword, databaseUrl, encodedPassword -ErrorAction SilentlyContinue
}
