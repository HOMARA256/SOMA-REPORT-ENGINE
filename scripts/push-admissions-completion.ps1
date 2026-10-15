[CmdletBinding()]
param([switch]$CliDebug)

# Push only the reviewed admissions, identity-card, learner, and guardian/curriculum migrations.
# The password is entered as a hidden secure prompt and never written to output.
$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expected = @(
  '20261011100000_school_entered_admission_drafts.sql',
  '20261011110000_versioned_admission_records.sql',
  '20261011120000_identity_card_print_snapshots.sql',
  '20261011130000_identity_card_print_documents.sql',
  '20261011140000_school_admission_document_uploads.sql',
  '20261011150000_refresh_admissions_postgrest_schema.sql',
  '20261011160000_fix_identity_card_random_bytes_and_audit_profile_fk.sql',
  '20261011170000_school_admin_staff_number_for_identity_cards.sql',
  '20261011180000_fix_public_admission_digest_search_path.sql',
  '20261011190000_pending_learners_from_accepted_admissions.sql',
  '20261011200000_shared_guardians_and_religious_education_groups.sql'
)
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed.' }

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

try {
  $securePassword = Read-Host 'Supabase database password (hidden)' -AsSecureString
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

  $preview = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $preview.Output | ForEach-Object { Write-Output $_ }
  if ($preview.ExitCode -ne 0) { throw 'Database dry run failed. Nothing was pushed.' }
  $pending = @($preview.Output | ForEach-Object {
    if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
  } | Sort-Object -Unique)
  $alreadyCurrent = $pending.Count -eq 0 -and ($preview.Output -join "`n") -match 'Remote database is up to date'
  $expectedSuffix = @()
  if (-not $alreadyCurrent -and $pending.Count -gt 0 -and $pending.Count -le $expected.Count) {
    $expectedSuffix = @($expected[($expected.Count - $pending.Count)..($expected.Count - 1)])
  }
  if (-not $alreadyCurrent -and (($pending -join "`n") -cne ($expectedSuffix -join "`n"))) {
    throw "Unexpected pending migrations: $($pending -join ', '). Nothing was pushed."
  }

  if (-not $alreadyCurrent) {
    $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
    $push.Output | ForEach-Object { Write-Output $_ }
    if ($push.ExitCode -ne 0) {
      if (($push.Output -join "`n") -match 'Connection terminated unexpectedly|connection reset|connection refused') {
        $check = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
        $check.Output | ForEach-Object { Write-Output $_ }
        if ($check.ExitCode -eq 0 -and ($check.Output -join "`n") -match 'Remote database is up to date') {
          Write-Warning 'The connection dropped after the database applied the migrations; remote history confirms they are current.'
        } else {
          throw 'The connection dropped during push. Review the dry-run migration list before retrying.'
        }
      } else { throw 'Migration push failed. Review the CLI error above; no Functions were deployed.' }
    }
  }

  $verification = $null
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $verification = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
    $verificationText = $verification.Output -join "`n"
    if ($verification.ExitCode -eq 0) { break }
    if ($verificationText -notmatch 'Connection terminated unexpectedly|connection reset|connection refused|timeout|temporary failure') {
      $verification.Output | ForEach-Object { Write-Output $_ }
      throw 'Migration history verification failed for a non-transient error. Review the output above.'
    }
    if ($attempt -lt 3) {
      Write-Warning "Remote verification connection dropped (attempt $attempt of 3); retrying without applying migrations."
      Start-Sleep -Seconds (2 * $attempt)
    }
  }
  $verification.Output | ForEach-Object { Write-Output $_ }
  if ($verification.ExitCode -ne 0) {
    throw 'The push may have succeeded, but the connection prevented migration-history confirmation. Rerun this script when the database connection is stable; its dry run will check history before any push.'
  }
  if (($verification.Output -join "`n") -notmatch 'Remote database is up to date') {
    throw 'Remote history still lists pending migrations. Nothing further was pushed; review the dry-run list before retrying.'
  }
  Write-Output 'Admission, guardian, learner, and curriculum migrations are current on the remote database.'
}
finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
