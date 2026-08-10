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
  $ready=$false;for($attempt=0;$attempt-lt 60;$attempt++){docker exec $containerName pg_isready -U postgres|Out-Null;if($LASTEXITCODE-eq 0){$ready=$true;break};Start-Sleep -Seconds 1};if(-not $ready){throw 'Isolated PostgreSQL did not become ready.'}
  Start-Sleep -Seconds 3
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
  $tableCount=docker exec $containerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r'"
  if($LASTEXITCODE-ne 0-or$tableCount.Trim()-ne'4'){throw "Private table boundary mismatch: $($tableCount.Trim())"}
  Write-Output 'PHASE10O_F_ISOLATED_DB_OK private_tables=4 rollback=container_removed'
} finally {if($created){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old}}
