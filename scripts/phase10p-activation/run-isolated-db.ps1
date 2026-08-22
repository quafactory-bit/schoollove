$ErrorActionPreference='Stop'
$containerName='schoollove-phase10p-activation-db'
$image='public.ecr.aws/supabase/postgres:17.6.1.143'
$password=('phase10pactivation_'+[guid]::NewGuid().ToString('N'))
$created=$false
$targetMigration='supabase/migrations/20260822022953_social_activation_gate_and_bound_provisional_reauth.sql'

function Invoke-Sql([string]$database,[string]$sql) {
  $sql | docker exec -i $containerName psql -U postgres -d $database -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE-ne 0){throw "SQL failed in $database"}
}
function Invoke-SqlFile([string]$database,[string]$file) {
  Get-Content -LiteralPath $file -Raw -Encoding UTF8 | docker exec -i $containerName psql -U postgres -d $database -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE-ne 0){throw "SQL file failed in $database`: $file"}
}
function Initialize-Baseline([string]$database) {
  docker exec $containerName createdb -U postgres $database
  if($LASTEXITCODE-ne 0){throw "Database creation failed: $database"}
  Invoke-Sql $database @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz,raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),provider_id text NOT NULL,provider text NOT NULL,identity_data jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@
  Invoke-SqlFile $database (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile $database (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
    Where-Object { $_.Name-lt '20260802120000_legacy_person_data_reset.sql' } |
    Sort-Object Name | ForEach-Object { Invoke-SqlFile $database $_.FullName }
  Invoke-SqlFile $database (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  foreach($migration in @(
    '20260802120000_legacy_person_data_reset.sql','20260803120000_public_account_soft_launch.sql',
    '20260810160000_social_account_recovery_boundary.sql','20260810182000_social_login_attempt_decision_boundary.sql',
    '20260811090000_social_recovery_crypto_id_binding.sql','20260811110000_recovery_delivery_state_boundary.sql',
    '20260811220000_broker_authorization_code_boundary.sql','20260812160000_upstream_login_leg_boundary.sql',
    '20260812190000_upstream_callback_correlation_boundary.sql','20260813100000_downstream_authorization_transaction_persistence.sql',
    '20260813120000_transaction_bound_broker_code_issuance.sql','20260813180000_downstream_authorization_terminal_scrub_boundary.sql',
    '20260814110000_durable_continuation_recovery_boundary.sql','20260819120000_first_social_login_post_oidc_binding.sql',
    '20260820091834_expire_stale_social_identity_attempts.sql','20260821025308_recovery_delivery_idempotent_sent_replay.sql',
    '20260821072212_resume_expired_unbound_provisional_social_login.sql'
  )) { Invoke-SqlFile $database (Resolve-Path "supabase/migrations/$migration").Path }
}
function Clear-PgEnvironment { Remove-Item Env:PGHOST,Env:PGPORT,Env:PGDATABASE,Env:PGUSER,Env:PGPASSWORD -ErrorAction SilentlyContinue }

try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if($LASTEXITCODE-ne 0){throw 'Docker engine unavailable'}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old
  docker run -d --name $containerName -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=$password $image | Out-Null
  if($LASTEXITCODE-ne 0){throw 'Container start failed'}
  $created=$true;$ready=$false
  for($i=0;$i-lt 90;$i++){if((docker inspect --format '{{.State.Health.Status}}' $containerName 2>$null).Trim()-eq'healthy'){$ready=$true;break};Start-Sleep -Seconds 1}
  if(-not $ready){throw 'Container health timeout'}

  Initialize-Baseline 'phase10pactivation'
  Invoke-SqlFile 'phase10pactivation' (Resolve-Path 'scripts/phase10p-activation/preapply-preview.sql').Path
  Invoke-SqlFile 'phase10pactivation' (Resolve-Path $targetMigration).Path
  Invoke-SqlFile 'phase10pactivation' (Resolve-Path 'scripts/phase10p-activation/lifecycle-smoke.sql').Path
  Invoke-SqlFile 'phase10pactivation' (Resolve-Path 'scripts/phase10p-activation/permissions-smoke.sql').Path
  Invoke-SqlFile 'phase10pactivation' (Resolve-Path 'scripts/phase10p-activation/negative-smoke.sql').Path

  Invoke-Sql 'phase10pactivation' "TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.identities; DELETE FROM auth.users;"
  Invoke-SqlFile 'phase10pactivation' (Resolve-Path 'scripts/phase10p-activation/concurrency-setup.sql').Path
  $mapping=(docker port $containerName 5432/tcp).Trim();if($mapping-notmatch ':(\d+)$'){throw 'Port discovery failed'}
  $env:PGHOST='127.0.0.1';$env:PGPORT=$Matches[1];$env:PGDATABASE='phase10pactivation';$env:PGUSER='postgres';$env:PGPASSWORD=$password
  node scripts/phase10p-activation/race-runner.mjs
  if($LASTEXITCODE-ne 0){throw 'Activation/reauth race failed'}
  Clear-PgEnvironment

  Initialize-Baseline 'phase10pproductionlike'
  Invoke-SqlFile 'phase10pproductionlike' (Resolve-Path 'scripts/phase10p-activation/preapply-production.sql').Path
  Invoke-SqlFile 'phase10pproductionlike' (Resolve-Path $targetMigration).Path
  Invoke-SqlFile 'phase10pproductionlike' (Resolve-Path 'scripts/phase10p-activation/postapply-production.sql').Path

  $privateCount=(docker exec $containerName psql -U postgres -d phase10pactivation -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r'").Trim()
  if($privateCount-ne'9'){throw "Private table count mismatch: $privateCount"}
  Write-Output 'PHASE10P_SOCIAL_ACTIVATION_BOUND_REAUTH_ISOLATED_DB_OK private_tables=9 container_removed=true'
} finally {
  Clear-PgEnvironment
  if($created){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old}
}
