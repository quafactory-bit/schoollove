param([Parameter(Mandatory=$true)][string]$ContainerName,[string]$BaselineDatabase='phase10of_preflight_base')
$ErrorActionPreference='Stop'
$migration=(Get-Content -LiteralPath 'supabase/migrations/20260810160000_social_account_recovery_boundary.sql' -Raw -Encoding UTF8)
function Invoke-Db([string]$Database,[string]$Sql){$Sql|docker exec -i $ContainerName psql -U postgres -d $Database -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw "Fixture SQL failed: $Database"}}
function Invoke-NegativePreflight([string]$Database,[string]$Fixture,[string]$ExpectedCode){
  docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE $Database TEMPLATE `"$BaselineDatabase`""
  if($LASTEXITCODE-ne 0){throw "Could not clone preflight baseline: $Database"}
  Invoke-Db $Database $Fixture
  $previousErrorAction=$ErrorActionPreference;$ErrorActionPreference='Continue'
  $output=@($migration|docker exec -i $ContainerName psql -U postgres -d $Database -v ON_ERROR_STOP=1 -q 2>&1)
  $migrationExitCode=$LASTEXITCODE;$ErrorActionPreference=$previousErrorAction
  if($migrationExitCode-eq 0){throw "Preflight unexpectedly succeeded: $Database"}
  if((($output -join "`n") -notmatch [regex]::Escape($ExpectedCode))){throw "Preflight did not emit ${ExpectedCode}: $Database"}
}

Invoke-NegativePreflight 'phase10of_preflight_private' 'CREATE SCHEMA private;' 'PHASE10O_F_PRIVATE_SCHEMA_COLLISION'
Invoke-NegativePreflight 'phase10of_preflight_rpc' "CREATE FUNCTION public.create_provisional_social_account(text,text,bytea,integer) RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';" 'PHASE10O_F_PUBLIC_RPC_COLLISION'
Invoke-NegativePreflight 'phase10of_preflight_launch' "DELETE FROM public.public_account_launch_control WHERE control_key='public_account';" 'PHASE10O_F_LAUNCH_CONTROL_SINGLETON_INVALID'
Write-Output 'PHASE10O_F_NEGATIVE_PREFLIGHT_OK private_schema=blocked public_rpc=blocked launch_control=blocked'
