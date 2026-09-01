$ErrorActionPreference='Stop'
$containerName='schoollove-controlled-beta-onboarding-db'
$databaseName='controlled_beta_onboarding'
$image='public.ecr.aws/supabase/postgres:17.6.1.143'
$created=$false
function Invoke-SqlFile([string]$file){
  Get-Content -LiteralPath $file -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d $databaseName -v ON_ERROR_STOP=1 -q
  if($LASTEXITCODE-ne 0){throw "SQL failed: $file"}
}
try{
  docker version --format '{{.Server.Version}}'|Out-Null
  if($LASTEXITCODE-ne 0){throw 'Docker engine is unavailable.'}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue'
  docker rm -f $containerName 2>$null|Out-Null
  $ErrorActionPreference=$old
  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_controlled_beta_only $image|Out-Null
  if($LASTEXITCODE-ne 0){throw 'Isolated PostgreSQL container could not start.'}
  $created=$true
  $ready=$false;$consecutive=0
  for($attempt=0;$attempt-lt 120;$attempt++){
    $health=docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $containerName
    $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue'
    docker exec $containerName psql -U postgres -d postgres -tAc 'SELECT 1' 2>$null|Out-Null
    $exit=$LASTEXITCODE;$ErrorActionPreference=$old
    if($exit-eq 0-and($health-eq'healthy'-or$health-eq'none')){$consecutive++;if($consecutive-ge 3){$ready=$true;break}}else{$consecutive=0}
    Start-Sleep -Seconds 1
  }
  if(-not $ready){throw 'Isolated PostgreSQL did not become ready.'}
  docker exec $containerName createdb -U postgres -T template0 $databaseName
  if($LASTEXITCODE-ne 0){throw 'Disposable database could not be created.'}

  $migrations=@(Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql'|Sort-Object Name)
  $reset=$migrations|Where-Object Name -eq '20260802120000_legacy_person_data_reset.sql'
  $beforeReset=$migrations|Where-Object Name -lt '20260802120000_legacy_person_data_reset.sql'
  $afterReset=$migrations|Where-Object Name -gt '20260802120000_legacy_person_data_reset.sql'
  $bootstrap=@(
    (Resolve-Path 'supabase-schema.sql').Path,
    (Resolve-Path 'scripts/controlled-beta-onboarding/auth-identities-bootstrap.sql').Path,
    (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  )+($beforeReset|ForEach-Object FullName)
  foreach($file in $bootstrap){Invoke-SqlFile $file}
  Invoke-SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  foreach($file in @($reset.FullName)+($afterReset|ForEach-Object FullName)){Invoke-SqlFile $file}

  Invoke-SqlFile (Resolve-Path 'scripts/controlled-beta-onboarding/lifecycle-smoke.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/controlled-beta-onboarding/permission-smoke.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/controlled-beta-onboarding/concurrency-setup.sql').Path
  & powershell -ExecutionPolicy Bypass -File scripts/controlled-beta-onboarding/run-concurrency.ps1 -ContainerName $containerName -DatabaseName $databaseName
  if($LASTEXITCODE-ne 0){throw 'Controlled-beta concurrency smoke failed.'}
  Invoke-SqlFile (Resolve-Path 'scripts/controlled-beta-onboarding/concurrency-verify.sql').Path

  $migrationCount=$migrations.Count
  Write-Output "CONTROLLED_BETA_ONBOARDING_ISOLATED_DB_OK migrations=$migrationCount lifecycle=pass permissions=pass concurrency=pass rollback=container_removed"
}finally{
  if($created){
    $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue'
    docker rm -f $containerName 2>$null|Out-Null
    $ErrorActionPreference=$old
  }
}
