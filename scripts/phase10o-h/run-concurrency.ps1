param([Parameter(Mandatory=$true)][string]$ContainerName)
$ErrorActionPreference='Stop'
function Start-Sql([string]$Sql) {
  Start-Job -ScriptBlock { param($container,$query); $ErrorActionPreference='Continue'; $o=& docker exec $container psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -tAc $query 2>&1; [pscustomobject]@{Code=$LASTEXITCODE;Text=($o -join "`n")} } -ArgumentList $ContainerName,$Sql
}
function Receive-Sql([array]$Jobs){Wait-Job $Jobs|Out-Null;$x=@($Jobs|ForEach-Object{Receive-Job $_});Remove-Job $Jobs -Force;return $x}
function Assert-NoRaw([array]$Items,[string]$Name){if(@($Items|Where-Object{$_.Text -match 'unique_violation|23505|duplicate key|deadlock|40P01'}).Count){throw "PHASE10O_H_${Name}_RAW_DB_ERROR"}}
function Service([string]$Sql){"SELECT set_config('request.jwt.claim.role','service_role',false); $Sql"}
function CreateChallenge([string]$Safe,[string]$Challenge,[string]$Reserved,[string]$Hmac,[string]$Otp){
  Service "SELECT public.create_login_attempt_recovery_verification((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='$Safe'),'$Challenge','$Reserved',decode(repeat('$Hmac',32),'hex'),1,decode(repeat('cc',17),'hex'),decode(repeat('cd',12),'hex'),1,decode(repeat('$Otp',32),'hex'),1)"
}
$sharedReserved='a9000000-0000-4000-8000-000000000001'
$reserveRace=Receive-Sql @(
  (Start-Sql (CreateChallenge 'att_10ohreserveone0001' 'a1000000-0000-4000-8000-000000000001' $sharedReserved 'c1' 'c2')),
  (Start-Sql (CreateChallenge 'att_10ohreservetwo0001' 'a2000000-0000-4000-8000-000000000001' $sharedReserved 'c3' 'c4'))
)
Assert-NoRaw $reserveRace 'RESERVATION'
if(@($reserveRace|Where-Object{$_.Code -eq 0}).Count -ne 1 -or @($reserveRace|Where-Object{$_.Text -match 'SOCIAL_ATTEMPT_RECOVERY_ID_RESERVATION_REJECTED'}).Count -ne 1){throw 'PHASE10O_H_RESERVATION_RACE'}
$sameChallenge='a3000000-0000-4000-8000-000000000001'
$challengeRace=Receive-Sql @(
  (Start-Sql (CreateChallenge 'att_10ohsamechallenge01' $sameChallenge 'a4000000-0000-4000-8000-000000000001' 'c5' 'c6')),
  (Start-Sql (CreateChallenge 'att_10ohsamechallenge01' $sameChallenge 'a4000000-0000-4000-8000-000000000001' 'c5' 'c6'))
)
Assert-NoRaw $challengeRace 'CHALLENGE'
if(@($challengeRace|Where-Object{$_.Code -eq 0}).Count -ne 1 -or @($challengeRace|Where-Object{$_.Text -match 'SOCIAL_ATTEMPT_RECOVERY_ID_RESERVATION_REJECTED'}).Count -ne 1){throw 'PHASE10O_H_CHALLENGE_RACE'}
$winnerReserved='a5000000-0000-4000-8000-000000000001';$loserReserved='a6000000-0000-4000-8000-000000000001'
& docker exec $ContainerName psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -tAc (CreateChallenge 'att_10ohhmacwinner0001' 'a7000000-0000-4000-8000-000000000001' $winnerReserved 'd1' 'd2') | Out-Null
& docker exec $ContainerName psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -tAc (CreateChallenge 'att_10ohhmacloser00001' 'a8000000-0000-4000-8000-000000000001' $loserReserved 'd1' 'd3') | Out-Null
$consume = { param($safe,$challenge,$otp) Service "SELECT outcome FROM public.consume_recovery_and_decide_social_account((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='$safe'),'$challenge',decode(repeat('$otp',32),'hex'))" }
$hmacRace=Receive-Sql @((Start-Sql (& $consume 'att_10ohhmacwinner0001' 'a7000000-0000-4000-8000-000000000001' 'd2')),(Start-Sql (& $consume 'att_10ohhmacloser00001' 'a8000000-0000-4000-8000-000000000001' 'd3')))
Assert-NoRaw $hmacRace 'HMAC'
if(@($hmacRace|Where-Object{$_.Text -match 'ACCOUNT_DECIDED'}).Count -ne 1 -or @($hmacRace|Where-Object{$_.Text -match 'ACCOUNT_DECISION_IN_PROGRESS'}).Count -ne 1){throw 'PHASE10O_H_HMAC_RACE'}
$accounts=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.private_accounts WHERE recovery_email_hmac=decode(repeat('d1',32),'hex')").Trim()
$winner=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT id FROM private.private_accounts WHERE recovery_email_hmac=decode(repeat('d1',32),'hex')").Trim()
if($accounts -ne '1' -or $winner -notin @($winnerReserved,$loserReserved)){throw 'PHASE10O_H_HMAC_ACCOUNT_BOUNDARY'}
Write-Output 'PHASE10O_H_CONCURRENCY_OK reservation_winners=1 challenge_winners=1 recovery_hmac_accounts=1 deadlocks=0 raw_unique_violations=0'
