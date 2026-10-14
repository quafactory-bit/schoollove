$ErrorActionPreference = 'Stop'
$container = ('schoollove-attribution-' + [guid]::NewGuid().ToString('N'))
$fresh = 'pwa_phase2_fresh'
$upgrade = 'pwa_phase2_upgrade'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$migration = (Resolve-Path 'supabase/migrations/20261014090650_signup_attribution_daily_aggregates.sql').Path
$created = $false
$temp = Join-Path ([IO.Path]::GetTempPath()) ('schoollove-pwa-phase2-' + [guid]::NewGuid().ToString('N'))

function Invoke-SqlFile([string]$database, [string]$file) {
  $containerPath = '/tmp/pwa-phase2-' + [guid]::NewGuid().ToString('N') + '.sql'
  docker cp $file "${container}:$containerPath" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "SQL copy failed: $file" }
  if ($file -eq $migration) {
    docker exec $container psql -U postgres -d $database -v ON_ERROR_STOP=1 -q -1 -f $containerPath
  } else {
    docker exec $container psql -U postgres -d $database -v ON_ERROR_STOP=1 -q -f $containerPath
  }
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
  if ($LASTEXITCODE -ne 0) { throw 'Docker unavailable' }
  docker run -d --name $container -e POSTGRES_PASSWORD=local_disposable_only $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Container start failed' }
  $created = $true
  for ($attempt=0;$attempt -lt 120;$attempt++) {
    if ((docker inspect --format '{{.State.Health.Status}}' $container) -eq 'healthy') { break }
    Start-Sleep -Seconds 1
  }
  # Start from a separate empty database: prerequisites, 081007, then 090650.
  Initialize-Base $fresh
  Apply-AfterBase $fresh $true
  if ((Scalar $fresh 'SELECT count(*) FROM public.signup_attribution') -ne '0') {
    throw 'Fresh aggregate table is not empty'
  }
  Invoke-SqlFile $fresh (Resolve-Path 'scripts/signup-attribution/matrix.sql').Path
  Write-Output 'SIGNUP_ATTRIBUTION_FRESH_CHAIN_PASS 081007_then_090650 empty_daily_table full_matrix'
  Initialize-Base $upgrade
  Apply-AfterBase $upgrade $false
  Invoke-SqlText $upgrade @'
INSERT INTO public.signup_attribution(source,medium,campaign,content,landing_path) VALUES
('threads',NULL,NULL,NULL,'/'),('threads',NULL,NULL,NULL,'/login'),
('threads','post_body','devlog','1020-08','/');
'@
  Invoke-SqlFile $upgrade $migration
  Invoke-SqlText $upgrade @'
DO $$ BEGIN
  IF (SELECT count(*) FROM public.signup_attribution) <> 2
    OR (SELECT sum(count) FROM public.signup_attribution) <> 3
    OR (SELECT count FROM public.signup_attribution WHERE medium IS NULL) <> 2
  THEN RAISE EXCEPTION 'upgrade totals lost or NULL buckets duplicated'; END IF;
END $$;
TRUNCATE public.signup_attribution;
'@
  Invoke-SqlFile $upgrade (Resolve-Path 'scripts/signup-attribution/matrix.sql').Path
  Write-Output 'SIGNUP_ATTRIBUTION_DB_PASS upgrade_totals schema permissions first_signup update recreation daily_upsert null_buckets dimensions unknown rollback'
} finally {
  if ($created) { docker rm -f $container | Out-Null }
  $resolvedTemp = [IO.Path]::GetFullPath($temp)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if (-not $resolvedTemp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
      -not ([IO.Path]::GetFileName($resolvedTemp)).StartsWith('schoollove-pwa-phase2-')) {
    throw 'Refusing cleanup outside the owned temporary directory.'
  }
  if (Test-Path -LiteralPath $resolvedTemp) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
}
