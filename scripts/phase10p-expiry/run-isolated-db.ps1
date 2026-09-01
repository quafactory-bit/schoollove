$ErrorActionPreference='Stop'
$containerName='schoollove-phase10p-expiry-db'
$databaseName='phase10pexpiry'
$image='public.ecr.aws/supabase/postgres:17.6.1.143'
$created=$false
$testPassword=('phase10pexpiry_'+[guid]::NewGuid().ToString('N'))

function Invoke-SqlFile([string]$file) {
  Get-Content -LiteralPath $file -Raw -Encoding UTF8 | docker exec -i $containerName psql -U postgres -d $databaseName -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE-ne 0) { throw "SQL failed: $file" }
}
function Invoke-Sql([string]$sql) {
  $sql | docker exec -i $containerName psql -U postgres -d $databaseName -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE-ne 0) { throw 'SQL bootstrap failed.' }
}
function Clear-PgEnvironment {
  Remove-Item Env:PGHOST,Env:PGPORT,Env:PGDATABASE,Env:PGUSER,Env:PGPASSWORD -ErrorAction SilentlyContinue
}

try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE-ne 0) { throw 'Docker engine is unavailable.' }
  $old=$ErrorActionPreference; $ErrorActionPreference='SilentlyContinue'; docker rm -f $containerName 2>$null | Out-Null; $ErrorActionPreference=$old
  docker run -d --name $containerName -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=$testPassword $image | Out-Null
  if ($LASTEXITCODE-ne 0) { throw 'Isolated PostgreSQL container could not start.' }
  $created=$true
  $ready=$false
  for ($attempt=0; $attempt-lt 90; $attempt++) {
    $health=(docker inspect --format '{{.State.Health.Status}}' $containerName 2>$null).Trim()
    if ($health-eq 'healthy') { $ready=$true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL healthcheck did not become ready.' }
  docker exec $containerName createdb -U postgres $databaseName
  if ($LASTEXITCODE-ne 0) { throw 'Isolated database creation failed.' }

  Invoke-Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz,raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS auth.identities(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),provider_id text NOT NULL,provider text NOT NULL,identity_data jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@
  Invoke-SqlFile (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
    Where-Object { $_.Name-lt '20260802120000_legacy_person_data_reset.sql' } |
    Sort-Object Name | ForEach-Object { Invoke-SqlFile $_.FullName }
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
    '20260814110000_durable_continuation_recovery_boundary.sql',
    '20260819120000_first_social_login_post_oidc_binding.sql'
  )) { Invoke-SqlFile (Resolve-Path "supabase/migrations/$migration").Path }

  Invoke-Sql 'TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.identities; DELETE FROM auth.users;'
  Invoke-SqlFile (Resolve-Path 'scripts/phase10p-expiry/preapply-stale.sql').Path
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260820091834_expire_stale_social_identity_attempts.sql').Path
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260821025308_recovery_delivery_idempotent_sent_replay.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10p-expiry/preapply-assert.sql').Path

  Invoke-Sql 'TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.identities; DELETE FROM auth.users;'
  Invoke-SqlFile (Resolve-Path 'scripts/phase10p-idempotency/lifecycle-smoke.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10p-idempotency/permissions-smoke.sql').Path

  Invoke-Sql 'TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.identities; DELETE FROM auth.users;'
  Invoke-SqlFile (Resolve-Path 'scripts/phase10p-idempotency/concurrency-setup.sql').Path
  $mapping=(docker port $containerName 5432/tcp).Trim()
  if ($mapping-notmatch ':(\d+)$') { throw 'Host TCP port discovery failed.' }
  $env:PGHOST='127.0.0.1'; $env:PGPORT=$Matches[1]; $env:PGDATABASE=$databaseName; $env:PGUSER='postgres'; $env:PGPASSWORD=$testPassword
  node scripts/phase10p-idempotency/lock-wait-runner.mjs
  if ($LASTEXITCODE-ne 0) { throw 'PHASE 10P idempotency direct-TCP lock-wait acceptance failed.' }
  Clear-PgEnvironment

  Invoke-Sql 'TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.identities; DELETE FROM auth.users;'
  Invoke-SqlFile (Resolve-Path 'scripts/phase10p-expiry/lifecycle-smoke.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10p-expiry/permissions-smoke.sql').Path

  Invoke-Sql 'TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.identities; DELETE FROM auth.users;'
  Invoke-SqlFile (Resolve-Path 'scripts/phase10p-expiry/concurrency-setup.sql').Path
  $mapping=(docker port $containerName 5432/tcp).Trim()
  if ($mapping-notmatch ':(\d+)$') { throw 'Host TCP port discovery failed.' }
  $env:PGHOST='127.0.0.1'; $env:PGPORT=$Matches[1]; $env:PGDATABASE=$databaseName; $env:PGUSER='postgres'; $env:PGPASSWORD=$testPassword
  node scripts/phase10p-expiry/race-runner.mjs
  if ($LASTEXITCODE-ne 0) { throw 'PHASE 10P expiry direct-TCP acceptance failed.' }
  Clear-PgEnvironment

  $migration=Get-Content -LiteralPath 'supabase/migrations/20260820091834_expire_stale_social_identity_attempts.sql' -Raw -Encoding UTF8
  $old=$ErrorActionPreference; $ErrorActionPreference='Continue'
  $replayOutput=($migration | docker exec -i $containerName psql -U postgres -d $databaseName -v ON_ERROR_STOP=1 2>&1 | Out-String)
  $replayExit=$LASTEXITCODE; $ErrorActionPreference=$old
  if ($replayExit-eq 0 -or ($replayOutput-replace '\s','')-notmatch 'PHASE10P_STALE_IDENTITY_OBJECT_COLLISION') {
    throw 'PHASE 10P stale expiry migration replay did not fail closed.'
  }
  Write-Output 'PHASE10P_STALE_EXPIRY_MIGRATION_REPLAY_FAIL_CLOSED_OK'

  $tableCount=(docker exec $containerName psql -U postgres -d $databaseName -tAc "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r'").Trim()
  if ($tableCount-ne '9') { throw "Private table boundary mismatch: $tableCount" }
  Write-Output 'PHASE10P_STALE_EXPIRY_ISOLATED_DB_OK private_tables=9 container_removed=true'
} finally {
  Clear-PgEnvironment
  if ($created) {
    $old=$ErrorActionPreference; $ErrorActionPreference='SilentlyContinue'; docker rm -f $containerName 2>$null | Out-Null; $ErrorActionPreference=$old
  }
}
