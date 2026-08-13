$ErrorActionPreference='Stop'; $containerName='schoollove-phase10o-o-db'; $image='public.ecr.aws/supabase/postgres:17.6.1.143'; $created=$false; $testPassword=('phase10oo_'+[guid]::NewGuid().ToString('N'))
function Invoke-SqlFile([string]$file){Get-Content -LiteralPath $file -Raw -Encoding UTF8|docker exec -i $containerName psql -U postgres -d phase10oo -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw "SQL failed: $file"}}
function Invoke-Sql([string]$sql){$sql|docker exec -i $containerName psql -U postgres -d phase10oo -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw 'SQL bootstrap failed.'}}
try {
  docker version --format '{{.Server.Version}}'|Out-Null;if($LASTEXITCODE-ne 0){throw 'Docker engine is unavailable.'}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old
  docker run -d --name $containerName -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=$testPassword $image|Out-Null;if($LASTEXITCODE-ne 0){throw 'Isolated PostgreSQL container could not start.'};$created=$true
  $ready=$false;for($attempt=0;$attempt-lt90;$attempt++){$health=(docker inspect --format '{{.State.Health.Status}}' $containerName 2>$null).Trim();if($health-eq'healthy'){$ready=$true;break};Start-Sleep -Seconds 1};if(-not $ready){throw 'Isolated PostgreSQL healthcheck did not become ready.'}
  docker exec $containerName createdb -U postgres phase10oo
  Invoke-Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz,raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@
  Invoke-SqlFile (Resolve-Path 'supabase-schema.sql').Path; Invoke-SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql'|Where-Object{$_.Name-lt'20260802120000_legacy_person_data_reset.sql'}|Sort-Object Name|ForEach-Object{Invoke-SqlFile $_.FullName}
  Invoke-SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  foreach($migration in @('20260802120000_legacy_person_data_reset.sql','20260803120000_public_account_soft_launch.sql','20260810160000_social_account_recovery_boundary.sql','20260810182000_social_login_attempt_decision_boundary.sql','20260811090000_social_recovery_crypto_id_binding.sql','20260811110000_recovery_delivery_state_boundary.sql','20260811220000_broker_authorization_code_boundary.sql','20260812160000_upstream_login_leg_boundary.sql','20260812190000_upstream_callback_correlation_boundary.sql')){Invoke-SqlFile (Resolve-Path "supabase/migrations/$migration").Path}
  Invoke-SqlFile (Resolve-Path 'scripts/phase10o-n/lifecycle-smoke.sql').Path
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260813100000_downstream_authorization_transaction_persistence.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10o-o/lifecycle-smoke.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10o-o/permissions-smoke.sql').Path
  Invoke-Sql 'TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.users;'
  Invoke-SqlFile (Resolve-Path 'scripts/phase10o-o/concurrency-setup.sql').Path
  $mapping=(docker port $containerName 5432/tcp).Trim();if($mapping -notmatch ':(\d+)$'){throw 'Host TCP port discovery failed.'};$env:PGHOST='127.0.0.1';$env:PGPORT=$Matches[1];$env:PGDATABASE='phase10oo';$env:PGUSER='postgres';$env:PGPASSWORD=$testPassword;node scripts/phase10o-o/race-runner.mjs;if($LASTEXITCODE-ne 0){throw 'PHASE 10O-O concurrency acceptance failed.'};Remove-Item Env:PGHOST,Env:PGPORT,Env:PGDATABASE,Env:PGUSER,Env:PGPASSWORD -ErrorAction SilentlyContinue
  $tableCount=(docker exec $containerName psql -U postgres -d phase10oo -tAc "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r'").Trim();if($tableCount-ne'9'){throw "Private table boundary mismatch: $tableCount"}
  Write-Output 'PHASE10O_O_ISOLATED_DB_OK private_tables=9 container_removed=true'
} finally {if($created){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old}}
