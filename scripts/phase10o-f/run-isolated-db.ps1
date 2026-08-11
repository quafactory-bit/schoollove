$ErrorActionPreference='Stop'
$containerName='schoollove-phase10o-f-db'
$image='public.ecr.aws/supabase/postgres:17.6.1.143'
$created=$false
function Invoke-SqlFile([string]$file){Get-Content -LiteralPath $file -Raw -Encoding UTF8|docker exec -i $containerName psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw "SQL failed: $file"}}
function Invoke-Sql([string]$sql){$sql|docker exec -i $containerName psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw 'SQL bootstrap failed.'}}
try {
  docker version --format '{{.Server.Version}}'|Out-Null;if($LASTEXITCODE-ne 0){throw 'Docker engine is unavailable.'}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old
  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_phase10of_only $image|Out-Null;if($LASTEXITCODE-ne 0){throw 'Isolated PostgreSQL container could not start.'};$created=$true
  $ready=$false;for($attempt=0;$attempt-lt 90;$attempt++){$health=(docker inspect --format '{{.State.Health.Status}}' $containerName 2>$null).Trim();if($health-eq'healthy'){$ready=$true;break};Start-Sleep -Seconds 1};if(-not $ready){throw 'Isolated PostgreSQL healthcheck did not become ready.'}
  docker exec $containerName createdb -U postgres phase10of
  Invoke-Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz,raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@
  Invoke-SqlFile (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql'|Where-Object{$_.Name-lt'20260802120000_legacy_person_data_reset.sql'}|Sort-Object Name|ForEach-Object{Invoke-SqlFile $_.FullName}
  Invoke-SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260803120000_public_account_soft_launch.sql').Path
  docker exec $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c 'CREATE DATABASE phase10of_preflight_base TEMPLATE phase10of'
  if($LASTEXITCODE-ne 0){throw 'Could not create isolated preflight baseline.'}
  & powershell -ExecutionPolicy Bypass -File scripts/phase10o-f/run-negative-preflight.ps1 -ContainerName $containerName
  if($LASTEXITCODE-ne 0){throw 'Negative preflight smoke failed.'}
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260810160000_social_account_recovery_boundary.sql').Path
  foreach($smoke in @('scripts/phase10o-f/lifecycle-smoke.sql','scripts/phase10o-f/permission-smoke.sql')){Invoke-SqlFile (Resolve-Path $smoke).Path}
  & powershell -ExecutionPolicy Bypass -File scripts/phase10o-f/run-concurrency.ps1 -ContainerName $containerName
  if($LASTEXITCODE-ne 0){throw 'Concurrency smoke failed.'}
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260810182000_social_login_attempt_decision_boundary.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10o-f/attempt-first-smoke.sql').Path
  if($env:PHASE10O_G_ACCEPTANCE -eq '1'){
    Invoke-Sql 'TRUNCATE private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.users;'
    foreach($smoke in @('scripts/phase10o-g/lifecycle-smoke.sql','scripts/phase10o-g/permissions-smoke.sql')){Invoke-SqlFile (Resolve-Path $smoke).Path}
    Invoke-SqlFile (Resolve-Path 'scripts/phase10o-g/concurrency-setup.sql').Path
    & powershell -ExecutionPolicy Bypass -File scripts/phase10o-g/run-concurrency.ps1 -ContainerName $containerName
    if($LASTEXITCODE-ne 0){throw 'PHASE 10O-G concurrency acceptance failed.'}
  }
  if($env:PHASE10O_H_ACCEPTANCE -eq '1'){
    Invoke-Sql 'TRUNCATE private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.users;'
    Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260811090000_social_recovery_crypto_id_binding.sql').Path
    foreach($smoke in @('scripts/phase10o-h/lifecycle-smoke.sql','scripts/phase10o-h/permissions-smoke.sql')){Invoke-SqlFile (Resolve-Path $smoke).Path}
    Invoke-SqlFile (Resolve-Path 'scripts/phase10o-h/concurrency-setup.sql').Path
    & powershell -ExecutionPolicy Bypass -File scripts/phase10o-h/run-concurrency.ps1 -ContainerName $containerName
    if($LASTEXITCODE-ne 0){throw 'PHASE 10O-H concurrency acceptance failed.'}
    $env:PHASE10O_H_DB_CONTAINER=$containerName
    & npx.cmd vitest run --reporter verbose scripts/phase10o-h/crypto-roundtrip.test.ts
    if($LASTEXITCODE-ne 0){throw 'PHASE 10O-H Node/DB crypto round-trip acceptance failed.'}
  }
  $tableCount=docker exec $containerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r'"
  if($LASTEXITCODE-ne 0-or$tableCount.Trim()-ne'5'){throw "Private table boundary mismatch: $($tableCount.Trim())"}
  if($env:PHASE10O_H_ACCEPTANCE -eq '1'){Write-Output 'PHASE10O_H_ISOLATED_DB_OK private_tables=5 container_removed=true'}elseif($env:PHASE10O_G_ACCEPTANCE -eq '1'){Write-Output 'PHASE10O_G_ISOLATED_DB_OK private_tables=5 container_removed=true'}else{Write-Output 'PHASE10O_G_ISOLATED_DB_MIGRATION_OK private_tables=5 rollback=container_removed'}
} finally {if($created){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old}}
