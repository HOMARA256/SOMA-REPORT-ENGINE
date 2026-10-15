# Applies only the tenant-safe O-Level class-save RPC repair.
$ErrorActionPreference = 'Stop'
$expected = '20261008160000_fix_o_level_class_save_duplicate_rules.sql'
$cli = Join-Path $PSScriptRoot '..\node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }

function Invoke-SupabaseCli {
  param([string[]]$Arguments)
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $cli @Arguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = $LASTEXITCODE
  }
  finally { $ErrorActionPreference = $previousPreference }
  [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
}

$template = 'postgresql://postgres.pxmfwancbxpyffoodyig:[YOUR-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
$secureDbPass = Read-Host 'Supabase database password (hidden)' -AsSecureString
$credential = [System.Management.Automation.PSCredential]::new('supabase', $secureDbPass)
try {
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $dbUrl = $template.Replace('[YOUR-PASSWORD]', $encodedPassword)
  $dryRun = Invoke-SupabaseCli -Arguments @('db', 'push', '--dry-run', '--skip-vault', '--db-url', $dbUrl)
  $dryRun.Output | ForEach-Object { Write-Output $_ }
  if ($dryRun.ExitCode -ne 0) { throw 'Dry run failed. Nothing was pushed.' }

  $pending = @($dryRun.Output | ForEach-Object {
    $line = [string]$_
    if ($line -match '(202\d{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
  } | Sort-Object -Unique)
  if ($pending.Count -eq 0 -and ($dryRun.Output -join [Environment]::NewLine) -match 'Remote database is up to date') {
    Write-Output 'Remote database is already up to date.'
    return
  }
  if ($pending.Count -ne 1 -or $pending[0] -ne $expected) {
    throw "Unexpected pending migrations: $($pending -join ', '). Nothing was pushed."
  }

  $push = Invoke-SupabaseCli -Arguments @('db', 'push', '--skip-vault', '--db-url', $dbUrl, '--yes')
  $push.Output | ForEach-Object { Write-Output $_ }
  if ($push.ExitCode -ne 0) {
    $details = ($push.Output -join [Environment]::NewLine).Trim()
    if ([string]::IsNullOrWhiteSpace($details)) { $details = 'Supabase CLI returned a non-zero exit code without diagnostic output.' }
    throw "Migration push failed (exit code $($push.ExitCode)). CLI output:`n$details"
  }

  $verification = Invoke-SupabaseCli -Arguments @('db', 'push', '--dry-run', '--skip-vault', '--db-url', $dbUrl)
  $verification.Output | ForEach-Object { Write-Output $_ }
  if ($verification.ExitCode -ne 0 -or ($verification.Output -join [Environment]::NewLine) -notmatch 'Remote database is up to date') {
    throw 'Push completed, but the follow-up dry run did not confirm the remote database is up to date.'
  }
}
finally {
  $dbUrl = $null
  $encodedPassword = $null
  if ($secureDbPass) { $secureDbPass.Dispose() }
  Remove-Variable credential, secureDbPass, dbUrl, encodedPassword, template -ErrorAction SilentlyContinue
}
