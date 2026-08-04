$ErrorActionPreference='Stop'
$containerName='schoollove-phase10n-db-script'
$image='public.ecr.aws/supabase/postgres:17.6.1.143'
$resetMigration=(Resolve-Path 'supabase/migrations/20260802120000_legacy_person_data_reset.sql').Path
$launchMigration=(Resolve-Path 'supabase/migrations/20260803120000_public_account_soft_launch.sql').Path
$created=$false
function Invoke-SqlFile([string]$file){Get-Content -LiteralPath $file -Raw -Encoding UTF8|docker exec -i $containerName psql -U postgres -d phase10n -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw "SQL failed: $file"}}
function Invoke-Sql([string]$sql){$sql|docker exec -i $containerName psql -U postgres -d phase10n -v ON_ERROR_STOP=1 -q;if($LASTEXITCODE-ne 0){throw 'SQL bootstrap failed.'}}
function Assert-LaunchMigrationFails([string]$label,[string]$setup,[string]$cleanup,[string]$failureHook=''){
  if($setup){Invoke-Sql $setup}
  $prefix=if($failureHook){"SET phase10n.force_failure='$failureHook';`n"}else{''}
  $migrationSql=$prefix+(Get-Content -LiteralPath $launchMigration -Raw -Encoding UTF8)
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue'
  $migrationSql|docker exec -i $containerName psql -U postgres -d phase10n -v ON_ERROR_STOP=1 -q 2>$null|Out-Null
  $code=$LASTEXITCODE;$ErrorActionPreference=$old
  if($code-eq 0){throw "Expected migration failure was accepted: $label"}
  $partial=docker exec $containerName psql -U postgres -d phase10n -tAc "SELECT to_regclass('public.public_account_launch_control') IS NULL"
  if($LASTEXITCODE-ne 0-or$partial.Trim()-ne't'){throw "Partial permanent DDL remained: $label"}
  if($cleanup){Invoke-Sql $cleanup}
  $count=docker exec $containerName psql -U postgres -d phase10n -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'"
  if($LASTEXITCODE-ne 0-or$count.Trim()-ne'68'){throw "Scenario cleanup drifted table contract: $label $($count.Trim())"}
  Write-Output "PHASE10N_EXPECTED_ROLLBACK_OK $label"
}
try{
  docker version --format '{{.Server.Version}}'|Out-Null
  if($LASTEXITCODE-ne 0){throw 'Docker engine is unavailable.'}
  $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old
  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_phase10n_only $image|Out-Null
  if($LASTEXITCODE-ne 0){throw 'Isolated PostgreSQL container could not start.'};$created=$true
  $ready=$false;$consecutive=0
  for($attempt=0;$attempt-lt 120;$attempt++){
    $health=docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $containerName
    $old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker exec $containerName psql -U postgres -d postgres -tAc 'SELECT 1' 2>$null|Out-Null;$code=$LASTEXITCODE;$ErrorActionPreference=$old
    if($code-eq 0-and($health-eq'healthy'-or$health-eq'none')){$consecutive++;if($consecutive-ge 3){$ready=$true;break}}else{$consecutive=0}
    Start-Sleep -Seconds 1
  }
  if(-not $ready){throw 'Isolated PostgreSQL did not become ready.'}
  docker exec $containerName createdb -U postgres phase10n
  Invoke-Sql @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,banned_until timestamptz,raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path='' AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@
  Invoke-SqlFile (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path
  Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql'|Where-Object{$_.Name-lt'20260802120000_legacy_person_data_reset.sql'}|Sort-Object Name|ForEach-Object{Invoke-SqlFile $_.FullName}
  Invoke-SqlFile (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  Invoke-SqlFile $resetMigration
  Assert-LaunchMigrationFails 'legacy_profile_drift' "INSERT INTO public.profiles(id,school_id,graduation_year,nickname) VALUES('73000000-0000-4000-8000-000000000001',md5('phase10l-school-1')::uuid,2000,'isolated profile');" "DELETE FROM public.profiles WHERE id='73000000-0000-4000-8000-000000000001';"
  Assert-LaunchMigrationFails 'legacy_report_drift' "INSERT INTO public.profiles(id,school_id,graduation_year,nickname) VALUES('73000000-0000-4000-8000-000000000002',md5('phase10l-school-1')::uuid,2000,'isolated report profile');INSERT INTO public.reports(profile_id,type,reason) VALUES('73000000-0000-4000-8000-000000000002','report','isolated');" "DELETE FROM public.profiles WHERE id='73000000-0000-4000-8000-000000000002';"
  Assert-LaunchMigrationFails 'legacy_trace_drift' "INSERT INTO public.traces(school_id,graduation_year,message) VALUES(md5('phase10l-school-1')::uuid,2000,'isolated');" "DELETE FROM public.traces;"
  Assert-LaunchMigrationFails 'legacy_search_log_drift' "INSERT INTO public.search_logs(query,result_count) VALUES('isolated-drift',0);" "DELETE FROM public.search_logs;"
  Assert-LaunchMigrationFails 'school_count_10005' "CREATE SCHEMA phase10n_test;CREATE TABLE phase10n_test.school_backup AS SELECT * FROM public.schools WHERE id=md5('phase10l-school-1')::uuid;DELETE FROM public.schools WHERE id=md5('phase10l-school-1')::uuid;" "INSERT INTO public.schools SELECT * FROM phase10n_test.school_backup;DROP SCHEMA phase10n_test CASCADE;"
  Assert-LaunchMigrationFails 'school_count_10007' "CREATE SCHEMA phase10n_test;CREATE TABLE phase10n_test.school_extra AS SELECT * FROM public.schools WHERE id=md5('phase10l-school-1')::uuid;UPDATE phase10n_test.school_extra SET id='73000000-0000-4000-8000-000000000003',school_code='PHASE10N_EXTRA',slug='phase10n-extra';INSERT INTO public.schools SELECT * FROM phase10n_test.school_extra;" "DELETE FROM public.schools WHERE id='73000000-0000-4000-8000-000000000003';DROP SCHEMA phase10n_test CASCADE;"
  Assert-LaunchMigrationFails 'school_growth_drift' "UPDATE public.schools SET current_level=2,level_updated_at=now() WHERE id=md5('phase10l-school-1')::uuid;" "UPDATE public.schools SET current_level=1,level_updated_at=NULL WHERE id=md5('phase10l-school-1')::uuid;"
  Assert-LaunchMigrationFails 'private_profile_drift' "INSERT INTO auth.users(id,email) VALUES('71000000-0000-4000-8000-000000000001','profile-drift@example.invalid');ALTER TABLE public.private_profiles DISABLE TRIGGER USER;INSERT INTO public.private_profiles(owner_user_id,display_name) VALUES('71000000-0000-4000-8000-000000000001','drift');ALTER TABLE public.private_profiles ENABLE TRIGGER USER;" "DELETE FROM auth.users WHERE id='71000000-0000-4000-8000-000000000001';"
  Assert-LaunchMigrationFails 'safety_restriction_drift' "INSERT INTO auth.users(id,email) VALUES('71000000-0000-4000-8000-000000000002','safety-drift@example.invalid');INSERT INTO public.safety_account_restrictions(user_id,status,reason_code) VALUES('71000000-0000-4000-8000-000000000002','suspended','isolated_test');" "DELETE FROM auth.users WHERE id='71000000-0000-4000-8000-000000000002';"
  Assert-LaunchMigrationFails 'connection_person_drift' "INSERT INTO auth.users(id,email) VALUES('71000000-0000-4000-8000-000000000005','blocker@example.invalid'),('71000000-0000-4000-8000-000000000006','blocked@example.invalid');INSERT INTO public.user_blocks(blocker_user_id,blocked_user_id) VALUES('71000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000006');" "DELETE FROM auth.users WHERE id IN ('71000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000006');"
  Assert-LaunchMigrationFails 'beta_operation_drift' "INSERT INTO auth.users(id,email) VALUES('71000000-0000-4000-8000-000000000003','beta-drift@example.invalid');INSERT INTO public.beta_members(program_id,user_id,status) SELECT id,'71000000-0000-4000-8000-000000000003','pending_review' FROM public.beta_programs LIMIT 1;" "DELETE FROM auth.users WHERE id='71000000-0000-4000-8000-000000000003';"
  Assert-LaunchMigrationFails 'scoped_beta_flag_drift' "INSERT INTO public.beta_feature_flags(program_id,feature_key,enabled,reason_code,updated_by) SELECT id,'account_registration',false,'ISOLATED_SCOPED','test' FROM public.beta_programs LIMIT 1;" "DELETE FROM public.beta_feature_flags WHERE reason_code='ISOLATED_SCOPED';"
  Assert-LaunchMigrationFails 'commercial_drift' "INSERT INTO public.payment_webhook_events(provider,event_id,event_type,provider_payment_id,payload_sha256,occurred_at) VALUES('mock','event01','Transaction.Paid','payment1',repeat('a',64),now());" "DELETE FROM public.payment_webhook_events WHERE event_id='event01';"
  Assert-LaunchMigrationFails 'unexpected_public_table' "CREATE TABLE public.phase10n_unexpected(id integer);" "DROP TABLE public.phase10n_unexpected;"
  Assert-LaunchMigrationFails 'missing_public_table' "ALTER TABLE public.reports RENAME TO phase10n_reports_missing;" "ALTER TABLE public.phase10n_reports_missing RENAME TO reports;"
  Assert-LaunchMigrationFails 'unexpected_person_link' "ALTER TABLE public.schools ADD COLUMN surprise_user_id uuid;" "ALTER TABLE public.schools DROP COLUMN surprise_user_id;"
  Assert-LaunchMigrationFails 'partial_launch_table_create' '' '' 'after_launch_control'
  Assert-LaunchMigrationFails 'forced_middle_failure' '' '' 'after_tables'
  foreach($smoke in @('scripts/phase10j/lifecycle-smoke.sql','scripts/phase10j/permission-smoke.sql')){Invoke-SqlFile (Resolve-Path $smoke).Path}
  Invoke-SqlFile $launchMigration
  foreach($smoke in @('scripts/phase10n/lifecycle-smoke.sql','scripts/phase10n/permission-smoke.sql')){Invoke-SqlFile (Resolve-Path $smoke).Path}
  $baseline=docker exec $containerName psql -U postgres -d phase10n -tAc "SELECT concat_ws('|',(SELECT count(*) FROM public.profiles),(SELECT count(*) FROM public.reports),(SELECT count(*) FROM public.traces),(SELECT count(*) FROM public.search_logs),(SELECT count(*) FROM public.schools),(SELECT count(*) FROM public.beta_members),(SELECT count(*) FROM public.promotion_orders),(SELECT state FROM public.public_account_launch_control))"
  if($LASTEXITCODE-ne 0-or$baseline.Trim()-ne'0|0|0|0|10006|0|0|closed'){throw "Final baseline mismatch: $($baseline.Trim())"}
  Write-Output 'PHASE10N_ISOLATED_DB_OK 0|0|0|0|10006|0|0|closed'
}finally{if($created){$old=$ErrorActionPreference;$ErrorActionPreference='SilentlyContinue';docker rm -f $containerName 2>$null|Out-Null;$ErrorActionPreference=$old}}
