[CmdletBinding()]
param(
  [switch]$CliDebug,
  [switch]$ApplyMigration,
  [switch]$DeployFunctions
)

# Applies only the reviewed teacher invitation migration, verifies remote history,
# then separately confirms and deploys the two updated Edge Functions.
$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expectedMigration = '20261013110000_school_scoped_teacher_invitations.sql'
$functionNames = @('invite-school-teacher', 'resolve-current-user')
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
  }
  finally { $ErrorActionPreference = $previousPreference }
  [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
}

function Test-RemoteCurrent {
  param([string]$Url)
  $check = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$Url)
  $check.Output | ForEach-Object { Write-Output $_ }
  if ($check.ExitCode -ne 0) { return $false }
  return (($check.Output -join "`n") -match 'Remote database is up to date')
}

try {
  Write-Host "Target Supabase project: $projectRef"
  Write-Host "Only this migration is permitted: $expectedMigration"
  $securePassword = Read-Host 'Supabase database password (hidden; not your dashboard URL)' -AsSecureString
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

  $preview = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $preview.Output | ForEach-Object { Write-Output $_ }
  if ($preview.ExitCode -ne 0) { throw 'Dry run failed. Nothing was pushed and Functions were not deployed.' }
  $previewText = $preview.Output -join "`n"
  $pending = @($preview.Output | ForEach-Object {
    if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1] }
  } | Sort-Object -Unique)
  $alreadyCurrent = $pending.Count -eq 0 -and $previewText -match 'Remote database is up to date'

  if (-not $alreadyCurrent) {
    if ($pending.Count -ne 1 -or $pending[0] -cne $expectedMigration) {
      throw "Expected only '$expectedMigration'; dry run listed: $($pending -join ', '). Nothing was pushed."
    }
    if (-not $ApplyMigration) {
      throw "Dry run succeeded. Nothing was pushed. Review the migration, then rerun with -ApplyMigration to apply only '$expectedMigration'."
    }

    $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
    $push.Output | ForEach-Object { Write-Output $_ }
    if ($push.ExitCode -ne 0) {
      if (($push.Output -join "`n") -notmatch 'Connection terminated unexpectedly|connection reset|connection refused|timeout') {
        throw 'Migration push failed. Functions were not deployed.'
      }
      Write-Warning 'The push connection dropped; checking remote migration history before deciding whether to continue.'
    }
    if (-not (Test-RemoteCurrent -Url $databaseUrl)) {
      throw 'Remote migration history could not confirm this release is current. Do not retry blindly; inspect the dry-run output first.'
    }
  }
  else { Write-Host 'Remote database already has this migration.' }

  Write-Host 'Database history confirms the migration is applied.'
  Write-Host 'Before deploying, ensure PUBLIC_APP_URL is set and the Supabase Auth redirect allow-list includes the local /teacher-invitation/accept URL.'
  Write-Host 'RESEND_API_KEY and SCHOOL_INVITATION_FROM_EMAIL are optional; without them the app returns a one-time link for manual sharing.'
  if (-not $DeployFunctions) {
    Write-Warning "Database migration is current; Edge Functions were not deployed. Review the settings above, then rerun with -DeployFunctions to deploy $($functionNames -join ' and ')."
    return
  }

  foreach ($functionName in $functionNames) {
    $deployment = Invoke-Supabase -CliArguments @('functions','deploy',$functionName,'--project-ref',$projectRef,'--use-api')
    $deployment.Output | ForEach-Object { Write-Output $_ }
    if ($deployment.ExitCode -ne 0) { throw "Deployment failed for '$functionName'. The database migration remains applied; review this function before retrying." }
  }
  Write-Host 'Teacher invitation database migration and Edge Functions are deployed.'
}
finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
