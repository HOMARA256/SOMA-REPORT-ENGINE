# Apply and verify the admissions, digital ID, and document-library release.
# The database password is entered in this terminal and is never printed.
$ErrorActionPreference = 'Stop'

$projectRef = 'pxmfwancbxpyffoodyig'
$expectedMigration = '20261009160000_online_admissions_digital_ids_document_library.sql'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
$migration = Join-Path $root 'supabase\migrations\20261009160000_online_admissions_digital_ids_document_library.sql'
$source = Join-Path $root 'database\migrations\084_online_admissions_digital_ids_document_library.sql'

if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed.' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $migration).Hash -ne
    (Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash) {
  throw 'The migration and deployment mirror differ. Nothing was pushed.'
}

function Invoke-Supabase {
  param([string[]]$CliArguments)
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
  for ($passwordAttempt = 1; $passwordAttempt -le 3; $passwordAttempt++) {
    if ($securePassword) { $securePassword.Dispose() }
    $securePassword = Read-Host 'Supabase database password (hidden)' -AsSecureString
    $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
    $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
    $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

    $preview = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
    $preview.Output | ForEach-Object { Write-Output $_ }
    if ($preview.ExitCode -eq 0) { break }
    if (($preview.Output -join "`n") -notmatch 'password authentication failed' -or $passwordAttempt -eq 3) {
      throw 'Database dry run failed. Nothing was pushed.'
    }
    Write-Warning 'Database password was rejected. Try the project database password again.'
  }

  $pending = @($preview.Output | ForEach-Object {
    if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
  } | Sort-Object -Unique)
  $alreadyCurrent = $pending.Count -eq 0 -and ($preview.Output -join "`n") -match 'Remote database is up to date'
  if (-not $alreadyCurrent -and ($pending.Count -ne 1 -or $pending[0] -ne $expectedMigration)) {
    throw "Unexpected pending migrations: $($pending -join ', '). Nothing was pushed."
  }

  if (-not $alreadyCurrent) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
      $push.Output | ForEach-Object { Write-Output $_ }
      if ($push.ExitCode -eq 0) { break }
      if (($push.Output -join "`n") -notmatch 'Connection terminated unexpectedly|connection reset|connection refused') {
        throw 'Database migration failed; Functions were not deployed.'
      }

      # A dropped connection can occur after SQL was sent. Check migration
      # history before retrying so the script never applies an unknown set.
      $retryCheck = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
      $retryCheck.Output | ForEach-Object { Write-Output $_ }
      if ($retryCheck.ExitCode -ne 0) { throw 'Connection dropped and migration state could not be checked. Stop and inspect remote history.' }
      $retryText = $retryCheck.Output -join "`n"
      if ($retryText -match 'Remote database is up to date') { break }
      $retryPending = @($retryCheck.Output | ForEach-Object {
        if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
      } | Sort-Object -Unique)
      if ($retryPending.Count -ne 1 -or $retryPending[0] -ne $expectedMigration) {
        throw "Unexpected migrations after connection loss: $($retryPending -join ', '). Stop and inspect remote history."
      }
      if ($attempt -eq 3) { throw 'Database connection dropped three times; Functions were not deployed.' }
      Start-Sleep -Seconds 2
    }
  }

  $verification = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $verification.Output | ForEach-Object { Write-Output $_ }
  if ($verification.ExitCode -ne 0 -or ($verification.Output -join "`n") -notmatch 'Remote database is up to date') {
    throw 'Database migration could not be verified; Functions were not deployed.'
  }

  foreach ($functionName in @('admission-public-upload','admission-public-documents')) {
    $deployment = Invoke-Supabase -CliArguments @('functions','deploy',$functionName,'--project-ref',$projectRef)
    $deployment.Output | ForEach-Object { Write-Output $_ }
    if ($deployment.ExitCode -ne 0) { throw "Deployment failed for $functionName." }
  }

  Write-Output 'Admissions database migration is current and both public Functions deployed.'
}
finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
