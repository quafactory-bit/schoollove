-- 운영 DB 적용 (2026-10-23 결정, v2 운영 배포). Supabase 운영 프로젝트 SQL Editor에서 이 파일 전체를 한 번 실행한다.
-- 01-precheck.sql 결과를 에이전트가 확인하고 "적용 가능"이라고 답한 뒤에만 실행한다.
-- 내용: 저장소 migration 4개(round-3 순서)를 한 트랜잭션으로 적용하고 supabase_migrations.schema_migrations에 4건 기록.
-- 각 파일의 본문은 저장소와 글자 단위로 같다. 파일 안의 BEGIN;/COMMIT;만 걷어내고 바깥에서 한 번만 감쌌다
-- (Postgres는 트랜잭션 중첩이 없어서, 안쪽 COMMIT이 있으면 중간에 확정돼 버린다).
-- 어느 한 문장이라도 실패하면 전체가 되돌아가고(ROLLBACK) 운영 DB는 적용 전과 같다.
BEGIN;

-- 0) 안전장치: 사전 조회 뒤 상태가 바뀌었으면 아무것도 하지 않고 멈춘다.
DO $guard$
BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: public.push_subscriptions already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
             WHERE version IN ('20261006091303','20261022120000','20261022130000','20261023100000')) THEN
    RAISE EXCEPTION 'ABORT: one of the 4 migrations is already recorded';
  END IF;
END
$guard$;

-- ===== 1/4: 20261006091303_pwa_phase2_push_subscriptions.sql =====
-- PWA Phase 2: server-only browser push subscriptions.
-- The public schema is exposed by Supabase, so client roles receive no grants
-- and no RLS policies. Only the backend service role may access these rows.

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) BETWEEN 1 AND 4096 AND endpoint ~ '^https://'),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 512),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 256),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO service_role;

-- Withdrawal removes every device subscription in the same transaction that
-- records the request. The Auth foreign key is a second deletion boundary.
CREATE OR REPLACE FUNCTION public.request_own_account_deletion()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  inserted_count integer;
BEGIN
  IF requester IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.push_subscriptions
  WHERE user_id = requester;

  UPDATE public.private_profiles
  SET status = 'deletion_requested', updated_at = clock_timestamp()
  WHERE owner_user_id = requester;

  INSERT INTO public.account_deletion_requests(user_id, reason, status)
  VALUES (requester, NULL, 'pending')
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 THEN
    PERFORM public.increment_public_account_metric(
      'account_deletion_requested',
      'account',
      'milestone'
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.request_own_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_own_account_deletion() TO authenticated;

-- ===== 2/4: 20261022120000_v2_graduation_year_rule.sql =====
-- v2-02: 졸업연도로 재학 중인 학교 등록을 막는다. 신규 등록에만 적용하고 기존 행은 건드리지 않는다.
-- 기존 migration은 수정하지 않는다. 새 helper를 추가하고 브라우저 진입점 RPC만 교체한다.
-- 고 ≤ Y-1, 중 ≤ Y-4, 초 ≤ Y-7, 대학·전문대학 ≤ Y, 하한 1950 (Y = Asia/Seoul 올해).

CREATE OR REPLACE FUNCTION public.is_graduation_year_allowed(
  requested_school_type text,
  requested_graduation_year integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT requested_graduation_year IS NOT NULL
    AND requested_graduation_year >= 1950
    AND requested_graduation_year <= extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer
      - CASE requested_school_type
          WHEN 'high' THEN 1
          WHEN 'middle' THEN 4
          WHEN 'elementary' THEN 7
          WHEN 'university' THEN 0
          WHEN 'college' THEN 0
        END;
$$;

CREATE OR REPLACE FUNCTION public.add_own_school_membership_with_roster(
  requested_school_id uuid,
  requested_graduation_year integer,
  requested_grade_classes jsonb,
  requested_roster_consent boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  saved jsonb;
  saved_membership_id uuid;
  school_type_authority text;
BEGIN
  IF requester IS NULL OR requested_roster_consent IS NULL
  THEN RAISE EXCEPTION 'INVALID_SCHOOL_ROSTER_PREFERENCE'; END IF;

  SELECT school.school_type INTO school_type_authority
  FROM public.schools school WHERE school.id = requested_school_id;
  IF school_type_authority IS NULL THEN RAISE EXCEPTION 'INVALID_SCHOOL_MEMBERSHIP'; END IF;
  IF NOT coalesce(public.is_graduation_year_allowed(school_type_authority, requested_graduation_year), false)
  THEN RAISE EXCEPTION 'CURRENT_STUDENT_GRADUATION_YEAR_NOT_ALLOWED'; END IF;

  saved := public.add_own_school_membership_with_class_history(
    requested_school_id,
    requested_graduation_year,
    requested_grade_classes
  );
  saved_membership_id := (saved ->> 'id')::uuid;

  IF requested_roster_consent THEN
    INSERT INTO public.school_roster_consents(
      membership_id, owner_user_id, policy_version, consented_at, withdrawn_at
    ) VALUES (
      saved_membership_id, requester, 'school-roster-2026-09-28', clock_timestamp(), NULL
    );
  END IF;

  RETURN saved || jsonb_build_object('roster_visible', requested_roster_consent);
END;
$$;

REVOKE ALL ON FUNCTION public.is_graduation_year_allowed(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_graduation_year_allowed(text,integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)
  TO authenticated, service_role;

-- ===== 3/4: 20261022130000_v2_school_year_counts.sql =====
-- v2-04: 로그인 전 학교 페이지의 졸업연도별 등록 수. 숫자만 반환하고 이름·ID 등 개인 식별 컬럼은 반환하지 않는다.
-- 명단 표시를 켠(동의 철회 전) 활성 비공개 프로필의 학교 이력만 센다. 추가만 하는 migration.

CREATE OR REPLACE FUNCTION public.school_year_counts_v2(p_school_id uuid)
RETURNS TABLE(graduation_year integer, count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT membership.graduation_year::integer, count(*)::integer
  FROM public.profile_school_memberships membership
  JOIN public.school_roster_consents consent
    ON consent.membership_id = membership.id
   AND consent.owner_user_id = membership.owner_user_id
   AND consent.withdrawn_at IS NULL
  JOIN public.private_profiles profile
    ON profile.id = membership.profile_id
   AND profile.owner_user_id = membership.owner_user_id
   AND profile.status = 'active'
  WHERE membership.school_id = p_school_id
  GROUP BY membership.graduation_year
  HAVING count(*) >= 1
  ORDER BY membership.graduation_year DESC;
$$;

REVOKE ALL ON FUNCTION public.school_year_counts_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.school_year_counts_v2(uuid) TO anon, authenticated, service_role;

-- ===== 4/4: 20261023100000_v2_search_schools_activity_wrapper_fix.sql =====
-- v2-01 후속: search_schools_with_activity가 항상 실패하던 문제를 고친다. 추가만 하는 migration(기존 파일 수정 없음).
-- 원인(2026-10-23 Preview 읽기 전용 조회로 확인): search_schools_v2는 `SETOF schools`(12개 컬럼,
-- address가 slug보다 앞, 끝에 search_blob·current_level·level_updated_at)를 돌려주는데, 래퍼는
-- 9개 컬럼(slug가 address보다 앞)을 선언하고 `SELECT *`로 넘겨 RETURN QUERY 형식 불일치로 실패했다.
-- 수정: 선언한 9개 컬럼을 이름으로 골라 같은 순서·타입으로 돌려준다. 통계 기록은 선택 사항이므로
-- 실패해도 검색 결과를 막지 않게 별도 예외 블록에 둔다. 반환 형식·권한·인자는 그대로다.

CREATE OR REPLACE FUNCTION public.search_schools_with_activity(q text, lim integer DEFAULT 20)
RETURNS TABLE(id uuid, school_name text, school_type text, sido text, sigungu text, slug text, address text, school_code text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF char_length(btrim(q)) < 2 OR lim NOT BETWEEN 1 AND 50 THEN RETURN; END IF;
  BEGIN
    PERFORM public.increment_public_account_metric('school_search_started', 'school_search', 'activity');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- optional statistics never block school search
  END;
  RETURN QUERY
    SELECT school.id::uuid, school.school_name::text, school.school_type::text, school.sido::text,
      school.sigungu::text, school.slug::text, school.address::text, school.school_code::text,
      school.created_at::timestamptz
    FROM public.search_schools_v2(q, lim) AS school;
END; $$;

REVOKE ALL ON FUNCTION public.search_schools_with_activity(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_schools_with_activity(text, integer) TO anon, authenticated, service_role;

-- ===== 이력 기록 (Preview 때와 같은 형식: version, name) =====
INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES
  ('20261006091303', 'pwa_phase2_push_subscriptions'),
  ('20261022120000', 'v2_graduation_year_rule'),
  ('20261022130000', 'v2_school_year_counts'),
  ('20261023100000', 'v2_search_schools_activity_wrapper_fix');

COMMIT;

-- 적용 직후 같은 창에서 확인(읽기 전용, 기대: 4건 / true / true / true / 'SELECT *' 없음 = true):
-- SELECT (SELECT count(*) FROM supabase_migrations.schema_migrations
--          WHERE version IN ('20261006091303','20261022120000','20261022130000','20261023100000')) AS recorded,
--        to_regclass('public.push_subscriptions') IS NOT NULL AS push_table,
--        public.is_graduation_year_allowed('high', 2025) AND NOT public.is_graduation_year_allowed('high', 2026) AS year_rule,
--        has_function_privilege('anon', 'public.school_year_counts_v2(uuid)', 'EXECUTE') AS anon_counts,
--        position('SELECT *' IN pg_get_functiondef('public.search_schools_with_activity(text,integer)'::regprocedure)) = 0 AS wrapper_fixed;
