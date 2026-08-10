param([Parameter(Mandatory=$true)][string]$ContainerName)
$ErrorActionPreference='Stop'
function Invoke-Db([string]$Sql){$Sql|docker exec -i $ContainerName psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw 'Concurrency setup SQL failed.'}}
function Invoke-AsyncSql([string]$Sql){Start-Job -ScriptBlock {param($name,$query) $query|docker exec -i $name psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -q; exit $LASTEXITCODE} -ArgumentList $ContainerName,$Sql}
Get-Content -LiteralPath 'scripts/phase10o-f/concurrency-setup.sql' -Raw -Encoding UTF8 | docker exec -i $ContainerName psql -U postgres -d phase10of -v ON_ERROR_STOP=1 -q
if($LASTEXITCODE-ne 0){throw 'Concurrency fixture setup failed.'}

$subject="slb:v1:k01:google:hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh"
$create="SELECT public.create_provisional_social_account('google','$subject',decode(repeat('5',64),'hex'),1);"
$jobs=@(Invoke-AsyncSql $create,Invoke-AsyncSql $create);$jobs|Wait-Job|Out-Null;$jobs|Receive-Job -ErrorAction SilentlyContinue|Out-Null;$jobs|Remove-Job -Force
$count=docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.private_accounts WHERE primary_broker_subject='$subject'"
if($LASTEXITCODE-ne 0-or$count.Trim()-ne'1'){throw "Broker subject race did not resolve to one account: $($count.Trim())"}

$pendingAccount=docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT id FROM private.private_accounts WHERE primary_provider='kakao'"
$pendingCreate="SELECT public.create_recovery_email_verification('$($pendingAccount.Trim())'::uuid,'activation',decode(repeat('c',64),'hex'),1,decode(repeat('6',96),'hex'),decode(repeat('2',24),'hex'),1,decode(repeat('3',64),'hex'),1);"
$jobs=@(Invoke-AsyncSql $pendingCreate,Invoke-AsyncSql $pendingCreate);$jobs|Wait-Job|Out-Null;$jobs|Receive-Job -ErrorAction SilentlyContinue|Out-Null;$jobs|Remove-Job -Force
$pending=docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.recovery_email_verifications WHERE account_id='$($pendingAccount.Trim())'::uuid AND purpose='activation' AND status='pending'"
if($LASTEXITCODE-ne 0-or$pending.Trim()-ne'1'){throw "Pending challenge supersede race did not resolve to one pending row: $($pending.Trim())"}
Invoke-Db "SELECT public.create_recovery_email_verification('$($pendingAccount.Trim())'::uuid,'activation',decode(repeat('a',64),'hex'),1,decode(repeat('7',96),'hex'),decode(repeat('2',24),'hex'),1,decode(repeat('3',64),'hex'),1);"

$challengeA=docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT v.id FROM private.recovery_email_verifications v JOIN private.private_accounts a ON a.id=v.account_id WHERE a.primary_provider='kakao' AND v.status='pending'"
$challengeB=docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT v.id FROM private.recovery_email_verifications v JOIN private.private_accounts a ON a.id=v.account_id WHERE a.primary_provider='naver' AND v.status='pending'"
$consumeA="SELECT public.consume_recovery_email_verification('$($challengeA.Trim())'::uuid,decode(repeat('3',64),'hex'));"
$consumeB="SELECT public.consume_recovery_email_verification('$($challengeB.Trim())'::uuid,decode(repeat('3',64),'hex'));"
$jobs=@(Invoke-AsyncSql $consumeA,Invoke-AsyncSql $consumeB);$jobs|Wait-Job|Out-Null;$jobs|Receive-Job -ErrorAction SilentlyContinue|Out-Null;$jobs|Remove-Job -Force
$verified=docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.private_accounts WHERE recovery_email_hmac=decode(repeat('a',64),'hex') AND recovery_email_verified_at IS NOT NULL"
if($LASTEXITCODE-ne 0-or$verified.Trim()-ne'1'){throw "Recovery HMAC race did not resolve to one verified account: $($verified.Trim())"}

$challengeC=docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT v.id FROM private.recovery_email_verifications v JOIN private.private_accounts a ON a.id=v.account_id WHERE a.primary_provider='google'"
$consumeC="SELECT public.consume_recovery_email_verification('$($challengeC.Trim())'::uuid,decode(repeat('3',64),'hex'));"
$jobs=@(Invoke-AsyncSql $consumeC,Invoke-AsyncSql $consumeC);$jobs|Wait-Job|Out-Null;$jobs|Receive-Job -ErrorAction SilentlyContinue|Out-Null;$jobs|Remove-Job -Force
$consumed=docker exec $ContainerName psql -U postgres -d phase10of -tAc "SELECT count(*) FROM private.recovery_email_verifications WHERE id='$($challengeC.Trim())'::uuid AND status='consumed' AND failed_attempts=0"
if($LASTEXITCODE-ne 0-or$consumed.Trim()-ne'1'){throw "Challenge consume race did not remain single-use: $($consumed.Trim())"}
Write-Output 'PHASE10O_F_CONCURRENCY_OK broker=1 pending=1 recovery_hmac=1 consume=1'
