param([Parameter(Mandatory=$true)][string]$SchemaDump)
$ErrorActionPreference='Stop'
$dump=(Resolve-Path -LiteralPath $SchemaDump).Path
$container='schoollove-class-proof-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$created=$false
function Check-Exit([string]$label) { if($LASTEXITCODE-ne 0){throw $label} }
function Run-File([string]$file,[string]$target) {
  docker cp $file "${container}:/tmp/$target" | Out-Null
  Check-Exit 'Copy failed'
  docker exec $container psql -U supabase_admin -d class_history -v ON_ERROR_STOP=1 -q -f "/tmp/$target"
  Check-Exit "SQL failed: $target"
}
try {
  docker run -d --name $container -e POSTGRES_PASSWORD=disposable_class_history_only public.ecr.aws/supabase/postgres:17.6.1.143 | Out-Null
  Check-Exit 'Container creation failed'
  $created=$true
  $ready=$false
  $consecutive=0
  for($i=0;$i-lt 30;$i++) {
    docker exec $container pg_isready -U supabase_admin 2>$null | Out-Null
    if($LASTEXITCODE-eq 0){$consecutive++}else{$consecutive=0}
    if($consecutive-ge 5){$ready=$true;break}
    Start-Sleep -Seconds 1
  }
  if(-not $ready){throw 'Database not ready'}
  docker exec $container createdb -U supabase_admin class_history
  Check-Exit 'Create database failed'
  Run-File (Join-Path $PSScriptRoot 'extensions.sql') 'extensions.sql'
  Run-File $dump 'schema43.sql'
  Run-File (Join-Path $PSScriptRoot 'fingerprint-before.sql') 'before.sql'
  $migration=(Resolve-Path 'supabase/migrations/20260907031506_class_history_self_service.sql').Path
  Write-Output ('MIGRATION_SHA256='+ (Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash.ToLowerInvariant())
  Run-File $migration 'migration44.sql'
  Run-File (Join-Path $PSScriptRoot 'fingerprint-after.sql') 'after.sql'
  docker cp (Join-Path $PSScriptRoot 'search-regression.sql') "${container}:/tmp/search-regression.sql" | Out-Null
  Check-Exit 'Search matrix copy failed'
  Run-File (Join-Path $PSScriptRoot 'disposable-matrix.sql') 'matrix.sql'
  Write-Output 'DEPLOYED_SCHEMA_43_TO_44_AND_BASIC_MATRIX_PASS'
} finally {
  if($created){ docker rm -f -v $container | Out-Null }
}
