[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }

$securePassword = Read-Host 'Supabase database password (hidden)' -AsSecureString
try {
  $credential = [System.Management.Automation.PSCredential]::new('supabase', $securePassword)
  $encodedPassword = [uri]::EscapeDataString($credential.GetNetworkCredential().Password)
  $databaseUrl = "postgresql://postgres.$($projectRef):$($encodedPassword)@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
  Write-Host "Checking pending migrations for project $projectRef. This is a dry run; nothing will be pushed."
  $previousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $cli db push --dry-run --skip-vault --db-url $databaseUrl
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($exitCode -ne 0) { throw 'Database dry run failed. Nothing was pushed or deployed.' }
} finally {
  $databaseUrl = $null
  $encodedPassword = $null
  if ($securePassword) { $securePassword.Dispose() }
  Remove-Variable credential,securePassword,databaseUrl,encodedPassword -ErrorAction SilentlyContinue
}
