[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expectedMigration = '20261014220000_teacher_invitation_activated_context.sql'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }
if (-not (Test-Path -LiteralPath (Join-Path $root "supabase\migrations\$expectedMigration"))) {
  throw "Expected migration is missing: $expectedMigration"
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
  @($Output | ForEach-Object { if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1].Trim() } } | Sort-Object -Unique)
}

$securePassword = Read-Host 'Supabase database password (hidden)' -AsSecureString
try {
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
  Write-Host "Target Supabase project: $projectRef"
  Write-Host "Only $expectedMigration may be pushed. No Edge Functions or web files will be deployed."

  $preview = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $preview.Output | ForEach-Object { Write-Output $_ }
  if ($preview.ExitCode -ne 0) { throw 'Database dry run failed. Nothing was pushed.' }
  $pending = @(Get-PendingMigrations -Output $preview.Output)
  if ($pending.Count -eq 0 -and ($preview.Output -join "`n") -match 'Remote database is up to date') {
    Write-Host 'Remote database is already up to date. Nothing was pushed.'
    return
  }
  if ($pending.Count -ne 1 -or $pending[0] -cne $expectedMigration) {
    throw "Dry run listed: $($pending -join ', '). Expected only $expectedMigration. Nothing was pushed."
  }

  $confirmation = (Read-Host "Type APPLY to push only $expectedMigration").Trim()
  if ($confirmation -cne 'APPLY') { throw 'Confirmation was not APPLY. Nothing was pushed.' }
  $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
  $push.Output | ForEach-Object { Write-Output $_ }
  if ($push.ExitCode -ne 0) { throw 'Migration push failed. Check the SQL error; do not retry blindly.' }

  $verify = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $verify.Output | ForEach-Object { Write-Output $_ }
  if ($verify.ExitCode -ne 0 -or (Get-PendingMigrations -Output $verify.Output).Count -ne 0 -or
      ($verify.Output -join "`n") -notmatch 'Remote database is up to date') {
    throw 'The migration was submitted, but remote migration status could not be verified. Do not push again until checked.'
  }
  Write-Host 'Teacher-facing activation status migration applied and verified.'
} finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
