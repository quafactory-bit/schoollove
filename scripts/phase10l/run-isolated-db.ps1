$ErrorActionPreference = 'Stop'
$containerName = 'schoollove-phase10l-db-script'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$resetMigration = (Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
$containerCreated = $false

try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }

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

  $files = @(
    (Resolve-Path 'supabase-schema.sql').Path,
    (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  ) + @(
    Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' |
      Where-Object { $_.FullName -ne $resetMigration } |
      Sort-Object Name |
      ForEach-Object FullName
  )

  foreach ($file in $files) {
    Get-Content -LiteralPath $file -Raw -Encoding UTF8 |
      docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $file" }
  }

  Get-Content -LiteralPath 'scripts/phase10l/seed-production-shape.sql' -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic Production-shape seed failed.' }

  Get-Content -LiteralPath $resetMigration -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'PHASE 10L reset migration failed.' }

  foreach ($smoke in @(
    'scripts/phase10l/lifecycle-smoke.sql',
    'scripts/phase10l/permission-smoke.sql',
    'scripts/phase10j/lifecycle-smoke.sql',
    'scripts/phase10j/permission-smoke.sql'
  )) {
    Get-Content -LiteralPath $smoke -Raw -Encoding UTF8 |
      docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw "Smoke failed: $smoke" }
  }

  # A drifted 1-profile state must abort before deleting anything. This is a
  # diagnostic second execution inside the disposable database, not a second
  # Production migration application.
  $guardInsert = @"
INSERT INTO public.profiles(school_id,graduation_year,nickname,owner_user_id)
SELECT id,2000,'TEST DRIFT',NULL FROM public.schools ORDER BY school_code LIMIT 1;
"@
  $guardInsert | docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'Guard fixture insert failed.' }

  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  Get-Content -LiteralPath $resetMigration -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q 2>$null
  $guardExit = $LASTEXITCODE
  $ErrorActionPreference = $oldPreference
  if ($guardExit -eq 0) { throw 'Baseline guard unexpectedly accepted drifted data.' }

  $remaining = docker exec $containerName psql -U postgres -d postgres -tAc 'SELECT count(*) FROM public.profiles'
  if ($LASTEXITCODE -ne 0 -or $remaining.Trim() -ne '1') {
    throw 'Baseline guard was not atomic.'
  }

  Write-Output 'PHASE10L_BASELINE_GUARD_OK'
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
