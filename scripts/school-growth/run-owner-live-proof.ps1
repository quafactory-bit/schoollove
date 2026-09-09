param([Parameter(Mandatory=$true)][string]$SchemaDump)
$ErrorActionPreference='Stop'
$dump=(Resolve-Path -LiteralPath $SchemaDump).Path
$container='schoollove-owner-live-'+[guid]::NewGuid().ToString('N').Substring(0,10)
$created=$false
function Check([string]$label){if($LASTEXITCODE-ne 0){throw $label}}
function Run([string]$file,[string]$name){
  docker cp $file "${container}:/tmp/$name"|Out-Null;Check 'copy'
  docker exec $container psql -U supabase_admin -d growth -v ON_ERROR_STOP=1 -q -f "/tmp/$name";Check $name
}
try {
  docker run -d --name $container -e POSTGRES_PASSWORD=disposable_owner_only public.ecr.aws/supabase/postgres:17.6.1.143|Out-Null;Check 'container';$created=$true
  $ready=0
  for($i=0;$i-lt 30;$i++){docker exec $container pg_isready -U supabase_admin 2>$null|Out-Null;if($LASTEXITCODE-eq 0){$ready++}else{$ready=0};if($ready-ge 5){break};Start-Sleep -Seconds 1}
  if($ready-lt 5){throw 'not ready'}
  docker exec $container createdb -U supabase_admin growth;Check 'database'
  Run (Resolve-Path scripts/class-history-self-service/extensions.sql).Path 'extensions.sql'
  Run $dump 'schema46.sql'
  $before=@(docker exec $container psql -U supabase_admin -d growth -At -c "select n.nspname||'.'||p.oid::regprocedure::text||':'||md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' order by 1;");Check 'fingerprint'
  $tablesBefore=docker exec $container psql -U supabase_admin -d growth -At -c "select count(*) from information_schema.tables where table_schema in ('public','private');"
  $columnsBefore=docker exec $container psql -U supabase_admin -d growth -At -c "select count(*) from information_schema.columns where table_schema in ('public','private');"
  Run (Resolve-Path supabase/migrations/20260909041329_owner_live_school_growth_projection.sql).Path 'migration47.sql'
  $after=@(docker exec $container psql -U supabase_admin -d growth -At -c "select n.nspname||'.'||p.oid::regprocedure::text||':'||md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' order by 1;");Check 'fingerprint'
  $delta=@(Compare-Object $before $after)
  if($delta.Count-ne 1 -or $delta[0].SideIndicator-ne '=>' -or $delta[0].InputObject-notmatch 'get_own_school_growth_live'){throw 'unexpected function drift'}
  $tablesAfter=docker exec $container psql -U supabase_admin -d growth -At -c "select count(*) from information_schema.tables where table_schema in ('public','private');"
  $columnsAfter=docker exec $container psql -U supabase_admin -d growth -At -c "select count(*) from information_schema.columns where table_schema in ('public','private');"
  if($tablesBefore-ne $tablesAfter -or $columnsBefore-ne $columnsAfter){throw 'table/column drift'}
  Write-Output "SCHEMA_DELTA tables=0 columns=0 functions=1; legacy definitions unchanged; before tables=$tablesBefore columns=$columnsBefore functions=$($before.Count)"
  Run (Join-Path $PSScriptRoot 'owner-live-matrix.sql') 'owner-matrix.sql'
  Run (Join-Path $PSScriptRoot 'disposable-matrix.sql') 'growth-regression.sql'
  Write-Output 'DEPLOYED_SCHEMA_46_TO_47_UPGRADE_PASS'
} finally {if($created){docker rm -f -v $container|Out-Null}}
