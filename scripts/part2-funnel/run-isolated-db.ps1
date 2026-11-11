# Uses an already available image, no ports/network/remote credentials.
$ErrorActionPreference = 'Stop'
$taskContainer = 'schoollove-part2-' + [guid]::NewGuid().ToString('N').Substring(0,10)
$taskImage = 'public.ecr.aws/supabase/postgres:17.11.0.002'
$taskMigration = (Resolve-Path -LiteralPath 'supabase/migrations/20261111021213_part2_daily_funnel.sql').Path
function Invoke-Part2File([string]$file) {
  docker cp $file "${taskContainer}:/tmp/part2-input.sql" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Local fixture copy failed.' }
  docker exec $taskContainer psql -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/part2-input.sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Local SQL validation failed.' }
}
function Part2-Scalar([string]$sql) {
  $value = docker exec $taskContainer psql -h /tmp -U postgres -d postgres -tAc $sql
  if ($LASTEXITCODE -ne 0) { throw 'Local scalar failed.' }
  return ($value -join '').Trim()
}
try {
  docker image inspect $taskImage --format '{{.Id}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The pre-existing local image is unavailable; no image will be installed.' }
  docker run -d --network none --name $taskContainer --user postgres --entrypoint /bin/bash $taskImage -c "initdb -D /tmp/part2-data --auth=trust >/tmp/part2-init.log && exec postgres -D /tmp/part2-data -k /tmp -c listen_addresses=''" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Disposable local container did not start.' }
  $taskReady = $false
  for ($i=0; $i -lt 30; $i++) { docker exec $taskContainer pg_isready -h /tmp -U postgres *> $null; if ($LASTEXITCODE -eq 0) { $taskReady=$true; break }; Start-Sleep -Milliseconds 500 }
  if (-not $taskReady) { throw 'Local PostgreSQL did not become ready.' }
  Invoke-Part2File (Resolve-Path -LiteralPath 'scripts/part2-funnel/fixture.sql').Path
  $taskBefore = Part2-Scalar "SELECT md5(pg_get_functiondef('public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)'::regprocedure))"
  Invoke-Part2File $taskMigration
  Invoke-Part2File (Resolve-Path -LiteralPath 'scripts/part2-funnel/matrix.sql').Path
  if ($taskBefore -ne (Part2-Scalar "SELECT md5(pg_get_functiondef('public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)'::regprocedure))")) { throw 'Existing owner function changed.' }
  # Two independent sessions race on one existing milestone lock.
  $taskPrefix = "SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);"
  docker exec -d $taskContainer psql -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c ($taskPrefix + "SELECT public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000011',2010,'[]',true,'share','external');") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'First concurrency session failed.' }
  docker exec $taskContainer psql -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c ($taskPrefix + "SELECT public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000012',2010,'[]',true,'share','external');") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Second concurrency session failed.' }
  $taskFinished=$false
  for ($i=0; $i -lt 30; $i++) { if ((Part2-Scalar "SELECT count(*) FROM public.fixture_memberships WHERE owner_user_id='00000000-0000-4000-8000-000000000003'") -eq '2') { $taskFinished=$true;break }; Start-Sleep -Milliseconds 200 }
  if (-not $taskFinished -or (Part2-Scalar "SELECT sum(event_count) FROM public.part2_daily_funnel WHERE event_key='signup_completed'") -ne '2') { throw 'Concurrent first school counted more/less than once.' }
  # Original and new callers must acquire the same advisory lock before rows.
  $taskLegacyPrefix = "SET application_name='part2-legacy-race';SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);"
  docker exec -d $taskContainer psql -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c ($taskLegacyPrefix + "BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('00000000-0000-4000-8000-000000000004',0));SELECT pg_sleep(2);SELECT public.add_own_school_membership_with_roster('00000000-0000-4000-8000-000000000011',2010,'[]',true);COMMIT;") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Legacy race session failed.' }
  $taskLegacyLocked=$false
  for ($i=0; $i -lt 30; $i++) { if ((Part2-Scalar "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='part2-legacy-race' AND l.locktype='advisory' AND l.granted") -eq '1') { $taskLegacyLocked=$true;break }; Start-Sleep -Milliseconds 100 }
  if (-not $taskLegacyLocked) { throw 'Legacy lock not observed.' }
  docker exec $taskContainer psql -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c ("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);SELECT public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000012',2010,'[]',true,'share','external');") | Out-Null
  if ($LASTEXITCODE -ne 0 -or (Part2-Scalar "SELECT count(*) FROM public.fixture_memberships WHERE owner_user_id='00000000-0000-4000-8000-000000000004'") -ne '2') { throw 'Mixed-version lock order rejected a save.' }
  if ((Part2-Scalar "SELECT sum(event_count) FROM public.part2_daily_funnel WHERE event_key='signup_completed'") -ne '2') { throw 'Legacy first milestone was recounted.' }
  if ((Part2-Scalar "SELECT jsonb_array_length(public.part2_get_funnel_snapshot())>0") -ne 't') { throw 'Atomic admin snapshot missing.' }
  Write-Output 'PART2_LOCAL_DB_PASS permissions NULL_unique owner_error stats_failure recreation concurrency mixed_version_locks unchanged_owner snapshot'
} finally {
  $ErrorActionPreference = 'Continue'
  docker rm -f $taskContainer 2>&1 | Out-Null
}
