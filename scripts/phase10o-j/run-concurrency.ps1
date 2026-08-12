param([Parameter(Mandatory=$true)][string]$ContainerName)
$ErrorActionPreference='Stop'
function Start-Sql([string]$Sql) { Start-Job -ScriptBlock { param($container,$query); $output=& docker exec $container psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -tAc $query 2>&1; [pscustomobject]@{ExitCode=$LASTEXITCODE;Output=($output -join "`n")} } -ArgumentList $ContainerName,$Sql }
$query="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT outcome FROM public.consume_broker_authorization_code(decode(repeat('32',32),'hex'),'race-client','https://auth.invalid/race',repeat('C',43));"
$jobs=@((Start-Sql $query),(Start-Sql $query)); Wait-Job $jobs|Out-Null; $items=@($jobs|ForEach-Object{Receive-Job $_}); $jobs|Remove-Job -Force
$all=($items|ForEach-Object{[string]$_.Output}) -join "`n"
if($all -match 'unique_violation|23505|duplicate key|deadlock|40P01'){throw "PHASE10O_J_RAW_DB_ERROR $all"}
$success=@($items|Where-Object{$_.ExitCode -eq 0 -and $_.Output -match 'AUTHORIZATION_CODE_CONSUMED'}).Count
$safe=@($items|Where-Object{$_.ExitCode -eq 0 -and $_.Output -match 'REPLAY_REJECTED'}).Count
if($success-ne 1 -or $safe-ne 1){throw "PHASE10O_J_CONCURRENCY_FAILED $all"}
$state=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT state FROM private.broker_authorization_codes WHERE id='a1000000-0000-4000-8000-000000000099'").Trim()
if($state-ne'consumed'){throw "PHASE10O_J_CONCURRENCY_FINAL_STATE=$state"}
Write-Output 'PHASE10O_J_CONCURRENCY_OK success=1 safe_loser=1 deadlocks=0 raw_unique_violations=0 duplicates=0'
