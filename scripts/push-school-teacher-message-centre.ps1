[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$expected = '20261015130000_school_teacher_message_centre.sql'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
$source = Join-Path $root 'database\migrations\117_school_teacher_message_centre.sql'
$mirror = Join-Path $root "supabase\migrations\$expected"
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is missing. Run npm ci in the OURSCHOOL workspace.' }
if (-not (Test-Path -LiteralPath $source) -or -not (Test-Path -LiteralPath $mirror)) { throw 'Message Centre migration or mirror is missing.' }
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $mirror -Algorithm SHA256).Hash) { throw 'Migration mirror differs. Nothing was pushed.' }

function Invoke-Supabase([string[]]$CliArguments) {
  $oldPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = @(& $cli @CliArguments 2>&1 | ForEach-Object { [string]$_ })
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $oldPreference }
  [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
}
function Get-Pending([string[]]$Output) {
  @($Output | ForEach-Object { if ($_ -match '(202[0-9]{11}_[A-Za-z0-9_]+\.sql)') { $Matches[1].Trim() } } | Select-Object -Unique)
}

$securePassword = Read-Host 'Supabase database password (hidden)' -AsSecureString
try {
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
  Write-Host "Target project: $projectRef. Only $expected may be pending."
  $preview = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $preview.Output | ForEach-Object { Write-Host $_ }
  if ($preview.ExitCode -ne 0) { throw 'Dry run failed. Nothing was pushed.' }
  $pending = @(Get-Pending $preview.Output)
  if ($pending.Count -eq 0 -and ($preview.Output -join "`n") -match 'Remote database is up to date') { Write-Host 'Remote migration history is already up to date.'; return }
  if ($pending.Count -ne 1 -or $pending[0] -cne $expected) { throw "Unexpected pending migration list: $($pending -join ', '). Nothing was pushed." }
  if (-not $Apply) { Write-Host 'Dry run passed. Rerun with -Apply to request a confirmed database push.'; return }
  if ((Read-Host "Type APPLY to push $expected").Trim() -cne 'APPLY') { throw 'Confirmation was not APPLY. Nothing was pushed.' }
  $push = Invoke-Supabase -CliArguments @('db','push','--skip-vault','--db-url',$databaseUrl,'--yes')
  $push.Output | ForEach-Object { Write-Host $_ }
  if ($push.ExitCode -ne 0) { throw 'Migration push failed. Inspect the SQL error before retrying.' }
  $check = Invoke-Supabase -CliArguments @('db','push','--dry-run','--skip-vault','--db-url',$databaseUrl)
  $check.Output | ForEach-Object { Write-Host $_ }
  if ($check.ExitCode -ne 0 -or (Get-Pending $check.Output).Count -ne 0 -or ($check.Output -join "`n") -notmatch 'Remote database is up to date') { throw 'Push was submitted but remote history could not be verified. Do not push again until checked.' }
  Write-Host 'School–Teacher Message Centre migration applied and verified. Deploy the web app and API worker separately.'
} finally {
  $databaseUrl = $null; $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
