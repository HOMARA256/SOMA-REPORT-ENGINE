# Runs only the reviewed O-Level subject-choice contract repair against the linked project.
# Enter the database password in the hidden prompt; never paste it into chat.
$ErrorActionPreference = 'Stop'
$expected = '20261006110000_restore_o_level_subject_choice_contract.sql'
$cli = Join-Path $PSScriptRoot '..\node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }

function Invoke-SupabaseCli {
  param([string[]]$Arguments)
  $previousPreference = $ErrorActionPreference
  try {
    # Supabase prints normal progress to stderr; Windows PowerShell must not
    # treat that text as a terminating error before $LASTEXITCODE is checked.
    $ErrorActionPreference = 'Continue'
    $outputLines = @(& $cli @Arguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousPreference
  }
  return [pscustomobject]@{ Output = $outputLines; ExitCode = $exitCode }
}

$secureDbPass = Read-Host 'Supabase database password (hidden)' -AsSecureString
$dbCredential = [System.Management.Automation.PSCredential]::new('supabase', $secureDbPass)
try {
  $env:SUPABASE_DB_PASSWORD = $dbCredential.GetNetworkCredential().Password
  $dryRun = Invoke-SupabaseCli -Arguments @('db', 'push', '--dry-run', '--linked')
  $dryRun.Output | ForEach-Object { Write-Output $_ }
  if ($dryRun.ExitCode -ne 0) { throw 'Dry run failed. Nothing was pushed.' }

  $pending = @($dryRun.Output | ForEach-Object {
    $line = [string]$_
    if ($line -match '(202\d{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
  })
  if ($pending.Count -ne 1 -or $pending[0] -ne $expected) {
    throw "Expected only $expected, found: $($pending -join ', '). Nothing was pushed."
  }

  $push = Invoke-SupabaseCli -Arguments @('db', 'push', '--linked', '--yes')
  $push.Output | ForEach-Object { Write-Output $_ }
  if ($push.ExitCode -ne 0) { throw 'Migration push failed. Inspect the CLI error before retrying.' }

  $verification = Invoke-SupabaseCli -Arguments @('db', 'push', '--dry-run', '--linked')
  $verification.Output | ForEach-Object { Write-Output $_ }
  if ($verification.ExitCode -ne 0 -or ($verification.Output -join "`n") -notmatch 'Remote database is up to date') {
    throw 'Push completed, but the follow-up dry run did not confirm that the remote database is up to date.'
  }
}
finally {
  Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  if ($secureDbPass) { $secureDbPass.Dispose() }
  Remove-Variable dbCredential, secureDbPass -ErrorAction SilentlyContinue
}
