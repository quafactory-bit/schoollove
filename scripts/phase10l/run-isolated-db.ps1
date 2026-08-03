$ErrorActionPreference = 'Stop'
$containerName = 'schoollove-phase10l-db-script'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$resetMigration = (Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
$containerCreated = $false

function Invoke-DatabaseSqlFile([string]$database, [string]$file) {
  Get-Content -LiteralPath $file -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d $database -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw "SQL file failed for ${database}: $file" }
}

function Invoke-DatabaseSql([string]$database, [string]$sql) {
  $sql | docker exec -i $containerName psql -U postgres -d $database -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw "SQL fixture failed for ${database}." }
}

function New-ScenarioDatabase([string]$database) {
  docker exec $containerName createdb -U postgres -T phase10l_template $database
  if ($LASTEXITCODE -ne 0) { throw "Could not create scenario database: $database" }
  Invoke-DatabaseSqlFile $database 'scripts/phase10l/seed-production-shape.sql'
}

function Assert-ResetRejected(
  [string]$database,
  [string]$fixtureSql,
  [string]$fixtureCountSql,
  [string]$label,
  [int]$expectedProfiles = 25
) {
  New-ScenarioDatabase $database
  Invoke-DatabaseSql $database $fixtureSql

  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  Get-Content -LiteralPath $resetMigration -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d $database -v ON_ERROR_STOP=1 -q 2>$null
  $resetExit = $LASTEXITCODE
  $ErrorActionPreference = $oldPreference
  if ($resetExit -eq 0) { throw "$label unexpectedly accepted destructive reset." }

  $verification = docker exec $containerName psql -U postgres -d $database -tAc @"
SELECT concat_ws('|',
  (SELECT count(*) FROM public.profiles),
  (SELECT count(*) FROM public.reports),
  (SELECT count(*) FROM public.traces),
  (SELECT count(*) FROM public.search_logs),
  ($fixtureCountSql)
);
"@
  if ($LASTEXITCODE -ne 0 -or $verification.Trim() -ne "$expectedProfiles|1|8|670|1") {
    throw "$label was not atomic: $($verification.Trim())"
  }
  Write-Output "PHASE10L_ROLLBACK_OK $label"
}

try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }

  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  docker rm -f $containerName 2>$null | Out-Null
  $ErrorActionPreference = $oldPreference

  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_phase10l_only $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL container could not start.' }
  $containerCreated = $true

  $ready = $false
  $consecutiveReadyChecks = 0
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $health = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $containerName
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker exec $containerName psql -U postgres -d postgres -tAc 'SELECT 1' 2>$null | Out-Null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $oldPreference
    if ($exitCode -eq 0 -and ($health -eq 'healthy' -or $health -eq 'none')) {
      $consecutiveReadyChecks++
      if ($consecutiveReadyChecks -ge 3) { $ready = $true; break }
    } else {
      $consecutiveReadyChecks = 0
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }

  docker exec $containerName createdb -U postgres phase10l_template
  if ($LASTEXITCODE -ne 0) { throw 'Could not create PHASE 10L template database.' }
  Invoke-DatabaseSql 'phase10l_template' @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@

  $files = @(
    (Resolve-Path 'supabase-schema.sql').Path,
    (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  ) + @(
    Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
      Where-Object { $_.FullName -ne $resetMigration } |
      Sort-Object Name |
      ForEach-Object FullName
  )
  foreach ($file in $files) { Invoke-DatabaseSqlFile 'phase10l_template' $file }

  # The exact audited baseline succeeds and keeps all private, beta, security,
  # school, advertising, order, and payment structures intact.
  New-ScenarioDatabase 'phase10l_success'
  Invoke-DatabaseSqlFile 'phase10l_success' $resetMigration
  foreach ($smoke in @(
    'scripts/phase10l/lifecycle-smoke.sql',
    'scripts/phase10l/permission-smoke.sql',
    'scripts/phase10j/lifecycle-smoke.sql',
    'scripts/phase10j/permission-smoke.sql'
  )) { Invoke-DatabaseSqlFile 'phase10l_success' $smoke }

  Assert-ResetRejected 'phase10l_profile_drift' @"
INSERT INTO public.profiles(school_id,graduation_year,nickname,owner_user_id)
SELECT id,2000,'TEST DRIFT',NULL FROM public.schools ORDER BY school_code LIMIT 1;
"@ '(SELECT count(*)-25 FROM public.profiles)' 'profile drift' 26

  Assert-ResetRejected 'phase10l_safety_drift' @"
SET session_replication_role=replica;
INSERT INTO public.safety_account_restrictions(user_id,status,reason_code)
VALUES ('51000000-0000-4000-8000-000000000001','suspended','safety_review');
SET session_replication_role=origin;
"@ '(SELECT count(*) FROM public.safety_account_restrictions)' 'safety restriction'

  Assert-ResetRejected 'phase10l_editorial_drift' @"
CREATE OR REPLACE FUNCTION public.promotion_text_is_safe(input_text text,max_length integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS 'SELECT true';
CREATE OR REPLACE FUNCTION public.promotion_url_is_safe(input_url text,instagram_only boolean DEFAULT false) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS 'SELECT true';
CREATE OR REPLACE FUNCTION public.promotion_image_url_is_safe(input_url text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS 'SELECT true';
SET session_replication_role=replica;
INSERT INTO public.editorial_features(
  account_id,title,body,image_url,landing_url,placement_type,context_key,
  starts_at,ends_at,status,economic_consideration,selected_by
) VALUES (
  '52000000-0000-4000-8000-000000000001','TEST TITLE','TEST BODY',
  'https://images.unsplash.com/photo-1','https://www.schoollove.kr',
  'homepage_today','global',now(),now()+interval '1 day','draft',false,'test:phase10l'
);
SET session_replication_role=origin;
"@ '(SELECT count(*) FROM public.editorial_features)' 'editorial account link'

  Assert-ResetRejected 'phase10l_beta_drift' @"
INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,reason_code)
VALUES ('system','test:phase10l','test_beta_drift','beta_program','TEST_DRIFT');
"@ '(SELECT count(*) FROM public.beta_audit_logs)' 'beta operation'

  Assert-ResetRejected 'phase10l_ad_drift' @"
CREATE OR REPLACE FUNCTION public.promotion_image_url_is_safe(input_url text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS 'SELECT true';
SET session_replication_role=replica;
INSERT INTO public.promotion_assets(request_id,image_url,rights_confirmed)
VALUES ('53000000-0000-4000-8000-000000000001','https://images.unsplash.com/photo-1',true);
SET session_replication_role=origin;
"@ '(SELECT count(*) FROM public.promotion_assets)' 'advertising data'

  Assert-ResetRejected 'phase10l_order_drift' @"
SET session_replication_role=replica;
INSERT INTO public.promotion_orders(request_id,amount_krw,currency,payment_method,status)
VALUES ('54000000-0000-4000-8000-000000000001',1000,'KRW','bank_transfer','payment_pending');
SET session_replication_role=origin;
"@ '(SELECT count(*) FROM public.promotion_orders)' 'order data'

  Assert-ResetRejected 'phase10l_payment_drift' @"
SET session_replication_role=replica;
INSERT INTO public.payment_transactions(
  order_id,owner_user_id,provider,provider_payment_id,status,order_number,
  amount_krw,currency,idempotency_key_hash
) VALUES (
  '55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002',
  'manual','TESTPAYMENT01','created','SL-20260803-ABCDEF123456',1000,'KRW',repeat('a',64)
);
SET session_replication_role=origin;
"@ '(SELECT count(*) FROM public.payment_transactions)' 'payment data'

  Assert-ResetRejected 'phase10l_unclassified' @"
CREATE TABLE public.phase10l_unclassified(id bigint PRIMARY KEY);
INSERT INTO public.phase10l_unclassified VALUES (1);
"@ '(SELECT count(*) FROM public.phase10l_unclassified)' 'unclassified public table'

  Assert-ResetRejected 'phase10l_midstatement' @'
CREATE FUNCTION public.phase10l_force_delete_failure() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'TEST_FORCED_DELETE_FAILURE'; END$$;
CREATE TRIGGER phase10l_force_delete_failure BEFORE DELETE ON public.profiles
FOR EACH STATEMENT EXECUTE FUNCTION public.phase10l_force_delete_failure();
'@ '(SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname=''phase10l_force_delete_failure'' AND NOT tgisinternal)' 'mid-statement failure'

  # A raw second execution after success must fail the exact baseline guard.
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  Get-Content -LiteralPath $resetMigration -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d phase10l_success -v ON_ERROR_STOP=1 -q 2>$null
  $replayExit = $LASTEXITCODE
  $ErrorActionPreference = $oldPreference
  if ($replayExit -eq 0) { throw 'Zero-row replay unexpectedly succeeded.' }
  $replayState = docker exec $containerName psql -U postgres -d phase10l_success -tAc "SELECT concat_ws('|',(SELECT count(*) FROM public.profiles),(SELECT count(*) FROM public.reports),(SELECT count(*) FROM public.traces),(SELECT count(*) FROM public.search_logs))"
  if ($LASTEXITCODE -ne 0 -or $replayState.Trim() -ne '0|0|0|0') { throw 'Zero-row replay changed reset state.' }

  Write-Output 'PHASE10L_ZERO_REPLAY_REJECTED'
  Write-Output 'PHASE10L_ISOLATED_DB_OK'
}
finally {
  if ($containerCreated) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker rm -f $containerName 2>$null | Out-Null
    $ErrorActionPreference = $oldPreference
  }
}
