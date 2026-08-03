$ErrorActionPreference='Stop'
$containerName='schoollove-phase10n-db-script'
$image='public.ecr.aws/supabase/postgres:17.6.1.143'
$resetMigration=(Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
$launchMigration=(Resolve-Path 'supabase/migrations/20260803120000_public_account_soft_launch.sql').Path
$created=$false
function Invoke-SqlFile([string]$file){Get-Content -LiteralPath $file -Raw -Encoding UTF8|docker exec -i $containerName psql -U postgres -d phase10n -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw "SQL failed: $file"}}
function Invoke-Sql([string]$sql){$sql|docker exec -i $containerName psql -U postgres -d phase10n -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw 'SQL bootstrap failed.'}}
try{
  docker version --format '{{.Server.Version}}'|Out-Null
  if($LASTEXITCODE-ne 0){throw 'Docker engine is unavailable.'}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old
  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_phase10n_only $image|Out-Null
  if($LASTEXITCODE-ne 0){throw 'Isolated PostgreSQL container could not start.'};$created=$true
  $ready=$false;$consecutive=0
  for($attempt=0;$attempt-lt 120;$attempt++){
    $health=docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $containerName
    $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker exec $containerName psql -U postgres -d postgres -tAc 'SELECT 1' 2>$null|Out-Null;$code=$LASTEXITCODE;$ErrorActionPreference=$old
    if($code-eq 0-and($health-eq'healthy'-or$health-eq'none')){$consecutive++;if($consecutive-ge 3){$ready=$true;break}}else{$consecutive=0}
    Start-Sleep -Seconds 1
  }
  if(-not $ready){throw 'Isolated PostgreSQL did not become ready.'}
  docker exec $containerName createdb -U postgres phase10n
  Invoke-Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@
  Invoke-SqlFile (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql'|Where-Object{$_.Name-lt'20260802120000_legacy_person_data_reset.sql'}|Sort-Object Name|ForEach-Object{Invoke-SqlFile $_.FullName}
  Invoke-SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  Invoke-SqlFile $resetMigration
  Invoke-SqlFile $launchMigration
  foreach($smoke in @('scripts/phase10n/lifecycle-smoke.sql','scripts/phase10n/permission-smoke.sql','scripts/phase10j/lifecycle-smoke.sql','scripts/phase10j/permission-smoke.sql')){Invoke-SqlFile (Resolve-Path $smoke).Path}
  $baseline=docker exec $containerName psql -U postgres -d phase10n -tAc "SELECT concat_ws('|',(SELECT count(*) FROM public.profiles),(SELECT count(*) FROM public.reports),(SELECT count(*) FROM public.traces),(SELECT count(*) FROM public.search_logs),(SELECT count(*) FROM public.schools),(SELECT count(*) FROM public.beta_members),(SELECT count(*) FROM public.promotion_orders),(SELECT state FROM public.public_account_launch_control))"
  if($LASTEXITCODE-ne 0-or$baseline.Trim()-ne'0|0|0|0|10006|0|0|closed'){throw "Final baseline mismatch: $($baseline.Trim())"}
  Write-Output 'PHASE10N_ISOLATED_DB_OK 0|0|0|0|10006|0|0|closed'
}finally{if($created){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old}}
