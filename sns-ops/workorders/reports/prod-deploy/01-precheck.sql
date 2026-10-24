-- 운영 DB 사전 조회 (읽기 전용). 2026-10-23 결정, v2 운영 배포 전.
-- Supabase 운영 프로젝트 SQL Editor에서 이 파일 전체를 한 번 실행하고, 결과(JSON 한 칸)를 그대로 보고한다.
-- 아무것도 쓰지 않는다: SELECT와 카탈로그 함수만 쓴다.
--
-- 기대값 요약(모두 맞아야 02-apply.sql 실행 가능):
--   prerequisites.* 전부 true, new_objects_absent.* 전부 true,
--   replace_targets.*.matches_repo 전부 true, migrations.already_recorded = [] (빈 배열).
--   replace_targets.*.definition은 사람이 비교하는 용도(저장소의 이전 버전과 같은지 에이전트가 확인).
WITH
deletion_fn AS (
  SELECT pg_get_functiondef(to_regprocedure('public.request_own_account_deletion()')) AS def
),
roster_fn AS (
  SELECT pg_get_functiondef(to_regprocedure('public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)')) AS def
),
search_fn AS (
  SELECT pg_get_functiondef(to_regprocedure('public.search_schools_with_activity(text,integer)')) AS def
)
SELECT jsonb_pretty(jsonb_build_object(
  'checked_at_kst', to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
  'database', current_database(),

  -- 1) 4개 migration이 기대는 선행 객체
  'prerequisites', jsonb_build_object(
    'auth_users', to_regclass('auth.users') IS NOT NULL,
    'private_profiles', to_regclass('public.private_profiles') IS NOT NULL,
    'private_profiles_status_column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'private_profiles' AND column_name = 'status'),
    'account_deletion_requests', to_regclass('public.account_deletion_requests') IS NOT NULL,
    'schools_with_school_type', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schools' AND column_name = 'school_type'),
    'profile_school_memberships_profile_id_column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profile_school_memberships' AND column_name = 'profile_id'),
    'school_roster_consents', to_regclass('public.school_roster_consents') IS NOT NULL,
    'uuid_generate_v4', EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uuid_generate_v4'),
    'increment_public_account_metric', to_regprocedure('public.increment_public_account_metric(text,text,text)') IS NOT NULL,
    'add_own_school_membership_with_class_history', to_regprocedure('public.add_own_school_membership_with_class_history(uuid,integer,jsonb)') IS NOT NULL,
    'search_schools_v2', to_regprocedure('public.search_schools_v2(text,integer)') IS NOT NULL,
    'search_schools_v2_returns_setof_schools',
      pg_get_function_result(to_regprocedure('public.search_schools_v2(text,integer)')) = 'SETOF schools',
    'schema_migrations_table', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
    'schema_migrations_has_name_column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'name')
  ),

  -- 2) 새로 만드는 객체가 아직 없어야 한다(있으면 CREATE TABLE이 실패하거나 다른 버전이 덮어써진다)
  'new_objects_absent', jsonb_build_object(
    'push_subscriptions_table', to_regclass('public.push_subscriptions') IS NULL,
    'is_graduation_year_allowed', to_regprocedure('public.is_graduation_year_allowed(text,integer)') IS NULL,
    'school_year_counts_v2', to_regprocedure('public.school_year_counts_v2(uuid)') IS NULL
  ),

  -- 3) 교체(CREATE OR REPLACE) 대상 3개: 지금 운영 본문이 저장소의 "이전 버전"과 같은지.
  --    DB에만 손으로 고친 내용이 있으면 교체로 사라지므로, 표식이 하나라도 어긋나면 적용하지 않는다.
  'replace_targets', jsonb_build_object(
    'request_own_account_deletion', jsonb_build_object(
      'overload_count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                         WHERE n.nspname = 'public' AND p.proname = 'request_own_account_deletion'),
      'matches_repo', (SELECT def IS NOT NULL
                          AND position('push_subscriptions' IN def) = 0
                          AND position('deletion_requested' IN def) > 0
                          AND position('account_deletion_requests' IN def) > 0
                          AND position('account_deletion_requested' IN def) > 0
                          AND position('SECURITY DEFINER' IN def) > 0
                        FROM deletion_fn),
      'md5', (SELECT md5(def) FROM deletion_fn),
      'definition', (SELECT def FROM deletion_fn)
    ),
    'add_own_school_membership_with_roster', jsonb_build_object(
      'matches_repo', (SELECT def IS NOT NULL
                          AND position('is_graduation_year_allowed' IN def) = 0
                          AND position('school_type_authority' IN def) = 0
                          AND position('add_own_school_membership_with_class_history' IN def) > 0
                          AND position('school-roster-2026-09-28' IN def) > 0
                          AND position('INVALID_SCHOOL_ROSTER_PREFERENCE' IN def) > 0
                          AND position('SECURITY DEFINER' IN def) > 0
                        FROM roster_fn),
      'md5', (SELECT md5(def) FROM roster_fn),
      'definition', (SELECT def FROM roster_fn)
    ),
    'search_schools_with_activity', jsonb_build_object(
      'result_columns', pg_get_function_result(to_regprocedure('public.search_schools_with_activity(text,integer)')),
      'matches_repo', (SELECT def IS NOT NULL
                          AND position('SELECT * FROM public.search_schools_v2' IN def) > 0
                          AND position('school_search_started' IN def) > 0
                          AND position('EXCEPTION WHEN OTHERS' IN def) = 0
                        FROM search_fn),
      'md5', (SELECT md5(def) FROM search_fn),
      'definition', (SELECT def FROM search_fn)
    )
  ),

  -- 4) migration 이력: 4개 중 이미 기록된 것(기대: 없음)과 최근 8건(기대: 맨 위 20261014101616)
  'migrations', jsonb_build_object(
    'already_recorded', (
      SELECT coalesce(jsonb_agg(version ORDER BY version), '[]'::jsonb)
      FROM supabase_migrations.schema_migrations
      WHERE version IN ('20261006091303', '20261022120000', '20261022130000', '20261023100000')),
    'latest_8', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version DESC), '[]'::jsonb)
      FROM (SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 8) recent)
  )
)) AS precheck;
