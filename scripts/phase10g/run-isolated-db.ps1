$ErrorActionPreference = 'Stop'
$containerName = 'schoollove-phase10g-db-script'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$containerCreated = $false

try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }
  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_phase10g_only $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL container could not start.' }
  $containerCreated = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $containerName pg_isready -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }
  Start-Sleep -Seconds 5
  $files = @((Resolve-Path 'supabase-schema.sql').Path,(Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path) + (Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' | Sort-Object Name | ForEach-Object FullName)
  foreach ($file in $files) {
    Get-Content -LiteralPath $file -Raw -Encoding UTF8 | docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $file" }
  }
  foreach ($smoke in @('scripts/phase10g/lifecycle-smoke.sql','scripts/phase10g/permission-smoke.sql')) {
    Get-Content -LiteralPath $smoke -Raw -Encoding UTF8 | docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw "Smoke failed: $smoke" }
  }
  Write-Output 'PHASE10G_ISOLATED_DB_OK'
}
finally {
  if ($containerCreated) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker rm -f $containerName 2>$null | Out-Null
    $ErrorActionPreference = $previousPreference
  }
}
