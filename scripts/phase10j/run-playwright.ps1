$ErrorActionPreference='Stop'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='phase10j-local-anon'
$env:SUPABASE_SERVICE_ROLE_KEY='local'
$env:PUBLIC_PROFILE_REGISTRATION_ENABLED='false'
$env:ADMIN_PASSWORD='phase10j-local-admin-password'
$env:CONTROLLED_BETA_SYNTHETIC_MODE='enabled'
$server=$null
try {
  $server=Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/next/dist/bin/next','start','-p','3210' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 8
  if($server.HasExited){throw 'Next.js PHASE 10J E2E server exited during startup.'}
  & node.exe node_modules/@playwright/test/cli.js test e2e/phase10j-safety-boundaries.spec.ts --workers=4
  if($LASTEXITCODE-ne 0){exit $LASTEXITCODE}
} finally {if($server-and-not $server.HasExited){Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue}}
