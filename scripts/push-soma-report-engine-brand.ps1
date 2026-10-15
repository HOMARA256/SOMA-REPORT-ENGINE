# Push the pending O-Level class details and SOMA REPORT ENGINE branding
# migrations through the project session pooler. Refuses unrelated migrations.
$ErrorActionPreference = 'Stop'
$expectedMigrations = @(
  '20261006120000_update_o_level_class_details.sql',
  '20261008100000_soma_report_engine_brand.sql'
)
$cli = Join-Path $PSScriptRoot '..\node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }

function Invoke-SupabaseCli {
  param([string[]]$Arguments)
  $previousPreference = $ErrorActionPreference
  try {
    # Supabase writes routine progress to stderr; capture it without masking
    # the real exit code on Windows PowerShell.
    $ErrorActionPreference = 'Continue'
    $outputLines = @(& $cli @Arguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  [pscustomobject]@{ Output = $outputLines; ExitCode = $exitCode }
}

$template = 'postgresql://postgres.pxmfwancbxpyffoodyig:[YOUR-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
$secureDbPass = Read-Host 'Supabase database password (hidden)' -AsSecureString
$credential = [System.Management.Automation.PSCredential]::new('supabase', $secureDbPass)
try {
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $dbUrl = $template.Replace('[YOUR-PASSWORD]', $encodedPassword)

  $dryRun = Invoke-SupabaseCli -Arguments @('db', 'push', '--dry-run', '--db-url', $dbUrl)
  $dryRun.Output | ForEach-Object { Write-Output $_ }
  if ($dryRun.ExitCode -ne 0) { throw 'Dry run failed. Nothing was pushed.' }

  $pending = @($dryRun.Output | ForEach-Object {
    $line = [string]$_
    if ($line -match '(202\d{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
  } | Sort-Object -Unique)
  $unexpected = @($pending | Where-Object { $_ -notin $expectedMigrations })
  if ($unexpected.Count -gt 0) {
    throw "Unrelated migrations are pending: $($unexpected -join ', '). Nothing was pushed."
  }
  if ($pending.Count -eq 0) {
    if (($dryRun.Output -join "`n") -match 'Remote database is up to date') {
      Write-Output 'Remote database is already up to date.'
      return
    }
    throw 'Could not identify the pending migration list. Nothing was pushed.'
  }

  $push = Invoke-SupabaseCli -Arguments @('db', 'push', '--db-url', $dbUrl, '--yes')
  $push.Output | ForEach-Object { Write-Output $_ }
  if ($push.ExitCode -ne 0) { throw 'Migration push failed. Inspect the CLI error before retrying.' }

  $verification = Invoke-SupabaseCli -Arguments @('db', 'push', '--dry-run', '--db-url', $dbUrl)
  $verification.Output | ForEach-Object { Write-Output $_ }
  if ($verification.ExitCode -ne 0 -or ($verification.Output -join "`n") -notmatch 'Remote database is up to date') {
    throw 'Push completed, but the follow-up dry run did not confirm the remote database is up to date.'
  }
}
finally {
  $dbUrl = $null
  $encodedPassword = $null
  if ($secureDbPass) { $secureDbPass.Dispose() }
  Remove-Variable credential, secureDbPass, dbUrl, encodedPassword, template -ErrorAction SilentlyContinue
}
