$ErrorActionPreference = 'Stop'
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'phase10g-local-anon'
$env:SUPABASE_SERVICE_ROLE_KEY = 'phase10g-local-service'
$env:PUBLIC_PROFILE_REGISTRATION_ENABLED = 'false'
$env:ADMIN_PASSWORD = 'phase10g-local-admin-password'

$server = $null
try {
  $server = Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/next/dist/bin/next','start','-p','3210' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 8
  if ($server.HasExited) { throw 'Next.js PHASE 10G E2E server exited during startup.' }
  & node.exe node_modules/@playwright/test/cli.js test e2e/phase10g-payment.spec.ts --workers=1
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
