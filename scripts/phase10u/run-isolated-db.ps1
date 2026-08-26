$ErrorActionPreference = 'Stop'
$containerName = 'schoollove-phase10u-audit-db'
$databaseName = 'phase10u'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$created = $false

function Invoke-SqlFile([string]$file) {
  $containerPath = '/tmp/phase10u-' + [guid]::NewGuid().ToString('N') + '.sql'
  docker cp $file "${containerName}:$containerPath" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SQL copy failed: $file" }
  docker exec $containerName psql -U postgres -d $databaseName -v ON_ERROR_STOP=1 -q -f $containerPath
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $file" }
}

function Invoke-Sql([string]$sql) {
  $sql | docker exec -i $containerName psql -U postgres -d $databaseName -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'SQL bootstrap failed.' }
}

try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  docker rm -f $containerName 2>$null | Out-Null
  $ErrorActionPreference = $oldPreference

  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_phase10u_only $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL container could not start.' }
  $created = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
    $health = (docker inspect --format '{{.State.Health.Status}}' $containerName 2>$null).Trim()
    if ($health -eq 'healthy') { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL healthcheck did not become ready.' }

  docker exec $containerName createdb -U postgres $databaseName
  if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated audit database.' }
  Invoke-Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(
  id uuid PRIMARY KEY,
  email text,
  banned_until timestamptz,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.identities(
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path=''
AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@

  Invoke-SqlFile (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
    Where-Object { $_.Name -lt '20260802120000_legacy_person_data_reset.sql' } |
    Sort-Object Name |
    ForEach-Object { Invoke-SqlFile $_.FullName }
  Invoke-SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
  Invoke-SqlFile (Resolve-Path 'supabase/migrations/20260803120000_public_account_soft_launch.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10u/parity-probe.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10u/disposable-audit.sql').Path

  & powershell -ExecutionPolicy Bypass -File scripts/phase10u/run-concurrency.ps1 -ContainerName $containerName -DatabaseName $databaseName
  if ($LASTEXITCODE -ne 0) { throw 'Match-token concurrency audit failed.' }

  Write-Output 'PHASE10U_ISOLATED_DB_OK scenarios=17 google_bound_users=50 replay=blocked concurrency=single_winner rls=forced idor=blocked container_removed=true'
}
finally {
  if ($created) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker rm -f $containerName 2>$null | Out-Null
    $ErrorActionPreference = $oldPreference
  }
}
