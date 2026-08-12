param([Parameter(Mandatory=$true)][string]$ContainerName)
$ErrorActionPreference='Stop'
$db='phase10om'
$claim="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT outcome FROM public.claim_upstream_login_callback((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10om_concurrent_claim_0001'),'a1000000-0000-4000-8000-000000000101','google',decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'));"
$jobs=@(1..2|ForEach-Object{Start-Job -ScriptBlock {param($sql,$container,$database) $sql|docker exec -i $container psql -U postgres -d $database -At -v ON_ERROR_STOP=1} -ArgumentList $claim,$ContainerName,$db})
Wait-Job $jobs|Out-Null
$output=@($jobs|ForEach-Object{Receive-Job $_}) -join "`n"
$jobs|Remove-Job -Force
$success=([regex]::Matches($output,'CALLBACK_CLAIMED')).Count
$safe=([regex]::Matches($output,'REPLAY_REJECTED')).Count
if($success-ne 1-or$safe-ne 1){throw "PHASE10O_M_CONCURRENCY_ASSERTION_FAILED: $output"}
Write-Output 'PHASE10O_M_CALLBACK_CLAIM_CONCURRENCY_OK successes=1 safe_loser=1 deadlocks=0 raw_unique_violations=0'
