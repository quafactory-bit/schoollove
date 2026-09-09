param([Parameter(Mandatory=$true)][string]$SchemaDump)
$ErrorActionPreference='Stop'
$dump=(Resolve-Path -LiteralPath $SchemaDump).Path
$container='schoollove-growth-baseline-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$created=$false
function Check([string]$label){if($LASTEXITCODE-ne 0){throw $label}}
function Run([string]$file,[string]$name){
  docker cp $file "${container}:/tmp/$name"|Out-Null;Check 'copy'
  docker exec $container psql -U supabase_admin -d growth -v ON_ERROR_STOP=1 -q -f "/tmp/$name";Check $name
}
try {
  docker run -d --name $container -e POSTGRES_PASSWORD=disposable_growth_only public.ecr.aws/supabase/postgres:17.6.1.143|Out-Null;Check 'container';$created=$true
  $ready=0
  for($i=0;$i-lt 30;$i++){docker exec $container pg_isready -U supabase_admin 2>$null|Out-Null;if($LASTEXITCODE-eq 0){$ready++}else{$ready=0};if($ready-ge 5){break};Start-Sleep -Seconds 1}
  if($ready-lt 5){throw 'not ready'}
  docker exec $container createdb -U supabase_admin growth;Check 'database'
  Run (Resolve-Path scripts/class-history-self-service/extensions.sql).Path 'extensions.sql'
  Run $dump 'schema45.sql'
  Run (Join-Path $PSScriptRoot 'baseline-seed.sql') 'baseline.sql'
  Run (Resolve-Path supabase/migrations/20260909013012_school_growth_game_loop.sql).Path 'migration46.sql'
  Run (Join-Path $PSScriptRoot 'baseline-assert.sql') 'assert.sql'
  Write-Output 'DEPLOYED_45_TO_46_WITH_EXISTING_MEMBERSHIP_PASS'
} finally {if($created){docker rm -f -v $container|Out-Null}}
