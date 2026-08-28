$ErrorActionPreference = 'Stop'
$containerName = 'schoollove-google-callback-diagnostic-db'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$created = $false
$testPassword = 'google_diag_' + [guid]::NewGuid().ToString('N')

function Invoke-SqlFile([string]$file) {
  Get-Content -LiteralPath $file -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d google_callback_diagnostic -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $file" }
}

function Invoke-Sql([string]$sql) {
  $sql | docker exec -i $containerName psql -U postgres -d google_callback_diagnostic -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'SQL bootstrap failed.' }
}

try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }

  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  docker rm -f $containerName 2>$null | Out-Null
  $ErrorActionPreference = $oldPreference

  docker run -d --name $containerName -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=$testPassword $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL container could not start.' }
  $created = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    $health = (docker inspect --format '{{.State.Health.Status}}' $containerName 2>$null).Trim()
    if ($health -eq 'healthy') { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL healthcheck did not become ready.' }

  docker exec $containerName createdb -U postgres google_callback_diagnostic
  if ($LASTEXITCODE -ne 0) { throw 'Isolated database creation failed.' }

  Invoke-Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(
  id uuid PRIMARY KEY,
  email text,
  banned_until timestamptz,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@

  Invoke-SqlFile (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
    Where-Object { $_.Name -lt '20260802120000_legacy_person_data_reset.sql' } |
    Sort-Object Name |
    ForEach-Object { Invoke-SqlFile $_.FullName }
  Invoke-SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path

  foreach ($migration in @(
    '20260802120000_legacy_person_data_reset.sql',
    '20260803120000_public_account_soft_launch.sql',
    '20260810160000_social_account_recovery_boundary.sql',
    '20260810182000_social_login_attempt_decision_boundary.sql',
    '20260811090000_social_recovery_crypto_id_binding.sql',
    '20260811110000_recovery_delivery_state_boundary.sql',
    '20260811220000_broker_authorization_code_boundary.sql',
    '20260812160000_upstream_login_leg_boundary.sql',
    '20260812190000_upstream_callback_correlation_boundary.sql',
    '20260813100000_downstream_authorization_transaction_persistence.sql',
    '20260813120000_transaction_bound_broker_code_issuance.sql',
    '20260813180000_downstream_authorization_terminal_scrub_boundary.sql',
    '20260829110000_google_callback_durable_diagnostic_persistence.sql'
  )) {
    Invoke-SqlFile (Resolve-Path "supabase/migrations/$migration").Path
  }

  Invoke-SqlFile (Resolve-Path 'scripts/google-callback-diagnostic/lifecycle-smoke.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/google-callback-diagnostic/permissions-smoke.sql').Path

  $columnCount = (docker exec $containerName psql -U postgres -d google_callback_diagnostic -tAc "SELECT count(*) FROM information_schema.columns WHERE table_schema='private' AND table_name='upstream_login_legs' AND column_name IN ('diagnostic_reason','diagnostic_upstream_status')").Trim()
  if ($columnCount -ne '2') { throw "Diagnostic column boundary mismatch: $columnCount" }
  Write-Output 'GOOGLE_CALLBACK_DIAGNOSTIC_ISOLATED_DB_OK columns=2 migration_apply=local_only container_removed=true'
}
finally {
  if ($created) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker rm -f $containerName 2>$null | Out-Null
    $ErrorActionPreference = $oldPreference
  }
}
