[CmdletBinding()]
param([switch]$CliDebug)

$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expectedMigrations = @('20261014110000_school_admin_teacher_reactivation.sql', '20261014120000_teacher_invitation_states_and_decline.sql', '20261014130000_persistent_teacher_membership_lifecycle.sql', '20261014140000_teacher_invitation_membership_status_text.sql', '20261014150000_school_scoped_teacher_access.sql', '20261014160000_teacher_account_access_escalation.sql', '20261014170000_teacher_account_access_notification_retry.sql', '20261014180000_teacher_invitation_global_account_status.sql', '20261014190000_fix_teacher_invitation_membership_status_enum.sql', '20261014200000_teacher_invitation_platform_review_status.sql', '20261014210000_distinguish_teacher_onboarding_from_platform_lock.sql')
$functions = @('activate-school-teacher-invitation', 'resolve-current-user', 'review-teacher-account-lock')
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }
foreach ($expectedMigration in $expectedMigrations) {
  if (-not (Test-Path -LiteralPath (Join-Path $root "supabase\migrations\$expectedMigration"))) { throw "Expected migration is missing: $expectedMigration" }
}

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
  @($Output | ForEach-Object { if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1].Trim() } } | Sort-Object -Unique)
}

$securePassword = Read-Host 'Supabase database password (hidden)' -AsSecureString
try {
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
  Write-Host "Target Supabase project: $projectRef"
  Write-Host "Expected migrations (only these may be pending, in order): $($expectedMigrations -join ', ')"
  $preview = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $preview.Output | ForEach-Object { Write-Output $_ }
  if ($preview.ExitCode -ne 0) { throw 'Database dry run failed. Nothing was pushed or deployed.' }
  $pending = @(Get-PendingMigrations -Output $preview.Output)
  $previewText = $preview.Output -join "`n"
  $alreadyCurrent = $pending.Count -eq 0 -and $previewText -match 'Remote database is up to date'
  $pendingAllowed = $pending.Count -gt 0 -and $pending.Count -le $expectedMigrations.Count
  if ($pendingAllowed) {
    $startIndex = $expectedMigrations.Count - $pending.Count
    for ($index = 0; $index -lt $pending.Count; $index++) {
      if ($pending[$index] -cne $expectedMigrations[$startIndex + $index]) { $pendingAllowed = $false; break }
    }
  }
  if (-not $alreadyCurrent -and -not $pendingAllowed) {
    throw "Expected pending migrations in this exact order only: $($expectedMigrations -join ', '); dry run listed: $($pending -join ', '). Nothing was pushed or deployed."
  }
  if (-not $alreadyCurrent) {
    $confirmation = (Read-Host "Type APPLY to apply only the listed expected migrations: $($pending -join ', ')").Trim()
    if ($confirmation -cne 'APPLY') { throw 'Confirmation was not APPLY. Nothing was pushed or deployed.' }
    $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
    $push.Output | ForEach-Object { Write-Output $_ }
    if ($push.ExitCode -ne 0) { throw 'Migration push failed. The Edge Function was not deployed.' }
    $verify = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
    $verify.Output | ForEach-Object { Write-Output $_ }
    $remaining = @(Get-PendingMigrations -Output $verify.Output)
    if ($verify.ExitCode -ne 0 -or $remaining.Count -ne 0 -or (($verify.Output -join "`n") -notmatch 'Remote database is up to date')) {
      throw 'Remote migration history could not be verified current. The Edge Function was not deployed.'
    }
  } else { Write-Host 'Remote database already reports this migration is current.' }

  $deployConfirmation = (Read-Host "Type DEPLOY to deploy only these Edge Functions: $($functions -join ', ')").Trim()
  if ($deployConfirmation -cne 'DEPLOY') { throw 'Confirmation was not DEPLOY. The Edge Function was not deployed.' }
  foreach ($functionName in $functions) {
    $deployment = Invoke-Supabase -CliArguments @('functions','deploy',$functionName,'--project-ref',$projectRef,'--use-api')
    $deployment.Output | ForEach-Object { Write-Output $_ }
    if ($deployment.ExitCode -ne 0) { throw "Deployment failed for '$functionName'. Inspect the error before retrying." }
  }
  Write-Host "Expected teacher invitation migrations and Edge Functions completed successfully."
} finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
