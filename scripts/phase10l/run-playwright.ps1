$ErrorActionPreference = 'Stop'
$databaseContainer = 'schoollove-phase10l-e2e-db'
$postgrestContainer = 'schoollove-phase10l-e2e-rest'
$networkName = 'schoollove-phase10l-e2e-network'
$databaseImage = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$postgrestImage = 'postgrest/postgrest:v12.2.3'
$resetMigration = (Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
$nextServer = $null
$proxyServer = $null
$databaseCreated = $false
$postgrestCreated = $false
$networkCreated = $false
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('schoollove-phase10l-e2e-' + [guid]::NewGuid().ToString('N'))
$testResultsPath = Join-Path (Get-Location).Path 'test-results'

function ConvertTo-Base64Url([byte[]]$value) {
  return [Convert]::ToBase64String($value).TrimEnd('=').Replace('+','-').Replace('/','_')
}

function New-LocalJwt([string]$role, [string]$secret) {
  $header = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $expires = [DateTimeOffset]::UtcNow.AddHours(2).ToUnixTimeSeconds()
  $payloadJson = @{ role=$role; exp=$expires } | ConvertTo-Json -Compress
  $payload = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($payloadJson))
  $unsigned = "$header.$payload"
  $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
  try { $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($unsigned))) }
  finally { $hmac.Dispose() }
  return "$unsigned.$signature"
}

function Invoke-DatabaseSqlFile([string]$file) {
  Get-Content -LiteralPath $file -Raw -Encoding UTF8 |
    docker exec -i $databaseContainer psql -U postgres -d phase10l_e2e -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw "E2E database SQL failed: $file" }
}

function Wait-Http([string]$url, [int]$attempts = 90) {
  for ($attempt = 0; $attempt -lt $attempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch { }
    Start-Sleep -Seconds 1
  }
  throw "HTTP endpoint did not become ready: $url"
}

try {
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  if (Test-Path -LiteralPath $testResultsPath) { Remove-Item -LiteralPath $testResultsPath -Recurse -Force }
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }

  foreach ($container in @($databaseContainer,$postgrestContainer)) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker rm -f $container 2>$null | Out-Null
    $ErrorActionPreference = $oldPreference
  }
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  docker network rm $networkName 2>$null | Out-Null
  $ErrorActionPreference = $oldPreference

  docker network create $networkName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not create E2E Docker network.' }
  $networkCreated = $true

  docker run -d --name $databaseContainer --network $networkName --network-alias db -e POSTGRES_PASSWORD=local_phase10l_only $databaseImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start E2E PostgreSQL.' }
  $databaseCreated = $true

  $databaseReady = $false
  $consecutiveReadyChecks = 0
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $health = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $databaseContainer
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker exec $databaseContainer psql -U postgres -d postgres -tAc 'SELECT 1' 2>$null | Out-Null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $oldPreference
    if ($exitCode -eq 0 -and ($health -eq 'healthy' -or $health -eq 'none')) {
      $consecutiveReadyChecks++
      if ($consecutiveReadyChecks -ge 3) { $databaseReady = $true; break }
    } else {
      $consecutiveReadyChecks = 0
    }
    Start-Sleep -Seconds 1
  }
  if (-not $databaseReady) { throw 'E2E PostgreSQL did not become ready.' }

  docker exec $databaseContainer createdb -U postgres -T template0 phase10l_e2e
  if ($LASTEXITCODE -ne 0) { throw 'Could not create disposable E2E database.' }

  @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@ | docker exec -i $databaseContainer psql -U postgres -d phase10l_e2e -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare E2E extension schema.' }

  $files = @(
    (Resolve-Path 'supabase-schema.sql').Path,
    (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  ) + @(
    Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
      Where-Object { $_.FullName -ne $resetMigration } |
      Sort-Object Name |
      ForEach-Object FullName
  )
  foreach ($file in $files) { Invoke-DatabaseSqlFile $file }
  Invoke-DatabaseSqlFile 'scripts/phase10l/seed-production-shape.sql'
  Invoke-DatabaseSqlFile $resetMigration
  Invoke-DatabaseSqlFile 'scripts/phase10l/lifecycle-smoke.sql'
  Invoke-DatabaseSqlFile 'scripts/phase10l/permission-smoke.sql'
  Invoke-DatabaseSqlFile 'scripts/phase10l/postgrest-test-bootstrap.sql'

  $jwtSecret = 'phase10l-local-jwt-secret-never-production-2026'
  $anonKey = New-LocalJwt 'anon' $jwtSecret
  $serviceKey = New-LocalJwt 'service_role' $jwtSecret

  docker run -d --name $postgrestContainer --network $networkName -p 127.0.0.1:3212:3000 `
    -e PGRST_DB_URI=postgres://phase10l_authenticator:phase10l_local_postgrest@db:5432/phase10l_e2e `
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$jwtSecret `
    $postgrestImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start E2E PostgREST.' }
  $postgrestCreated = $true

  $env:PHASE10L_PROXY_PORT = '3211'
  $env:PHASE10L_POSTGREST_PORT = '3212'
  $proxyServer = Start-Process -FilePath 'node.exe' -ArgumentList 'scripts/phase10l/postgrest-proxy.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $tempRoot 'proxy.out') -RedirectStandardError (Join-Path $tempRoot 'proxy.err')
  Wait-Http 'http://127.0.0.1:3211/rest/v1/'

  $env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:3211'
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $anonKey
  $env:SUPABASE_SERVICE_ROLE_KEY = $serviceKey
  $env:PUBLIC_PROFILE_REGISTRATION_ENABLED = 'false'
  $env:ADMIN_PASSWORD = 'phase10l-local-admin-password'
  $env:NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3210'
  $env:PHASE10L_E2E_ANON_KEY = $anonKey
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Reset-DB-backed Production build failed.' }
  $nextServer = Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/next/dist/bin/next','start','-p','3210' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $tempRoot 'next.out') -RedirectStandardError (Join-Path $tempRoot 'next.err')
  Wait-Http 'http://127.0.0.1:3210/'

  & node.exe node_modules/@playwright/test/cli.js test e2e/phase10l-reset.spec.ts --workers=1 --retries=0
  if ($LASTEXITCODE -ne 0) { throw "PHASE 10L Playwright failed with exit code $LASTEXITCODE." }

  $postBrowserCounts = docker exec $databaseContainer psql -U postgres -d phase10l_e2e -tAc "SELECT concat_ws('|',(SELECT count(*) FROM public.profiles),(SELECT count(*) FROM public.reports),(SELECT count(*) FROM public.traces),(SELECT count(*) FROM public.search_logs),(SELECT count(*) FROM public.schools))"
  if ($LASTEXITCODE -ne 0 -or $postBrowserCounts.Trim() -ne '0|0|0|0|10006') {
    throw "Browser flow changed reset data: $($postBrowserCounts.Trim())"
  }
  Write-Output 'PHASE10L_RESET_DB_PLAYWRIGHT_OK'
}
finally {
  foreach ($process in @($nextServer,$proxyServer)) {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  if ($postgrestCreated) { docker rm -f $postgrestContainer 2>$null | Out-Null }
  if ($databaseCreated) { docker rm -f $databaseContainer 2>$null | Out-Null }
  if ($networkCreated) { docker network rm $networkName 2>$null | Out-Null }
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
  if (Test-Path -LiteralPath $testResultsPath) { Remove-Item -LiteralPath $testResultsPath -Recurse -Force }
  $ErrorActionPreference = $oldPreference
}
