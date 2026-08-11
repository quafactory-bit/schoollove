param([Parameter(Mandatory=$true)][string]$ContainerName)
$ErrorActionPreference='Stop'

function Start-Sql([string]$Sql) {
  Start-Job -ScriptBlock {
    param($container,$query)
    $ErrorActionPreference='Continue'
    $output=& docker exec $container psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -tAc $query 2>&1
    [pscustomobject]@{ExitCode=$LASTEXITCODE;Output=($output -join "`n")}
  } -ArgumentList $ContainerName,$Sql
}
function Receive-Sql([array]$Jobs) {
  Wait-Job $Jobs|Out-Null
  $items=@($Jobs|ForEach-Object{Receive-Job $_})
  Remove-Job $Jobs -Force
  return $items
}
function Assert-Race([string]$Name,[array]$Items,[int]$Reserved,[int]$Limited) {
  $all=($Items|ForEach-Object{[string]$_.Output}) -join "`n"
  if($all -match 'unique_violation|23505|duplicate key|deadlock|40P01'){throw "PHASE10O_I_${Name}_RAW_DB_ERROR $all"}
  $reserved=@($Items|Where-Object{$_.ExitCode -eq 0 -and $_.Output -match 'RECOVERY_DELIVERY_RESERVED'}).Count
  $limited=@($Items|Where-Object{$_.ExitCode -eq 0 -and $_.Output -match 'RECOVERY_DELIVERY_LIMITED'}).Count
  if($reserved-ne$Reserved -or $limited-ne$Limited){throw "PHASE10O_I_${Name}_RACE_FAILED $all"}
}
function Reserve-Sql([string]$Safe,[string]$Verification,[string]$Account,[string]$Hmac,[string]$Cipher,[string]$Nonce,[string]$Otp) {
  "SELECT set_config('request.jwt.claim.role','service_role',false); SELECT outcome FROM public.create_and_reserve_login_attempt_recovery_delivery((SELECT id FROM private.oauth_login_attempts WHERE safe_attempt_id='$Safe'),'$Verification','$Account',decode(repeat('$Hmac',32),'hex'),1,decode(repeat('$Cipher',17),'hex'),decode(repeat('$Nonce',12),'hex'),1,decode(repeat('$Otp',32),'hex'),1);"
}

# Independent connections compete to reserve the same attempt.  The locked
# cooldown means one durable row and one safe limited result, never a raw index error.
$sameAttempt=Receive-Sql @(
  (Start-Sql (Reserve-Sql 'att_10oi_race_attempt_01' '91000000-0000-4000-8000-000000000001' '92000000-0000-4000-8000-000000000001' 'a1' 'a2' 'a3' 'a4')),
  (Start-Sql (Reserve-Sql 'att_10oi_race_attempt_01' '91000000-0000-4000-8000-000000000002' '92000000-0000-4000-8000-000000000002' 'a1' 'a5' 'a6' 'a7'))
)
Assert-Race 'SAME_ATTEMPT' $sameAttempt 1 1
$attemptRows=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.recovery_delivery_attempts d JOIN private.oauth_login_attempts a ON a.id=d.login_attempt_id WHERE a.safe_attempt_id='att_10oi_race_attempt_01'").Trim()
if($attemptRows-ne'1'){throw "PHASE10O_I_SAME_ATTEMPT_LEDGER_COUNT=$attemptRows"}

# The address lock serializes otherwise independent attempts at the fifth slot.
$addressCap=Receive-Sql @(
  (Start-Sql (Reserve-Sql 'att_10oi_race_email_05' '95000000-0000-4000-8000-000000000005' '96000000-0000-4000-8000-000000000005' '92' 'a8' 'a9' 'aa')),
  (Start-Sql (Reserve-Sql 'att_10oi_race_email_06' '95000000-0000-4000-8000-000000000006' '96000000-0000-4000-8000-000000000006' '92' 'ab' 'ac' 'ad'))
)
Assert-Race 'ADDRESS_CAP' $addressCap 1 1
$addressRows=(& docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.recovery_delivery_attempts WHERE recovery_email_hmac=decode(repeat('92',32),'hex') AND hmac_key_version=1").Trim()
if($addressRows-ne'5'){throw "PHASE10O_I_ADDRESS_CAP_LEDGER_COUNT=$addressRows"}

Write-Output 'PHASE10O_I_CONCURRENCY_OK same_attempt_reserved=1 same_attempt_limited=1 address_cap_reserved=1 address_cap_limited=1 deadlocks=0 raw_unique_violations=0'
