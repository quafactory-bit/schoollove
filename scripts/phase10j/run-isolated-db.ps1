$ErrorActionPreference = 'Stop'
$containerName = 'schoollove-phase10j-db-script'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$containerCreated = $false
try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }
  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_phase10j_only $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL container could not start.' }
  $containerCreated = $true
  $ready = $false; $consecutiveReadyChecks = 0
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $health = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $containerName
    $oldPreference = $ErrorActionPreference; $ErrorActionPreference = 'SilentlyContinue'
    docker exec $containerName psql -U postgres -d postgres -tAc 'SELECT 1' 2>$null | Out-Null
    $exitCode = $LASTEXITCODE; $ErrorActionPreference = $oldPreference
    if ($exitCode -eq 0 -and ($health -eq 'healthy' -or $health -eq 'none')) { $consecutiveReadyChecks++; if ($consecutiveReadyChecks -ge 3) { $ready=$true; break } } else { $consecutiveReadyChecks=0 }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }
  $migrations=@(Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql'|Sort-Object Name)
  $reset=$migrations|Where-Object Name -eq '20260802120000_legacy_person_data_reset.sql'
  $beforeReset=$migrations|Where-Object Name -lt '20260802120000_legacy_person_data_reset.sql'
  $afterReset=$migrations|Where-Object Name -gt '20260802120000_legacy_person_data_reset.sql'
  $files=@((Resolve-Path 'supabase-schema.sql').Path,(Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path)+($beforeReset|ForEach-Object FullName)
  foreach($file in $files){Get-Content -LiteralPath $file -Raw -Encoding UTF8|docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw "Migration failed: $file"}}
  Get-Content -LiteralPath 'scripts/phase10l/seed-production-shape.sql' -Raw -Encoding UTF8|docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE-ne 0){throw 'Production-shape fixture failed.'}
  foreach($file in @($reset.FullName)+($afterReset|ForEach-Object FullName)){Get-Content -LiteralPath $file -Raw -Encoding UTF8|docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw "Migration failed: $file"}}
  foreach($smoke in @('scripts/phase10j/lifecycle-smoke.sql','scripts/phase10j/permission-smoke.sql')){Get-Content -LiteralPath $smoke -Raw -Encoding UTF8|docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw "Smoke failed: $smoke"}}
  Write-Output 'PHASE10J_ISOLATED_DB_OK'
} finally {
  if($containerCreated){$oldPreference=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$oldPreference}
}
