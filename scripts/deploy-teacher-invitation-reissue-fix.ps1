[CmdletBinding()]
param([switch]$CliDebug)

$ErrorActionPreference = 'Stop'
$projectRef = 'pxmfwancbxpyffoodyig'
$functionName = 'invite-school-teacher'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cli = Join-Path $root 'node_modules\.bin\supabase.cmd'
$functionPath = Join-Path $root "supabase\functions\$functionName\index.ts"

if (-not (Test-Path -LiteralPath $cli)) { throw 'Supabase CLI is not installed in this workspace.' }
if (-not (Test-Path -LiteralPath $functionPath)) { throw "Edge Function source is missing: $functionPath" }

Write-Host 'No database migration is required for this deployment.'
Write-Host "Target Supabase project: $projectRef"
Write-Host "Edge Function to deploy: $functionName"
$confirmation = (Read-Host "Type DEPLOY to deploy only '$functionName' to project $projectRef").Trim()
if ($confirmation -cne 'DEPLOY') { throw 'Confirmation was not DEPLOY. Nothing was deployed.' }

$arguments = @('functions', 'deploy', $functionName, '--project-ref', $projectRef, '--use-api')
if ($CliDebug) { $arguments += '--debug' }
$previousPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  & $cli @arguments
  $exitCode = $LASTEXITCODE
} finally { $ErrorActionPreference = $previousPreference }
if ($exitCode -ne 0) { throw "Deployment failed for '$functionName'. No database changes were made." }
Write-Host "Deployment completed: $functionName on $projectRef. No database changes were made."
