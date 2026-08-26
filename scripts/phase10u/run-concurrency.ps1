param(
  [Parameter(Mandatory = $true)][string]$ContainerName,
  [Parameter(Mandatory = $true)][string]$DatabaseName
)

$ErrorActionPreference = 'Stop'

function Invoke-AsyncSql([string]$sql) {
  Start-Job -ScriptBlock {
    param($name, $database, $query)
    $query | docker exec -i $name psql -U postgres -d $database -v ON_ERROR_STOP=1 -q
    exit $LASTEXITCODE
  } -ArgumentList $ContainerName, $DatabaseName, $sql
}

$token = (docker exec $ContainerName psql -U postgres -d $DatabaseName -tAc 'SELECT match_token FROM phase10u_audit.concurrency_fixture LIMIT 1').Trim()
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Concurrency token fixture is missing.' }
$actor = '00000000-0000-4000-8000-000000000045'
$query = "SELECT created FROM public.create_connection_request('$actor'::uuid,'$token'::uuid,'same_school','concurrency greeting');"
$jobs = @(Invoke-AsyncSql $query, Invoke-AsyncSql $query)
$jobs | Wait-Job | Out-Null
$outputs = @($jobs | Receive-Job -ErrorAction SilentlyContinue)
$jobs | Remove-Job -Force

$created = (docker exec $ContainerName psql -U postgres -d $DatabaseName -tAc "SELECT count(*) FROM public.connection_requests WHERE sender_user_id='$actor'::uuid AND receiver_user_id='00000000-0000-4000-8000-000000000046'::uuid").Trim()
$used = (docker exec $ContainerName psql -U postgres -d $DatabaseName -tAc "SELECT count(*) FROM public.connection_match_tokens WHERE requester_user_id='$actor'::uuid AND used_at IS NOT NULL").Trim()
if ($LASTEXITCODE -ne 0 -or $created -ne '1' -or $used -ne '1') {
  throw "Concurrency single-winner contract failed: requests=$created used_tokens=$used outputs=$($outputs -join ',')"
}
Write-Output 'PHASE10U_MATCH_TOKEN_CONCURRENCY_OK requests=1 used_tokens=1'
