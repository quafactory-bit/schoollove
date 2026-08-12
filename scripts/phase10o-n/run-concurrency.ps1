param([Parameter(Mandatory=$true)][string]$ContainerName)
$ErrorActionPreference='Stop'; $db='phase10on'
$sql="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT outcome FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('71',32),'hex'),decode(repeat('72',32),'hex'));"
$jobs=@(1..2|ForEach-Object{Start-Job -ScriptBlock {param($q,$c,$d) $q|docker exec -i $c psql -U postgres -d $d -At -v ON_ERROR_STOP=1} -ArgumentList $sql,$ContainerName,$db}); Wait-Job $jobs|Out-Null
$out=@($jobs|ForEach-Object{Receive-Job $_}) -join "`n"; $jobs|Remove-Job -Force
if(([regex]::Matches($out,'CALLBACK_CLAIMED')).Count-ne 1-or([regex]::Matches($out,'CORRELATION_REJECTED')).Count-ne 1){throw "PHASE10O_N_CONCURRENCY: $out"}
Write-Output 'PHASE10O_N_PUBLIC_STATE_CLAIM_CONCURRENCY_OK successes=1 safe_loser=1 deadlocks=0 raw_unique_violations=0'
