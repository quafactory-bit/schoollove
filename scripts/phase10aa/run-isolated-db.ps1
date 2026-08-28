$ErrorActionPreference = 'Stop'

$containerName = 'schoollove-phase10aa-db'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$migrationName = '20260827104800_grade_class_history_foundation.sql'
$migrationPath = (Resolve-Path "supabase/migrations/$migrationName").Path
$created = $false

function Invoke-SqlFile([string]$database, [string]$file) {
  Get-Content -LiteralPath $file -Raw -Encoding UTF8 |
    docker exec -i $containerName psql -U postgres -d $database -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $database $file" }
}

function Invoke-Sql([string]$database, [string]$sql) {
  $sql | docker exec -i $containerName psql -U postgres -d $database -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $database" }
}

function Invoke-Scalar([string]$database, [string]$sql) {
  $value = docker exec $containerName psql -U postgres -d $database -q -tAc $sql
  if ($LASTEXITCODE -ne 0) { throw "Scalar SQL failed: $database" }
  return $value.Trim()
}

function Assert-Equal([string]$label, [string]$actual, [string]$expected) {
  if ($actual -ne $expected) { throw "$label expected=$expected actual=$actual" }
  Write-Output "PHASE10AA_ASSERT_OK $label=$actual"
}

function Expect-SqlFailure([string]$database, [string]$label, [string]$sql) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $sql | docker exec -i $containerName psql -U postgres -d $database -v ON_ERROR_STOP=1 -q 2>$null | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  if ($code -eq 0) { throw "Expected SQL failure was accepted: $label" }
  Write-Output "PHASE10AA_EXPECTED_REJECTION_OK $label"
}

function Invoke-AsUser([string]$database, [string]$userId, [string]$sql) {
  Invoke-Sql $database @"
SET request.jwt.claim.sub='$userId';
SET request.jwt.claim.role='authenticated';
SET ROLE authenticated;
$sql
RESET ROLE;
"@
}

function Expect-AsUserFailure([string]$database, [string]$userId, [string]$label, [string]$sql) {
  Expect-SqlFailure $database $label @"
SET request.jwt.claim.sub='$userId';
SET request.jwt.claim.role='authenticated';
SET ROLE authenticated;
$sql
"@
}

function Initialize-Database([string]$database, [bool]$includePhase10AA) {
  docker exec $containerName createdb -U postgres $database
  if ($LASTEXITCODE -ne 0) { throw "Could not create database: $database" }

  Invoke-Sql $database @"
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(
  id uuid PRIMARY KEY,
  email text,
  banned_until timestamptz,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=''
  AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path=''
  AS 'SELECT NULLIF(current_setting(''request.jwt.claim.role'',true),'''')';
"@

  Invoke-SqlFile $database (Resolve-Path 'supabase-schema.sql').Path
  Invoke-SqlFile $database (Resolve-Path 'scripts/phase10f/bootstrap-legacy.sql').Path

  $migrations = @(Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql' | Sort-Object Name)
  $reset = $migrations | Where-Object Name -eq '20260802120000_legacy_person_data_reset.sql'
  $beforeReset = $migrations | Where-Object Name -lt '20260802120000_legacy_person_data_reset.sql'
  $afterReset = $migrations | Where-Object {
    $_.Name -gt '20260802120000_legacy_person_data_reset.sql' -and
      ($includePhase10AA -or $_.Name -ne $migrationName)
  }

  foreach ($file in $beforeReset) { Invoke-SqlFile $database $file.FullName }
  Invoke-SqlFile $database (Resolve-Path 'scripts/phase10l/seed-production-shape.sql').Path
  Invoke-SqlFile $database $reset.FullName
  foreach ($file in $afterReset) { Invoke-SqlFile $database $file.FullName }
}

function Seed-AccountAuthority([string]$database) {
  Invoke-Sql $database @"
UPDATE public.public_account_launch_control
SET state='internal_test',
    account_registration_enabled=false,
    private_profile_enabled=true,
    school_membership_enabled=true,
    emergency_stopped_at=NULL,
    last_reason_code='PHASE10AA_LOCAL_TEST',
    updated_by='phase10aa-local',
    updated_at=clock_timestamp()
WHERE control_key='public_account';

INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
VALUES
  ('aa000001-0000-4000-8000-000000000001','Isolated High School','high','Seoul','Test District','AA-HIGH-1','phase10aa-high-1'),
  ('aa000001-0000-4000-8000-000000000002','Isolated Middle School','middle','Seoul','Test District','AA-MIDDLE-1','phase10aa-middle-1'),
  ('aa000001-0000-4000-8000-000000000003','Isolated Elementary School','elementary','Seoul','Test District','AA-ELEMENTARY-1','phase10aa-elementary-1'),
  ('aa000001-0000-4000-8000-000000000004','Isolated University','university','Seoul','Test District','AA-UNIVERSITY-1','phase10aa-university-1'),
  ('aa000001-0000-4000-8000-000000000005','Isolated College','college','Seoul','Test District','AA-COLLEGE-1','phase10aa-college-1'),
  ('aa000001-0000-4000-8000-000000000006','Isolated High School 2','high','Seoul','Test District','AA-HIGH-2','phase10aa-high-2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users(id,email)
SELECT user_id, concat('phase10aa-', row_number() OVER (), '@example.invalid')
FROM unnest(ARRAY[
  'aa100001-0000-4000-8000-000000000001'::uuid,
  'aa100001-0000-4000-8000-000000000002'::uuid,
  'aa100001-0000-4000-8000-000000000003'::uuid,
  'aa100001-0000-4000-8000-000000000004'::uuid,
  'aa100001-0000-4000-8000-000000000005'::uuid,
  'aa100001-0000-4000-8000-000000000006'::uuid
]) AS users(user_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.adult_eligibility_records(
  user_id,adult_eligible,verification_method,policy_version
)
SELECT id,true,'self_attestation','phase10b-2026-07-28'
FROM auth.users WHERE email LIKE 'phase10aa-%@example.invalid'
  AND NOT EXISTS (
    SELECT 1 FROM public.adult_eligibility_records existing WHERE existing.user_id=auth.users.id
  );

INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT users.id, consent_values.consent_type, true, 'phase10b-2026-07-28'
FROM auth.users users
CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default'])
  AS consent_values(consent_type)
WHERE users.email LIKE 'phase10aa-%@example.invalid'
  AND NOT EXISTS (
    SELECT 1 FROM public.consent_records existing
    WHERE existing.user_id=users.id
      AND existing.consent_type=consent_values.consent_type
  );
"@

  foreach ($userId in @(
    'aa100001-0000-4000-8000-000000000001',
    'aa100001-0000-4000-8000-000000000002',
    'aa100001-0000-4000-8000-000000000003',
    'aa100001-0000-4000-8000-000000000004',
    'aa100001-0000-4000-8000-000000000005',
    'aa100001-0000-4000-8000-000000000006'
  )) {
    Invoke-AsUser $database $userId "SELECT public.upsert_own_private_profile('Synthetic owner',NULL,NULL);"
  }
}

try {
  docker version --format '{{.Server.Version}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine is unavailable.' }
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  docker rm -f $containerName 2>$null | Out-Null
  $ErrorActionPreference = $old

  docker run -d --name $containerName -e POSTGRES_PASSWORD=local_phase10aa_only $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL container could not start.' }
  $created = $true

  $ready = $false
  $consecutiveReady = 0
  for ($attempt=0; $attempt -lt 180; $attempt++) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker exec $containerName psql -U postgres -d postgres -tAc 'SELECT 1' 2>$null | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $old
    if ($code -eq 0) {
      $consecutiveReady++
      if ($consecutiveReady -ge 5) { $ready = $true; break }
    } else {
      $consecutiveReady = 0
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }

  $migrationCount = @(Get-ChildItem -LiteralPath 'supabase/migrations' -Filter '*.sql').Count
  Assert-Equal 'migration_count' "$migrationCount" '36'

  Initialize-Database 'phase10aa_fresh' $true
  Assert-Equal 'fresh_child_table' (Invoke-Scalar 'phase10aa_fresh' "SELECT to_regclass('public.profile_school_class_histories') IS NOT NULL") 't'
  Write-Output 'PHASE10AA_FRESH_CHAIN_PASS migrations=36'

  Initialize-Database 'phase10aa_upgrade' $false
  Seed-AccountAuthority 'phase10aa_upgrade'
  Invoke-AsUser 'phase10aa_upgrade' 'aa100001-0000-4000-8000-000000000006' @"
SELECT public.add_own_school_membership(
  'aa000001-0000-4000-8000-000000000006',
  2006,
  9
);
"@
  $beforeTables = Invoke-Scalar 'phase10aa_upgrade' "SELECT count(*) FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='public' AND relation.relkind='r'"
  $beforeColumns = Invoke-Scalar 'phase10aa_upgrade' "SELECT count(*) FROM information_schema.columns WHERE table_schema='public'"
  $beforeFunctions = Invoke-Scalar 'phase10aa_upgrade' "SELECT count(*) FROM pg_catalog.pg_proc function JOIN pg_catalog.pg_namespace namespace ON namespace.oid=function.pronamespace WHERE namespace.nspname='public'"

  Invoke-SqlFile 'phase10aa_upgrade' $migrationPath

  $afterTables = Invoke-Scalar 'phase10aa_upgrade' "SELECT count(*) FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='public' AND relation.relkind='r'"
  $afterColumns = Invoke-Scalar 'phase10aa_upgrade' "SELECT count(*) FROM information_schema.columns WHERE table_schema='public'"
  $afterFunctions = Invoke-Scalar 'phase10aa_upgrade' "SELECT count(*) FROM pg_catalog.pg_proc function JOIN pg_catalog.pg_namespace namespace ON namespace.oid=function.pronamespace WHERE namespace.nspname='public'"
  Assert-Equal 'table_delta' "$([int]$afterTables-[int]$beforeTables)" '1'
  Assert-Equal 'column_delta' "$([int]$afterColumns-[int]$beforeColumns)" '7'
  Assert-Equal 'function_delta' "$([int]$afterFunctions-[int]$beforeFunctions)" '1'
  Assert-Equal 'legacy_class_retained' (Invoke-Scalar 'phase10aa_upgrade' "SELECT class_number FROM public.profile_school_memberships WHERE owner_user_id='aa100001-0000-4000-8000-000000000006'") '9'
  Assert-Equal 'legacy_not_backfilled' (Invoke-Scalar 'phase10aa_upgrade' "SELECT count(*) FROM public.profile_school_class_histories WHERE owner_user_id='aa100001-0000-4000-8000-000000000006'") '0'
  Write-Output "PHASE10AA_UPGRADE_PASS migrations=35_to_36 tables=$beforeTables->$afterTables columns=$beforeColumns->$afterColumns functions=$beforeFunctions->$afterFunctions"

  Seed-AccountAuthority 'phase10aa_fresh'
  $ownerOne = 'aa100001-0000-4000-8000-000000000001'
  $ownerTwo = 'aa100001-0000-4000-8000-000000000002'

  Invoke-AsUser 'phase10aa_fresh' $ownerOne @"
SELECT public.add_own_school_membership_with_class_history(
  'aa000001-0000-4000-8000-000000000001',2007,
  '[{"grade_number":1,"class_number":2},{"grade_number":2,"class_number":5},{"grade_number":3,"class_number":2}]'::jsonb
);
SELECT public.add_own_school_membership_with_class_history(
  'aa000001-0000-4000-8000-000000000002',2007,
  '[{"grade_number":1,"class_number":1},{"grade_number":2,"class_number":2},{"grade_number":3,"class_number":3}]'::jsonb
);
SELECT public.add_own_school_membership_with_class_history(
  'aa000001-0000-4000-8000-000000000003',2007,
  '[{"grade_number":1,"class_number":1},{"grade_number":2,"class_number":2},{"grade_number":3,"class_number":3},{"grade_number":4,"class_number":4},{"grade_number":5,"class_number":5},{"grade_number":6,"class_number":6}]'::jsonb
);
"@
  Assert-Equal 'three_schools' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id='$ownerOne'") '3'
  Assert-Equal 'twelve_class_rows' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_class_histories WHERE owner_user_id='$ownerOne'") '12'
  Assert-Equal 'new_parent_class_null' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id='$ownerOne' AND class_number IS NOT NULL") '0'

  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'high_grade_4' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000001',2008,'[{"grade_number":4,"class_number":1}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'elementary_grade_7' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000003',2008,'[{"grade_number":7,"class_number":1}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'university_grade' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000004',2008,'[{"grade_number":1,"class_number":1}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'college_grade' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000005',2008,'[{"grade_number":1,"class_number":1}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'duplicate_grade' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000001',2008,'[{"grade_number":1,"class_number":1},{"grade_number":1,"class_number":2}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'grade_without_class' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000001',2008,'[{"grade_number":1}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'class_without_grade' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000001',2008,'[{"class_number":1}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'class_zero' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000001',2008,'[{"grade_number":1,"class_number":0}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'class_101' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000001',2008,'[{"grade_number":1,"class_number":101}]'::jsonb);
'@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'future_graduation_year' "SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000001',2200,'[]'::jsonb);"
  Assert-Equal 'invalid_requests_atomic' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id='$ownerTwo'") '0'

  Invoke-Sql 'phase10aa_fresh' @"
CREATE FUNCTION public.phase10aa_force_child_failure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS `$`$
BEGIN
  RAISE EXCEPTION 'PHASE10AA_FORCED_CHILD_FAILURE';
END;
`$`$;
CREATE TRIGGER phase10aa_force_child_failure
BEFORE INSERT ON public.profile_school_class_histories
FOR EACH ROW EXECUTE FUNCTION public.phase10aa_force_child_failure();
"@
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'child_failure_rolls_back_parent' @'
SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000001',2008,'[{"grade_number":1,"class_number":1}]'::jsonb);
'@
  Assert-Equal 'child_failure_parent_rollback' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id='$ownerTwo'") '0'
  Invoke-Sql 'phase10aa_fresh' @"
DROP TRIGGER phase10aa_force_child_failure ON public.profile_school_class_histories;
DROP FUNCTION public.phase10aa_force_child_failure();
"@

  Invoke-AsUser 'phase10aa_fresh' 'aa100001-0000-4000-8000-000000000003' "SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000004',2007,'[]'::jsonb);"
  Assert-Equal 'university_empty_history_allowed' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id='aa100001-0000-4000-8000-000000000003' AND class_number IS NULL") '1'

  Expect-AsUserFailure 'phase10aa_fresh' $ownerOne 'school_limit_counts_schools_only' "SELECT public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000006',2007,'[]'::jsonb);"

  Assert-Equal 'cross_user_select_blocked' (Invoke-Scalar 'phase10aa_fresh' "SET request.jwt.claim.sub='$ownerTwo'; SET ROLE authenticated; SELECT count(*) FROM public.profile_school_class_histories; RESET ROLE;") '0'
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'cross_user_insert_blocked' "INSERT INTO public.profile_school_class_histories(membership_id,owner_user_id,grade_number,class_number) SELECT id,'$ownerTwo',1,1 FROM public.profile_school_memberships WHERE owner_user_id='$ownerOne' LIMIT 1;"
  Expect-AsUserFailure 'phase10aa_fresh' $ownerTwo 'cross_user_update_blocked' "UPDATE public.profile_school_class_histories SET class_number=99 WHERE owner_user_id='$ownerOne';"
  Expect-SqlFailure 'phase10aa_fresh' 'parent_owner_mismatch_fk' "INSERT INTO public.profile_school_class_histories(membership_id,owner_user_id,grade_number,class_number) SELECT id,'$ownerTwo',4,1 FROM public.profile_school_memberships WHERE owner_user_id='$ownerOne' AND school_id='aa000001-0000-4000-8000-000000000003';"

  $middleMembershipId = Invoke-Scalar 'phase10aa_fresh' "SELECT id FROM public.profile_school_memberships WHERE owner_user_id='$ownerOne' AND school_id='aa000001-0000-4000-8000-000000000002'"
  Invoke-AsUser 'phase10aa_fresh' $ownerOne "SELECT public.delete_own_school_membership('$middleMembershipId');"
  Assert-Equal 'membership_delete_cascade' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_class_histories WHERE membership_id='$middleMembershipId'") '0'

  Invoke-AsUser 'phase10aa_fresh' $ownerOne "SELECT public.delete_own_private_profile();"
  Assert-Equal 'profile_delete_memberships' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id='$ownerOne'") '0'
  Assert-Equal 'profile_delete_class_history' (Invoke-Scalar 'phase10aa_fresh' "SELECT count(*) FROM public.profile_school_class_histories WHERE owner_user_id='$ownerOne'") '0'

  Assert-Equal 'rls_enabled_forced' (Invoke-Scalar 'phase10aa_fresh' "SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='public.profile_school_class_histories'::regclass") 't'
  Assert-Equal 'authenticated_select_grant' (Invoke-Scalar 'phase10aa_fresh' "SELECT has_table_privilege('authenticated','public.profile_school_class_histories','SELECT')") 't'
  Assert-Equal 'authenticated_insert_revoked' (Invoke-Scalar 'phase10aa_fresh' "SELECT has_table_privilege('authenticated','public.profile_school_class_histories','INSERT')") 'f'
  Assert-Equal 'anon_select_revoked' (Invoke-Scalar 'phase10aa_fresh' "SELECT has_table_privilege('anon','public.profile_school_class_histories','SELECT')") 'f'

  Write-Output 'PHASE10AA_ISOLATED_DB_PASS fresh=true upgrade=35_to_36 rls=true atomic=true cascades=true'
} finally {
  if ($created) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker rm -f $containerName 2>$null | Out-Null
    $ErrorActionPreference = $old
  }
}
