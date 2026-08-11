param([Parameter(Mandatory=$true)][string]$ContainerName)
$ErrorActionPreference='Stop'

function Get-CoherentBrokerSubject([string]$Provider,[string]$DigestHex) {
  if($DigestHex.Length -ne 64 -or $DigestHex -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'PHASE10O_G_FIXTURE_DIGEST_INVALID'
  }
  [byte[]]$bytes = [byte[]]::new(32)
  for($i=0; $i -lt 32; $i++) {
    $bytes[$i] = [Convert]::ToByte($DigestHex.Substring($i * 2,2),16)
  }
  $suffix=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  if($suffix.Length -ne 43) { throw 'PHASE10O_G_FIXTURE_SUFFIX_LENGTH_INVALID' }
  return "slb:v1:k01:$Provider`:$suffix"
}

$raceBDigestHex=('f1' * 32) -join ''
$raceBSubject=Get-CoherentBrokerSubject 'kakao' $raceBDigestHex
$activeDigestHex=('74' * 32) -join ''
$activeSubject=Get-CoherentBrokerSubject 'kakao' $activeDigestHex

function Start-RaceSql([string]$Sql) {
  Start-Job -ScriptBlock {
    param($container,$query)
    $ErrorActionPreference='Continue'
    $output = & docker exec $container psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -tAc $query 2>&1
    [pscustomobject]@{ ExitCode=$LASTEXITCODE; Output=($output -join "`n") }
  } -ArgumentList $ContainerName,$Sql
}
function Receive-Race([array]$Jobs) {
  Wait-Job -Job $Jobs | Out-Null
  $items=@($Jobs | ForEach-Object { Receive-Job -Job $_ })
  Remove-Job -Job $Jobs -Force
  return $items
}
function Classify-Race([object]$Item) {
  $text=[string]$Item.Output
  if($text -match 'unique_violation|SQLSTATE 23505|duplicate key'){ return 'UNIQUE_VIOLATION' }
  if($text -match 'deadlock detected|SQLSTATE 40P01'){ return 'DEADLOCK' }
  if($Item.ExitCode -eq 0 -and $text -match 'ACCOUNT_DECIDED|RECOVERY_REQUIRED'){ return 'SUCCESS' }
  if($text -match 'SOCIAL_ATTEMPT_DECISION_REJECTED|ACCOUNT_DECISION_IN_PROGRESS|IDENTITY_DECISION_IN_PROGRESS|USE_PRIMARY_PROVIDER|EXISTING_PRIMARY'){ return 'SAFE_TERMINAL' }
  return 'UNEXPECTED_ERROR'
}
function Assert-Race([string]$Name,[array]$Items,[int]$Successes,[int]$Safe) {
  $classes=@($Items | ForEach-Object { Classify-Race $_ })
  $bad=@($classes | Where-Object { $_ -in @('UNIQUE_VIOLATION','DEADLOCK','UNEXPECTED_ERROR') })
  if((@($classes | Where-Object { $_ -eq 'SUCCESS' }).Count -ne $Successes) -or (@($classes | Where-Object { $_ -eq 'SAFE_TERMINAL' }).Count -ne $Safe) -or $bad.Count -ne 0) {
    $detail=($Items | ForEach-Object { "exit=$($_.ExitCode) class=$(Classify-Race $_) output=$($_.Output)" }) -join ' | '
    throw "PHASE10O_G_${Name}_CONCURRENCY_FAILED $detail"
  }
}
function Consume-Sql([string]$SafeAttempt,[string]$OtpByte) {
  "SELECT set_config('request.jwt.claim.role','service_role',false); SELECT outcome FROM public.consume_recovery_and_decide_social_account((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='$SafeAttempt'),(SELECT v.id FROM private.recovery_email_verifications v JOIN private.oauth_login_attempts a ON a.id=v.login_attempt_id WHERE a.safe_attempt_id='$SafeAttempt' AND v.status='pending'),decode(repeat('$OtpByte',32),'hex'));"
}

$raceA=Receive-Race @( (Start-RaceSql (Consume-Sql 'att_racea11111111111' 'a2')), (Start-RaceSql (Consume-Sql 'att_racea22222222222' 'a3')) )
Assert-Race 'RACE_A' $raceA 1 1
$aAccounts=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.private_accounts WHERE recovery_email_hmac=decode(repeat('a1',32),'hex')").Trim()
if($aAccounts -ne '1'){throw "PHASE10O_G_RACE_A_ACCOUNT_COUNT=$aAccounts"}

$raceC=Receive-Race @( (Start-RaceSql (Consume-Sql 'att_racec11111111111' 'c2')), (Start-RaceSql (Consume-Sql 'att_racec11111111111' 'c2')) )
Assert-Race 'RACE_C' $raceC 1 1
$cAccounts=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.private_accounts WHERE recovery_email_hmac=decode(repeat('c1',32),'hex')").Trim()
if($cAccounts -ne '1'){throw "PHASE10O_G_RACE_C_ACCOUNT_COUNT=$cAccounts"}

$raceD=Receive-Race @( (Start-RaceSql (Consume-Sql 'att_raced11111111111' 'd2')), (Start-RaceSql (Consume-Sql 'att_raced22222222222' 'd3')) )
Assert-Race 'RACE_D' $raceD 1 1
$dAccounts=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.private_accounts WHERE recovery_email_hmac=decode(repeat('d1',32),'hex')").Trim()
if($dAccounts -ne '1'){throw "PHASE10O_G_RACE_D_ACCOUNT_COUNT=$dAccounts"}

# Race B claims the subject before recovery.  The loser never receives the tuple,
# a recovery challenge, an account, or an Auth binding.
$raceBsql = "SELECT set_config('request.jwt.claim.role','service_role',false); WITH attempt AS MATERIALIZED (SELECT public.create_social_login_attempt('att_racebXPLACEHOLDER','kakao',clock_timestamp()+interval '5 minutes') AS id) SELECT public.record_verified_social_identity(attempt.id,'kakao','$raceBSubject',decode('$raceBDigestHex','hex'),1) FROM attempt;"
$raceB=Receive-Race @( (Start-RaceSql ($raceBsql.Replace('XPLACEHOLDER','111111111111'))), (Start-RaceSql ($raceBsql.Replace('XPLACEHOLDER','222222222222'))) )
Assert-Race 'RACE_B' $raceB 1 1
$bWinner=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT id FROM private.oauth_login_attempts WHERE broker_subject='$raceBSubject' AND state='recovery_required'").Trim()
if([string]::IsNullOrWhiteSpace($bWinner)){throw 'PHASE10O_G_RACE_B_WINNER_MISSING'}
$bLoser=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.oauth_login_attempts a LEFT JOIN private.recovery_email_verifications v ON v.login_attempt_id=a.id WHERE a.safe_attempt_id LIKE 'att_raceb%' AND a.state='failed_safe' AND a.broker_subject IS NULL GROUP BY a.id HAVING count(v.id)=0").Trim()
if($bLoser -ne '1'){throw "PHASE10O_G_RACE_B_LOSER_BOUNDARY=$bLoser"}
$bFinish="SELECT set_config('request.jwt.claim.role','service_role',false); WITH challenge AS MATERIALIZED (SELECT public.create_login_attempt_recovery_verification('$bWinner'::uuid,decode(repeat('e1',32),'hex'),1,decode(repeat('ab',17),'hex'),decode(repeat('cd',12),'hex'),1,decode(repeat('e2',32),'hex'),1) AS id) SELECT outcome FROM challenge CROSS JOIN LATERAL public.consume_recovery_and_decide_social_account('$bWinner'::uuid,challenge.id,decode(repeat('e2',32),'hex'));"
$bFinishResult=& docker exec $ContainerName psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -tAc $bFinish
if($LASTEXITCODE-ne 0 -or ($bFinishResult -join ' ') -notmatch 'ACCOUNT_DECIDED'){throw 'PHASE10O_G_RACE_B_WINNER_DECISION'}
$bRegistry=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.social_identity_registry WHERE broker_subject='$raceBSubject'").Trim()
if($bRegistry -ne '1'){throw "PHASE10O_G_RACE_B_REGISTRY_COUNT=$bRegistry"}
$bLive=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.oauth_login_attempts WHERE broker_subject='$raceBSubject' AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')").Trim()
if($bLive -ne '0'){throw "PHASE10O_G_RACE_B_LIVE_CLAIM_COUNT=$bLive"}

# Two simultaneous attempts for an already active primary identity are both
# existing-primary resolutions, not new claims and not unique-index failures.
$activeSeed="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT public.create_social_login_attempt('att_racebactive11111','kakao',clock_timestamp()+interval '5 minutes'); SELECT public.create_social_login_attempt('att_racebactive22222','kakao',clock_timestamp()+interval '5 minutes');"
& docker exec $ContainerName psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -tAc $activeSeed | Out-Null
if($LASTEXITCODE-ne 0){throw 'PHASE10O_G_RACE_B_ACTIVE_SEED'}
$activeSql="SELECT set_config('request.jwt.claim.role','service_role',false); SELECT public.record_verified_social_identity((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_racebactiveXPLACEHOLDER'),'kakao','$activeSubject',decode('$activeDigestHex','hex'),1);"
$activeRace=Receive-Race @( (Start-RaceSql ($activeSql.Replace('XPLACEHOLDER','11111'))), (Start-RaceSql ($activeSql.Replace('XPLACEHOLDER','22222'))) )
Assert-Race 'RACE_B_ACTIVE' $activeRace 0 2

Write-Output 'PHASE10O_G_CONCURRENCY_OK'
Write-Output 'race_a_accounts=1 race_a_new_winners=1 race_a_duplicates=0'
Write-Output 'race_b_subject_claim_success=1 race_b_safe_losers=1 race_b_registry_rows=1 race_b_duplicates=0 race_b_raw_unique_violations=0'
Write-Output 'race_c_successes=1 race_c_safe_losers=1 race_c_duplicates=0'
Write-Output 'race_d_accounts=1 race_d_new_winners=1 race_d_duplicates=0'
Write-Output 'deadlocks=0 raw_unique_violations=0'
