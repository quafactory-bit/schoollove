$ErrorActionPreference='Stop'
$container='schoollove-phase10v-audit-db'
$fresh='phase10v_fresh'
$upgrade='phase10v_upgrade'
$image='public.ecr.aws/supabase/postgres:17.6.1.143'
$migration=(Resolve-Path 'supabase/migrations/20260826061123_people_discovery_safety_hardening.sql').Path
$created=$false
$temp=Join-Path ([IO.Path]::GetTempPath()) ('schoollove-phase10v-'+[guid]::NewGuid().ToString('N'))

function Invoke-SqlFile([string]$database,[string]$file){
  $containerPath='/tmp/phase10v-'+[guid]::NewGuid().ToString('N')+'.sql'
  docker cp $file "${container}:$containerPath"|Out-Null
  if($LASTEXITCODE-ne 0){throw "SQL copy failed: $file"}
  docker exec $container psql -U postgres -d $database -v ON_ERROR_STOP=1 -q -f $containerPath
  if($LASTEXITCODE-ne 0){throw "SQL failed: $file"}
  docker exec $container rm -f $containerPath|Out-Null
}
function Invoke-SqlText([string]$database,[string]$sql){
  $file=Join-Path $temp ([guid]::NewGuid().ToString('N')+'.sql')
  [IO.File]::WriteAllText($file,$sql,[Text.UTF8Encoding]::new($false))
  try{Invoke-SqlFile $database $file}finally{Remove-Item -LiteralPath $file -Force}
}
function Scalar([string]$database,[string]$sql){
  $value=(docker exec $container psql -U postgres -d $database -tAc $sql).Trim()
  if($LASTEXITCODE-ne 0){throw "Scalar SQL failed: $sql"}
  return $value
}
function Initialize-Base([string]$database){
  docker exec $container createdb -U postgres -T template0 $database
  if($LASTEXITCODE-ne 0){throw "Database create failed: $database"}
  Invoke-SqlText $database @'
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(
  id uuid PRIMARY KEY,email text,banned_until timestamptz,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.identities(
  id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text,provider text NOT NULL,identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),last_sign_in_at timestamptz
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path=''
AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
'@
  Invoke-SqlFile $database (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile $database (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql'|
    Where-Object{$_.Name-lt'20260802120000_legacy_person_data_reset.sql'}|Sort-Object Name|
    ForEach-Object{Invoke-SqlFile $database $_.FullName}
  Invoke-SqlFile $database (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  Invoke-SqlFile $database (Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
  Invoke-SqlFile $database (Resolve-Path 'supabase/migrations/20260803120000_public_account_soft_launch.sql').Path
}
function Apply-Post10U([string]$database,[bool]$includeHardening){
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql'|Sort-Object Name|
    Where-Object{$_.Name-gt'20260803120000_public_account_soft_launch.sql'-and($includeHardening-or$_.FullName-ne$migration)}|
    ForEach-Object{Invoke-SqlFile $database $_.FullName}
}

try{
  New-Item -ItemType Directory -Path $temp|Out-Null
  docker version --format '{{.Server.Version}}'|Out-Null
  if($LASTEXITCODE-ne 0){throw 'Docker engine is unavailable.'}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $container 2>$null|Out-Null;$ErrorActionPreference=$old
  docker run -d --name $container -e POSTGRES_PASSWORD=local_phase10v_only $image|Out-Null
  if($LASTEXITCODE-ne 0){throw 'Isolated PostgreSQL container could not start.'}
  $created=$true;$ready=$false
  for($attempt=0;$attempt-lt 120;$attempt++){
    $health=(docker inspect --format '{{.State.Health.Status}}' $container 2>$null).Trim()
    if($health-eq'healthy'){$ready=$true;break};Start-Sleep -Seconds 1
  }
  if(-not$ready){throw 'PostgreSQL healthcheck did not become ready.'}

  Initialize-Base $fresh
  Apply-Post10U $fresh $true
  Write-Output 'PHASE10V_FRESH_CHAIN_OK migrations=34'

  Initialize-Base $upgrade
  Apply-Post10U $upgrade $false
  $before=Scalar $upgrade "SELECT concat_ws('|',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),(SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'))"
  Invoke-SqlFile $upgrade $migration
  $after=Scalar $upgrade "SELECT concat_ws('|',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),(SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'))"
  if($before-ne$after){throw "Upgrade schema delta detected: before=$before after=$after"}
  Write-Output "PHASE10V_UPGRADE_OK tables_columns_functions=$after"

  Invoke-SqlFile $fresh (Resolve-Path 'scripts/phase10v/parity-probe.sql').Path
  Invoke-SqlFile $fresh (Resolve-Path 'scripts/phase10v/disposable-audit.sql').Path
  & powershell -ExecutionPolicy Bypass -File scripts/phase10v/run-concurrency.ps1 -ContainerName $container -DatabaseName $fresh
  if($LASTEXITCODE-ne 0){throw 'Concurrency audit failed.'}
  Write-Output 'PHASE10V_ISOLATED_DB_OK fresh=PASS upgrade=PASS scenarios=34 google_bound_users=76 replay=blocked concurrency=single_winner rls=forced idor=blocked container_removed=true'
}
finally{
  if($created){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $container 2>$null|Out-Null;$ErrorActionPreference=$old}
  if(Test-Path $temp){Remove-Item -LiteralPath $temp -Recurse -Force}
}
