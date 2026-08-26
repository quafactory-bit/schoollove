param([string]$Project='',[string]$Spec='e2e/phase10n-account.spec.ts',[string]$ExtraMigration='')
$ErrorActionPreference='Stop'
$db='schoollove-phase10n-auth-db';$auth='schoollove-phase10n-auth-gotrue';$rest='schoollove-phase10n-auth-rest';$network='schoollove-phase10n-auth-network'
$dbImage='public.ecr.aws/supabase/postgres:17.6.1.143';$authImage='public.ecr.aws/supabase/gotrue:v2.193.0';$restImage='public.ecr.aws/supabase/postgrest:v14.14'
$reset=(Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path;$launch=(Resolve-Path 'supabase/migrations/20260803120000_public_account_soft_launch.sql').Path
$next=$null;$proxy=$null;$temp=Join-Path ([IO.Path]::GetTempPath()) ('schoollove-phase10n-auth-'+[guid]::NewGuid().ToString('N'));$created=@()
function B64([byte[]]$value){[Convert]::ToBase64String($value).TrimEnd('=').Replace('+','-').Replace('/','_')}
function Jwt([string]$role,[string]$secret){$now=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();$header=B64([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'));$payload=B64([Text.Encoding]::UTF8.GetBytes((@{role=$role;iss='supabase';aud='authenticated';iat=$now;exp=$now+7200}|ConvertTo-Json -Compress)));$unsigned="$header.$payload";$hmac=[Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret));try{$signature=B64($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($unsigned)))}finally{$hmac.Dispose()};"$unsigned.$signature"}
function SqlFile([string]$file){Get-Content -LiteralPath $file -Raw -Encoding UTF8|docker exec -i $db psql -U postgres -d phase10n_auth -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){docker logs --tail 80 $db;throw "SQL failed: $file"}}
function SqlFileByte([string]$file){$containerPath='/tmp/phase10v-'+[guid]::NewGuid().ToString('N')+'.sql';docker cp $file "${db}:$containerPath"|Out-Null;if($LASTEXITCODE-ne 0){throw "SQL copy failed: $file"};docker exec $db psql -U postgres -d phase10n_auth -v ON_ERROR_STOP=1 -q -f $containerPath;if($LASTEXITCODE-ne 0){throw "SQL failed: $file"};docker exec $db rm -f $containerPath|Out-Null}
function Sql([string]$value){$value|docker exec -i $db psql -U postgres -d phase10n_auth -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw 'SQL failed.'}}
function WaitHttp([string]$url,[int]$attempts=120){for($i=0;$i-lt$attempts;$i++){try{$response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2;if($response.StatusCode-lt 500){return}}catch{};Start-Sleep -Seconds 1};throw "HTTP unavailable: $url"}
try{
  New-Item -ItemType Directory -Path $temp|Out-Null
  docker version --format '{{.Server.Version}}'|Out-Null;if($LASTEXITCODE-ne 0){throw 'Docker unavailable.'}
  foreach($name in @($db,$auth,$rest)){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $name 2>$null|Out-Null;$ErrorActionPreference=$old}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker network rm $network 2>$null|Out-Null;$ErrorActionPreference=$old
  docker network create $network|Out-Null;$created+=@('network')
  docker run -d --name $db --network $network --network-alias db -e POSTGRES_PASSWORD=local_phase10n_auth_only $dbImage|Out-Null;$created+=@('db')
  $ready=$false;$consecutive=0;for($i=0;$i-lt 120;$i++){$health=docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $db;$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker exec $db psql -U postgres -d postgres -tAc 'SELECT 1' 2>$null|Out-Null;$code=$LASTEXITCODE;$ErrorActionPreference=$old;if($code-eq 0-and($health-eq'healthy'-or$health-eq'none')){$consecutive++;if($consecutive-ge 3){$ready=$true;break}}else{$consecutive=0};Start-Sleep -Seconds 1};if(-not$ready){throw 'PostgreSQL unavailable.'};Start-Sleep -Seconds 2
  docker exec $db createdb -U postgres -T template0 phase10n_auth
  $secretBytes=New-Object byte[] 48;$controlBytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($secretBytes);$rng.GetBytes($controlBytes)}finally{$rng.Dispose()};$secret=B64($secretBytes);$control=B64($controlBytes);$anon=Jwt 'anon' $secret;$service=Jwt 'service_role' $secret
  Sql "CREATE ROLE phase10n_gotrue LOGIN PASSWORD 'local_phase10n_gotrue_only'; GRANT phase10n_gotrue TO postgres; ALTER ROLE phase10n_gotrue IN DATABASE phase10n_auth SET search_path TO auth,public; CREATE SCHEMA auth; GRANT ALL ON SCHEMA auth TO phase10n_gotrue;"
  $env:PHASE10N_PROXY_PORT='3221';$env:PHASE10N_POSTGREST_PORT='3222';$env:PHASE10N_GOTRUE_PORT='3223';$env:PHASE10N_PROXY_CONTROL_TOKEN=$control
  $env:PHASE10N_DB_CONTAINER=$db
  $proxy=Start-Process -FilePath 'node.exe' -ArgumentList 'scripts/phase10n/supabase-proxy.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $temp 'proxy.out') -RedirectStandardError (Join-Path $temp 'proxy.err')
  WaitHttp 'http://127.0.0.1:3221/phase10n-proxy-health'
  docker run -d --name $auth --network $network --network-alias gotrue -p 127.0.0.1:3223:9999 `
    -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e GOTRUE_DB_DRIVER=postgres `
    -e GOTRUE_DB_NAMESPACE=auth `
    -e GOTRUE_DB_DATABASE_URL='postgres://phase10n_gotrue:local_phase10n_gotrue_only@db:5432/phase10n_auth?sslmode=disable' `
    -e GOTRUE_SITE_URL=http://127.0.0.1:3220 -e API_EXTERNAL_URL=http://127.0.0.1:3221/auth/v1 `
    -e GOTRUE_JWT_SECRET=$secret -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated `
    -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_EXTERNAL_EMAIL_ENABLED=false -e GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true $authImage|Out-Null;$created+=@('auth')
  WaitHttp 'http://127.0.0.1:3223/health'
  Sql "DO `$`$ BEGIN IF to_regclass('public.schema_migrations') IS NOT NULL THEN ALTER TABLE public.schema_migrations RENAME TO gotrue_schema_migrations; ALTER TABLE public.gotrue_schema_migrations RENAME CONSTRAINT schema_migrations_pkey TO gotrue_schema_migrations_pkey; ALTER TABLE public.gotrue_schema_migrations SET SCHEMA auth; END IF; END `$`$;"
  Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
"@
  SqlFile (Resolve-Path 'supabase-schema.sql').Path;SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem 'supabase/migrations' -Filter '*.sql'|Where-Object{$_.Name-lt'20260802120000_legacy_person_data_reset.sql'}|Sort-Object Name|ForEach-Object{SqlFile $_.FullName}
  SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path;SqlFile $reset;SqlFile $launch
  if($ExtraMigration){SqlFileByte (Resolve-Path $ExtraMigration).Path}
  SqlFile (Resolve-Path 'scripts/phase10l/postgrest-test-bootstrap.sql').Path
  Sql "SELECT public.admin_set_public_account_launch_state('internal_test','LOCAL_AUTH_TEST','test:runner');"
  docker run -d --name $rest --network $network -p 127.0.0.1:3222:3000 -e PGRST_DB_URI=postgres://phase10l_authenticator:phase10l_local_postgrest@db:5432/phase10n_auth -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$secret $restImage|Out-Null;$created+=@('rest')
  WaitHttp 'http://127.0.0.1:3221/auth/v1/health'
  $env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:3221';$env:NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon;$env:SUPABASE_SERVICE_ROLE_KEY=$service;$env:NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3220';$env:ADMIN_PASSWORD='phase10n-local-admin-only'
  $env:PHASE10N_E2E_SERVICE_KEY=$service;$env:PHASE10N_E2E_ANON_KEY=$anon;$env:PHASE10N_E2E_SUPABASE_URL='http://127.0.0.1:3221';$env:PHASE10N_E2E_PROXY_CONTROL_TOKEN=$control
  $env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3220'
  $next=Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/next/dist/bin/next','dev','-p','3220' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $temp 'next.out') -RedirectStandardError (Join-Path $temp 'next.err')
  WaitHttp 'http://127.0.0.1:3220/'
  $playwrightArgs=@('node_modules/@playwright/test/cli.js','test',$Spec,'--workers=1','--retries=0')
  if($Project){$playwrightArgs+=@('--project',$Project)}
  & node.exe @playwrightArgs
  $playwrightExit=$LASTEXITCODE
  if($playwrightExit-ne 0){
    Write-Output 'PHASE10_E2E_NEXT_STDOUT_TAIL'
    Get-Content -LiteralPath (Join-Path $temp 'next.out') -Tail 160 -ErrorAction SilentlyContinue
    Write-Output 'PHASE10_E2E_NEXT_STDERR_TAIL'
    Get-Content -LiteralPath (Join-Path $temp 'next.err') -Tail 160 -ErrorAction SilentlyContinue
    docker logs --tail 120 $auth
    throw "Playwright failed: $playwrightExit"
  }
  Sql "ALTER TABLE public.beta_program_schools DISABLE TRIGGER USER;DELETE FROM public.beta_program_schools school USING public.beta_programs program WHERE school.program_id=program.id AND program.program_key LIKE 'phase10n_e2e_%';ALTER TABLE public.beta_program_schools ENABLE TRIGGER USER;ALTER TABLE public.beta_program_setup_snapshots DISABLE TRIGGER USER;DELETE FROM public.beta_program_setup_snapshots snapshot USING public.beta_programs program WHERE snapshot.program_id=program.id AND program.program_key LIKE 'phase10n_e2e_%';ALTER TABLE public.beta_program_setup_snapshots ENABLE TRIGGER USER;DELETE FROM public.beta_setup_drafts WHERE draft_key LIKE 'phase10n_e2e_%';DELETE FROM public.beta_programs WHERE program_key LIKE 'phase10n_e2e_%';"
  $counts=docker exec $db psql -U postgres -d phase10n_auth -tAc "SELECT concat_ws('|',(SELECT count(*) FROM public.profiles),(SELECT count(*) FROM public.reports),(SELECT count(*) FROM public.traces),(SELECT count(*) FROM public.search_logs),(SELECT count(*) FROM public.schools),(SELECT count(*) FROM public.beta_members),(SELECT count(*) FROM public.promotion_orders),(SELECT count(*) FROM public.private_profiles),(SELECT count(*) FROM public.profile_school_memberships))"
  if($LASTEXITCODE-ne 0-or$counts.Trim()-ne'0|0|0|0|10006|0|0|0|0'){throw "E2E baseline drift: $($counts.Trim())"}
  if($Project){Write-Output "PHASE10R_GOOGLE_AUTH_PLAYWRIGHT_PROJECT_OK $Project spec=$Spec 0|0|0|0|10006|0|0|0|0"}
  else{Write-Output 'PHASE10R_GOOGLE_AUTH_PLAYWRIGHT_OK 20/20 0|0|0|0|10006|0|0|0|0'}
}finally{
  foreach($process in @($next,$proxy)){if($process-and-not$process.HasExited){Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue}}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';foreach($name in @($rest,$auth,$db)){docker rm -f $name 2>$null|Out-Null};docker network rm $network 2>$null|Out-Null;if(Test-Path $temp){Remove-Item -LiteralPath $temp -Recurse -Force};if(Test-Path 'test-results'){Remove-Item -LiteralPath 'test-results' -Recurse -Force};$ErrorActionPreference=$old
}
