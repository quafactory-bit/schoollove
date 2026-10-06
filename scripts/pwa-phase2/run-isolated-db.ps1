$ErrorActionPreference = 'Stop'
$container = 'schoollove-pwa-phase2-db'
$fresh = 'pwa_phase2_fresh'
$upgrade = 'pwa_phase2_upgrade'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$migration = (Resolve-Path 'supabase/migrations/20261006091303_pwa_phase2_push_subscriptions.sql').Path
$created = $false
$temp = Join-Path ([IO.Path]::GetTempPath()) ('schoollove-pwa-phase2-' + [guid]::NewGuid().ToString('N'))

function Invoke-SqlFile([string]$database, [string]$file) {
  $containerPath = '/tmp/pwa-phase2-' + [guid]::NewGuid().ToString('N') + '.sql'
  docker cp $file "${container}:$containerPath" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SQL copy failed: $file" }
  docker exec $container psql -U postgres -d $database -v ON_ERROR_STOP=1 -q -f $containerPath
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $file" }
  docker exec $container rm -f $containerPath | Out-Null
}

function Invoke-SqlText([string]$database, [string]$sql) {
  $file = Join-Path $temp ([guid]::NewGuid().ToString('N') + '.sql')
  [IO.File]::WriteAllText($file, $sql, [Text.UTF8Encoding]::new($false))
  try { Invoke-SqlFile $database $file } finally { Remove-Item -LiteralPath $file -Force }
}

function Scalar([string]$database, [string]$sql) {
  $value = (docker exec $container psql -U postgres -d $database -tAc $sql).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Scalar SQL failed: $sql" }
  return $value
}

function Initialize-Base([string]$database) {
  docker exec $container createdb -U postgres -T template0 $database
  if ($LASTEXITCODE -ne 0) { throw "Database create failed: $database" }
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
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
    Where-Object { $_.Name -lt '20260802120000_legacy_person_data_reset.sql' } |
    Sort-Object Name |
    ForEach-Object { Invoke-SqlFile $database $_.FullName }
  Invoke-SqlFile $database (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  Invoke-SqlFile $database (Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
  Invoke-SqlFile $database (Resolve-Path 'supabase/migrations/20260803120000_public_account_soft_launch.sql').Path
}

function Apply-AfterBase([string]$database, [bool]$includePush) {
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
    Sort-Object Name |
    Where-Object {
      $_.Name -gt '20260803120000_public_account_soft_launch.sql' -and
      $_.Name -notin @(
        '20260915211712_privacy_retention_cleanup.sql',
        '20260915211726_privacy_retention_schedule.sql'
      ) -and
      ($includePush -or $_.FullName -ne $migration)
    } |
    ForEach-Object { Invoke-SqlFile $database $_.FullName }
}

try {
  New-Item -ItemType Directory -Path $temp | Out-Null
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  docker rm -f $container 2>$null | Out-Null
  $ErrorActionPreference = $old
  docker run -d --name $container -e POSTGRES_PASSWORD=local_pwa_phase2_only $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL container could not start.' }
  $created = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
    $health = (docker inspect --format '{{.State.Health.Status}}' $container 2>$null).Trim()
    if ($health -eq 'healthy') { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'PostgreSQL healthcheck did not become ready.' }

  Initialize-Base $fresh
  Apply-AfterBase $fresh $true
  Invoke-SqlFile $fresh (Resolve-Path 'scripts/pwa-phase2/disposable-matrix.sql').Path
  Write-Output 'PWA_PHASE2_FRESH_CHAIN_OK'

  Initialize-Base $upgrade
  Apply-AfterBase $upgrade $false
  $before = (Scalar $upgrade "SELECT concat_ws('|',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),(SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'))").Split('|')
  Invoke-SqlFile $upgrade $migration
  $after = (Scalar $upgrade "SELECT concat_ws('|',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),(SELECT count(*) FROM information_schema.columns WHERE table_schema='public'),(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'))").Split('|')
  if ([int]$after[0] -ne [int]$before[0] + 1 -or [int]$after[1] -ne [int]$before[1] + 7 -or $after[2] -ne $before[2]) {
    throw "Unexpected upgrade delta: before=$($before -join '|') after=$($after -join '|')"
  }
  Invoke-SqlFile $upgrade (Resolve-Path 'scripts/pwa-phase2/disposable-matrix.sql').Path
  Write-Output "PWA_PHASE2_UPGRADE_OK before=$($before -join '|') after=$($after -join '|')"
  Write-Output 'PWA_PHASE2_ISOLATED_DB_OK fresh=PASS upgrade=PASS rls=PASS grants=PASS withdrawal=PASS cascade=PASS container_removed=true'
}
finally {
  if ($created) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker rm -f $container 2>$null | Out-Null
    $ErrorActionPreference = $old
  }
  if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
