[CmdletBinding()]
param([switch]$Apply, [switch]$VerifyOnly)

$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expectedMigration = '20261015110000_o_level_integration_activity_marks.sql'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
$migration = Join-Path $root "supabase\migrations\$expectedMigration"
$mirror = Join-Path $root 'database\migrations\115_o_level_integration_activity_marks.sql'

if ($Apply -and $VerifyOnly) { throw 'Choose either -Apply or -VerifyOnly, not both.' }
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is missing. Run npm ci in the OURSCHOOL workspace first.' }
if (-not (Test-Path -LiteralPath $migration) -or -not (Test-Path -LiteralPath $mirror)) {
  throw 'The O-Level activity migration or its database mirror is missing.'
}
if ((Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $mirror -Algorithm SHA256).Hash) {
  throw 'The migration and database mirror differ. Nothing was pushed.'
}

function Invoke-Supabase {
  param([string[]]$CliArguments)
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $cli @CliArguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
}

function Get-PendingMigrations {
  param([string[]]$Output)
  @($Output | ForEach-Object {
    if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1].Trim() }
  } | Sort-Object -Unique)
}

function Invoke-DryRunWithRetry {
  param([string]$DatabaseUrl, [string]$Purpose)
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $result = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$DatabaseUrl)
    $result.Output | ForEach-Object { Write-Host $_ }
    if ($result.ExitCode -eq 0) { return $result }
    if ($attempt -lt 3) {
      Write-Warning "$Purpose connection failed (attempt $attempt of 3). Retrying this read-only check; nothing will be pushed."
      Start-Sleep -Seconds (2 * $attempt)
    }
  }
  throw "$Purpose failed after three read-only attempts. Remote migration state is unknown; do not apply until a dry run succeeds."
}

$securePassword = Read-Host 'Supabase database password (hidden)' -AsSecureString
try {
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

  Write-Host "Target Supabase project: $projectRef"
  Write-Host "Only permitted pending migration: $expectedMigration"
  Write-Host 'This script does not deploy the web app or Edge Functions.'
  $preview = Invoke-DryRunWithRetry -DatabaseUrl $databaseUrl -Purpose 'Database status check'
  $pending = @(Get-PendingMigrations -Output $preview.Output)

  if ($pending.Count -eq 0 -and ($preview.Output -join "`n") -match 'Remote database is up to date') {
    Write-Host 'VERIFIED: The O-Level activity migration is recorded as applied. Nothing was pushed.'
    Write-Host 'The web app still needs its normal deployment for the entry and report screens.'
    return
  }
  if ($pending.Count -ne 1 -or $pending[0] -cne $expectedMigration) {
    throw "Dry run listed: $($pending -join ', '). Expected only $expectedMigration. Nothing was pushed."
  }
  if ($VerifyOnly) { Write-Host "VERIFIED: $expectedMigration is still pending. Nothing was pushed."; return }
  if (-not $Apply) { Write-Host 'Dry run passed. Rerun with -Apply to request a confirmed database push.'; return }

  $confirmation = (Read-Host "Type APPLY to push only $expectedMigration").Trim()
  if ($confirmation -cne 'APPLY') { throw 'Confirmation was not APPLY. Nothing was pushed.' }
  $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
  $push.Output | ForEach-Object { Write-Host $_ }
  if ($push.ExitCode -ne 0) { throw 'Migration push failed. Inspect the SQL error before retrying.' }

  $verify = Invoke-DryRunWithRetry -DatabaseUrl $databaseUrl -Purpose 'Post-push verification'
  if ((Get-PendingMigrations -Output $verify.Output).Count -ne 0 -or
      ($verify.Output -join "`n") -notmatch 'Remote database is up to date') {
    throw 'Migration was submitted, but remote history could not be verified. Do not push again until checked.'
  }
  Write-Host 'O-Level activity migration applied and verified. Deploy the approved web release separately.'
} finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
