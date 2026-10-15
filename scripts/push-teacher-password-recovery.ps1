[CmdletBinding()]
param(
  [switch]$CliDebug,
  [switch]$ApplyMigration,
  [switch]$DeployFunction
)

# Default mode only performs a dry run. Applying the RLS-changing migration and
# deploying the recovery function require separate switches and confirmations.
$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expectedMigrations = @(
  '20261013130000_teacher_recovery_dashboard_scope.sql',
  '20261013150000_staff_card_telephone.sql'
)
$functionName = 'request-school-teacher-password-reset'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }
foreach ($expectedMigration in $expectedMigrations) {
  $migration = Join-Path $root "supabase\migrations\$expectedMigration"
  if (-not (Test-Path -LiteralPath $migration)) { throw "Expected migration is missing: $expectedMigration" }
}

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

function Get-PendingMigrations {
  param([string[]]$Output)
  @($Output | ForEach-Object {
    if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
  } | Sort-Object -Unique)
}

function Test-RemoteCurrent {
  param([string]$Url)
  $check = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$Url)
  $check.Output | ForEach-Object { Write-Output $_ }
  if ($check.ExitCode -ne 0) { return $false }
  $remaining = Get-PendingMigrations -Output $check.Output
  return ($remaining.Count -eq 0 -and (($check.Output -join "`n") -match 'Remote database is up to date'))
}

try {
  Write-Host "Target Supabase project: $projectRef"
  Write-Host 'Expected migrations:'
  $expectedMigrations | ForEach-Object { Write-Host "  $_" }
  Write-Host 'Default mode is dry-run only. This migration changes teacher-facing RLS access.'
  $securePassword = Read-Host 'Supabase database password (hidden; not the dashboard URL)' -AsSecureString
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

  $preview = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $preview.Output | ForEach-Object { Write-Output $_ }
  if ($preview.ExitCode -ne 0) { throw 'Dry run failed. Nothing was pushed and the Edge Function was not deployed.' }
  $pending = Get-PendingMigrations -Output $preview.Output
  $previewText = $preview.Output -join "`n"
  $alreadyCurrent = $pending.Count -eq 0 -and $previewText -match 'Remote database is up to date'
  $unexpected = @($pending | Where-Object { $_ -cnotin $expectedMigrations })
  $missing = @($expectedMigrations | Where-Object { $_ -cnotin $pending })
  if (-not $alreadyCurrent -and ($unexpected.Count -gt 0 -or $missing.Count -gt 0)) {
    throw "Dry run did not match the approved migration set. Pending: $($pending -join ', '). Unexpected: $($unexpected -join ', '). Missing: $($missing -join ', '). Nothing was pushed."
  }

  if (-not $alreadyCurrent) {
    if (-not $ApplyMigration) {
      Write-Host "Dry run verified the expected migrations: $($expectedMigrations -join ', ')"
      Write-Host 'To apply them, run: .\scripts\push-teacher-password-recovery.ps1 -ApplyMigration'
      return
    }
    $confirmation = (Read-Host "Type APPLY to apply only these migrations: $($expectedMigrations -join ', ')").Trim()
    if ($confirmation -ne 'APPLY') { throw "Confirmation was not APPLY (received '$confirmation'). Nothing was pushed." }
    $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
    $push.Output | ForEach-Object { Write-Output $_ }
    if ($push.ExitCode -ne 0) { throw 'Migration push failed. The Edge Function was not deployed.' }
    if (-not (Test-RemoteCurrent -Url $databaseUrl)) { throw 'Remote history did not confirm the migration is current. The Edge Function was not deployed.' }
  }
  else { Write-Host 'Remote database already reports this migration is current.' }

  if (-not $DeployFunction) {
    Write-Warning "Migration is current. Edge Function was not deployed; rerun with -DeployFunction after checking its environment secrets."
    return
  }
  Write-Host 'Confirm PUBLIC_APP_URL is the intended recovery-page origin and Auth allows its /reset-password/school redirect.'
  Write-Host 'Confirm RESEND_API_KEY and SCHOOL_INVITATION_FROM_EMAIL are configured for recovery emails.'
  $deployConfirmation = Read-Host "Type DEPLOY to deploy only $functionName"
  if ($deployConfirmation -cne 'DEPLOY') { throw 'Confirmation was not DEPLOY. The Edge Function was not deployed.' }
  $deployment = Invoke-Supabase -CliArguments @('functions','deploy',$functionName,'--project-ref',$projectRef,'--use-api')
  $deployment.Output | ForEach-Object { Write-Output $_ }
  if ($deployment.ExitCode -ne 0) { throw "Deployment failed for '$functionName'. Inspect the deployment error before retrying." }
  Write-Host "Migration and $functionName deployment completed."
}
finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
