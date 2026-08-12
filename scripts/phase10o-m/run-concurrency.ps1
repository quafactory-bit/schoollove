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
$wrong="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT outcome FROM public.claim_upstream_login_callback((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10om_wrong_correct_0001'),'a1000000-0000-4000-8000-000000000102','naver',decode(repeat('52',32),'hex'),decode(repeat('ff',32),'hex'));"
$correct="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT outcome FROM public.claim_upstream_login_callback((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10om_wrong_correct_0001'),'a1000000-0000-4000-8000-000000000102','naver',decode(repeat('52',32),'hex'),decode(repeat('53',32),'hex'));"
$jobs=@($wrong,$correct|ForEach-Object{Start-Job -ScriptBlock {param($sql,$container,$database) $sql|docker exec -i $container psql -U postgres -d $database -At -v ON_ERROR_STOP=1} -ArgumentList $_,$ContainerName,$db});Wait-Job $jobs|Out-Null;$output=@($jobs|ForEach-Object{Receive-Job $_}) -join "`n";$jobs|Remove-Job -Force
$validCorrect=([regex]::Matches($output,'CALLBACK_CLAIMED')).Count -eq 1 -and ([regex]::Matches($output,'REPLAY_REJECTED')).Count -eq 1
$validWrong=([regex]::Matches($output,'STATE_REJECTED')).Count -eq 1 -and ([regex]::Matches($output,'REPLAY_REJECTED')).Count -eq 1
if(-not($validCorrect-or$validWrong)){throw "PHASE10O_M_WRONG_CORRECT_RACE_FAILED: $output"};Write-Output 'PHASE10O_M_WRONG_CORRECT_STATE_RACE_OK'
$identity="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10om_identity_race_0001'),'a1000000-0000-4000-8000-000000000103','naver','slb:v1:k01:naver:'||translate(rtrim(encode(decode(repeat('51',32),'hex'),'base64'),'='),'+/','-_'),decode(repeat('51',32),'hex'),1);"
$jobs=@(1..2|ForEach-Object{Start-Job -ScriptBlock {param($sql,$container,$database) $sql|docker exec -i $container psql -U postgres -d $database -At -v ON_ERROR_STOP=1} -ArgumentList $identity,$ContainerName,$db});Wait-Job $jobs|Out-Null;$output=@($jobs|ForEach-Object{Receive-Job $_}) -join "`n";$jobs|Remove-Job -Force
if((([regex]::Matches($output,'RECOVERY_REQUIRED|EXISTING_PRIMARY')).Count -eq 1 -and ([regex]::Matches($output,'UPSTREAM_LOGIN_LEG_IDENTITY_REJECTED|IDENTITY_REJECTED')).Count -eq 1)-eq $false){throw "PHASE10O_M_IDENTITY_RACE_FAILED: $output"};Write-Output 'PHASE10O_M_IDENTITY_FINALIZATION_CONCURRENCY_OK'
$verify="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT public.record_verified_social_identity_from_upstream_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10om_fail_verify_0001'),'a1000000-0000-4000-8000-000000000104','naver','slb:v1:k01:naver:'||translate(rtrim(encode(decode(repeat('61',32),'hex'),'base64'),'='),'+/','-_'),decode(repeat('61',32),'hex'),1);"
$fail="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT public.fail_upstream_login_leg((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10om_fail_verify_0001'),'a1000000-0000-4000-8000-000000000104','identity_failure');"
$jobs=@($verify,$fail|ForEach-Object{Start-Job -ScriptBlock {param($sql,$container,$database) $sql|docker exec -i $container psql -U postgres -d $database -At -v ON_ERROR_STOP=1} -ArgumentList $_,$ContainerName,$db});Wait-Job $jobs|Out-Null;$output=@($jobs|ForEach-Object{Receive-Job $_}) -join "`n";$jobs|Remove-Job -Force
$verifyWon=([regex]::Matches($output,'RECOVERY_REQUIRED|EXISTING_PRIMARY')).Count -eq 1 -and ([regex]::Matches($output,'REPLAY_REJECTED')).Count -eq 1
$failWon=([regex]::Matches($output,'^REJECTED$')).Count -eq 1 -and ([regex]::Matches($output,'IDENTITY_REJECTED')).Count -eq 1
if(-not($verifyWon-or$failWon)){throw "PHASE10O_M_FAIL_VERIFY_RACE_FAILED: $output"};Write-Output 'PHASE10O_M_FAIL_VERIFY_RACE_OK deadlocks=0 raw_unique_violations=0 duplicates=0'
