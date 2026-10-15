[CmdletBinding()]
param([switch]$CliDebug)

$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expectedMigration = '20261014100000_teacher_invitation_admin_activation.sql'
$functions = @('activate-school-teacher-invitation', 'invite-school-teacher')
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
  } finally { $ErrorActionPreference = $previousPreference }
  [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
}

function Get-PendingMigrations {
  param([string[]]$Output)
  @($Output | ForEach-Object {
    if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1].Trim() }
  } | Sort-Object -Unique)
}

try {
  Write-Host "Target Supabase project: $projectRef"
  Write-Host "Expected migration: $expectedMigration"
  $securePassword = Read-Host 'Supabase database password (hidden; not the dashboard URL)' -AsSecureString
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

  $preview = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $preview.Output | ForEach-Object { Write-Output $_ }
  if ($preview.ExitCode -ne 0) { throw 'Database dry run failed. Nothing was pushed and no Functions were deployed.' }
  $pending = @(Get-PendingMigrations -Output $preview.Output)
  $previewText = $preview.Output -join "`n"
  $alreadyCurrent = $pending.Count -eq 0 -and $previewText -match 'Remote database is up to date'
  if (-not $alreadyCurrent -and ($pending.Count -ne 1 -or $pending[0] -cne $expectedMigration)) {
    throw "Expected only '$expectedMigration'; dry run listed: $($pending -join ', '). Nothing was pushed."
  }

  if (-not $alreadyCurrent) {
    $confirmation = (Read-Host "Type APPLY to apply only $expectedMigration").Trim()
    if ($confirmation -ne 'APPLY') { throw 'Confirmation was not APPLY. Nothing was pushed.' }
    $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
    $push.Output | ForEach-Object { Write-Output $_ }
    if ($push.ExitCode -ne 0) { throw 'Migration push failed. No Functions were deployed.' }
    $verify = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
    $verify.Output | ForEach-Object { Write-Output $_ }
    $remaining = Get-PendingMigrations -Output $verify.Output
    if ($verify.ExitCode -ne 0 -or $remaining.Count -ne 0 -or (($verify.Output -join "`n") -notmatch 'Remote database is up to date')) {
      throw 'Remote migration history could not be verified as current. No Functions were deployed.'
    }
  } else { Write-Host 'Remote database already reports this migration is current.' }

  Write-Host 'Before deployment, confirm Edge Function secrets PUBLIC_APP_URL, RESEND_API_KEY, and SCHOOL_INVITATION_FROM_EMAIL are set.'
  Write-Host 'Confirm Supabase Auth permits the /reset-password/school redirect on PUBLIC_APP_URL.'
  $deployConfirmation = (Read-Host "Type DEPLOY to deploy only: $($functions -join ', ')").Trim()
  if ($deployConfirmation -ne 'DEPLOY') { throw 'Confirmation was not DEPLOY. No Functions were deployed.' }
  foreach ($function in $functions) {
    $deployment = Invoke-Supabase -CliArguments @('functions','deploy',$function,'--project-ref',$projectRef,'--use-api')
    $deployment.Output | ForEach-Object { Write-Output $_ }
    if ($deployment.ExitCode -ne 0) { throw "Deployment failed for '$function'. Stop and inspect the error before retrying." }
  }
  Write-Host "Migration $expectedMigration and required Functions deployed successfully."
}
finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
