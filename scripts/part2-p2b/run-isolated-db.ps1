# Disposable local PostgreSQL check for Part 2 P2b (recovery-optional Google account).
# Uses an already available image, loopback-only port, no remote credentials.
# -Baseline repo (default): every auth migration in the repo.
# -Baseline preview: the Preview project's shape, which never received 20260915211712.
param([ValidateSet('repo','preview')][string]$Baseline='repo')
# PS 5.1 turns psql NOTICE lines on stderr into errors under 'Stop'; every native call checks $LASTEXITCODE instead.
$ErrorActionPreference='Continue'
$containerName='schoollove-p2b-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$image='public.ecr.aws/supabase/postgres:17.6.1.143'
$password=('p2b_'+[guid]::NewGuid().ToString('N'))
$created=$false
$db='p2b'
$targetMigration='supabase/migrations/20261120090000_p2b_recovery_optional_social_account.sql'

function Invoke-Sql([string]$sql) {
  $sql | docker exec -i -e PGOPTIONS=-cclient_min_messages=warning $containerName psql -U postgres -d $db -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE-ne 0){throw "SQL failed"}
}
function Invoke-SqlFile([string]$file) {
  Get-Content -LiteralPath $file -Raw -Encoding UTF8 | docker exec -i -e PGOPTIONS=-cclient_min_messages=warning $containerName psql -U postgres -d $db -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE-ne 0){throw "SQL file failed: $file"}
}
function Scalar([string]$sql) {
  $value = docker exec $containerName psql -U postgres -d $db -tAc $sql
  if($LASTEXITCODE-ne 0){throw "Scalar failed"}
  return ($value -join '').Trim()
}
function Clear-PgEnvironment { Remove-Item Env:PGHOST,Env:PGPORT,Env:PGDATABASE,Env:PGUSER,Env:PGPASSWORD -ErrorAction SilentlyContinue }
$truncate="TRUNCATE private.downstream_authorization_transactions,private.upstream_login_legs,private.broker_authorization_codes,private.recovery_delivery_attempts,private.recovery_email_verifications,private.social_identity_registry,private.oauth_login_attempts,private.auth_principal_cleanup_jobs,private.private_accounts CASCADE; DELETE FROM auth.identities; DELETE FROM auth.users;"

try {
  docker image inspect $image --format '{{.Id}}' | Out-Null
  if($LASTEXITCODE-ne 0){throw 'The pre-existing local image is unavailable; no image will be installed.'}
  docker run -d --name $containerName -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=$password $image | Out-Null
  if($LASTEXITCODE-ne 0){throw 'Container start failed'}
  $created=$true;$ready=$false
  for($i=0;$i-lt 90;$i++){if((docker inspect --format '{{.State.Health.Status}}' $containerName 2>$null).Trim()-eq'healthy'){$ready=$true;break};Start-Sleep -Seconds 1}
  if(-not $ready){throw 'Container health timeout'}
  docker exec $containerName createdb -U postgres $db
  if($LASTEXITCODE-ne 0){throw 'createdb failed'}
  Invoke-Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz,raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),provider_id text NOT NULL,provider text NOT NULL,identity_data jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@
  Invoke-SqlFile (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  $all = Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' | Sort-Object Name
  $all | Where-Object { $_.Name -lt '20260802120000_legacy_person_data_reset.sql' } | ForEach-Object { Invoke-SqlFile $_.FullName }
  Invoke-SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  # Auth/recovery schema is last touched by 20260915211712; later files are pg_cron schedules or
  # unrelated public features (verified by grep), so the chain stops there. The cron-only file is skipped.
  $all | Where-Object { $_.Name -ge '20260802120000' -and $_.Name -lt '20260916' -and $_.Name -ne '20260915211726_privacy_retention_schedule.sql' -and -not ($Baseline -eq 'preview' -and $_.Name -eq '20260915211712_privacy_retention_cleanup.sql') } | ForEach-Object { Invoke-SqlFile $_.FullName }
  Write-Output "P2B_BASELINE_APPLIED baseline=$Baseline"
  Invoke-SqlFile (Resolve-Path 'scripts/part2-p2b/fixture.sql').Path

  $before = Scalar "SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND (p.proname LIKE '%social%' OR p.proname LIKE '%recovery%' OR p.proname LIKE '%broker%' OR p.proname LIKE '%upstream%' OR p.proname LIKE '%downstream%' OR p.proname LIKE '%deletion%')"
  $pre = (Get-Content -LiteralPath 'scripts/part2-p2b/preapply-check.sql' -Raw -Encoding UTF8 | docker exec -i $containerName psql -U postgres -d $db -tA -F ',' -q) -join ''
  if($pre -notmatch '^1,1,0,'){throw "Pre-apply check failed: $pre"}
  Invoke-SqlFile (Resolve-Path $targetMigration).Path
  $post = (Get-Content -LiteralPath 'scripts/part2-p2b/postapply-check.sql' -Raw -Encoding UTF8 | docker exec -i $containerName psql -U postgres -d $db -tA -F ',' -q) -join ''
  if($post -notmatch '^t,t,t,'){throw "Post-apply check failed: $post"}
  Write-Output "P2B_PRE_POST_APPLY_CHECKS_OK pre=$pre post=$post"
  $after = Scalar "SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND (p.proname LIKE '%social%' OR p.proname LIKE '%recovery%' OR p.proname LIKE '%broker%' OR p.proname LIKE '%upstream%' OR p.proname LIKE '%downstream%' OR p.proname LIKE '%deletion%') AND p.proname NOT LIKE '%recovery_optional%' AND p.proname NOT LIKE '%account_recovery%' AND p.proname NOT LIKE 'p2b_%'"
  if($before -ne $after){throw 'An existing auth function body changed.'}
  Write-Output 'P2B_EXISTING_FUNCTIONS_UNCHANGED'

  Invoke-SqlFile (Resolve-Path 'scripts/part2-p2b/matrix.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/part2-p2b/legacy-regression.sql').Path

  # Two independent sessions race the same brand-new Google subject.
  Invoke-Sql $truncate
  Invoke-SqlFile (Resolve-Path 'scripts/part2-p2b/race-setup.sql').Path
  $mapping=(docker port $containerName 5432/tcp).Trim();if($mapping-notmatch ':(\d+)$'){throw 'Port discovery failed'}
  $env:PGHOST='127.0.0.1';$env:PGPORT=$Matches[1];$env:PGDATABASE=$db;$env:PGUSER='postgres';$env:PGPASSWORD=$password
  node scripts/part2-p2b/race-runner.mjs
  if($LASTEXITCODE-ne 0){throw 'Same-subject race failed'}
  Clear-PgEnvironment
  Write-Output 'P2B_ISOLATED_DB_PASS container_removed=true'
} finally {
  Clear-PgEnvironment
  if($created){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old}
}
