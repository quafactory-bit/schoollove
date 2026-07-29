$ErrorActionPreference = 'Stop'
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'phase10f-local-anon'
$env:SUPABASE_SERVICE_ROLE_KEY = 'phase10f-local-service'
$env:PUBLIC_PROFILE_REGISTRATION_ENABLED = 'false'

$server = $null
try {
  $server = Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/next/dist/bin/next','dev','-p','3210' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 10
  if ($server.HasExited) { throw 'Next.js E2E server exited during startup.' }
  & node.exe node_modules/@playwright/test/cli.js test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}
