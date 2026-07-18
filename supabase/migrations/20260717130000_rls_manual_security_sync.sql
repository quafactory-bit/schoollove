-- =====================================================
-- 운영 DB 수동 RLS/권한 변경 사항을 저장소 migration으로 동기화
--
-- 이 migration은 새 기능을 추가하지 않는다. Supabase Dashboard SQL Editor에서
-- 이미 수동으로 적용된 것으로 확인된 public 스키마 보안 상태(테이블 권한,
-- RLS 정책, 제약조건)를 저장소 migration 파일로 "기록"하기 위한 것이다.
-- 기존 데이터는 전혀 건드리지 않는다(INSERT/UPDATE/DELETE/TRUNCATE 없음).
-- 테이블/컬럼을 새로 만들지 않는다(DDL은 ENABLE RLS, REVOKE/GRANT, 정책,
-- 제약조건 추가로 한정).
--
-- 이미 운영에 적용된 상태에서 다시 실행해도 안전하도록(idempotent) 작성했다:
--   - ALTER TABLE ... ENABLE ROW LEVEL SECURITY: 이미 켜져 있어도 오류 없음
--   - REVOKE/GRANT: 이미 그 상태여도 오류 없음
--   - DROP POLICY IF EXISTS 후 CREATE POLICY: 재실행해도 동일한 최종 상태
--   - 제약조건은 pg_constraint에 이름이 있는지 먼저 확인하는 DO 블록으로 추가
--     (Postgres는 ADD CONSTRAINT ... IF NOT EXISTS 구문을 지원하지 않는다)
--
-- 20260717120000_search_logs_aggregate_rpc.sql이 이미 만든
-- get_school_search_count() 함수/권한, "anon can read search_logs counts"
-- 정책 제거, search_logs SELECT REVOKE와 충돌하지 않는다(아래 4번 섹션 참고).
--
-- 이 파일은 이번 세션에서 원격 Supabase에 적용하지 않았다.
-- =====================================================

-- ─── 1. public.reports ──────────────────────────────
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- anon/authenticated의 테이블 전체 권한(SELECT/UPDATE/DELETE/TRUNCATE/TRIGGER/
-- REFERENCES 포함)을 우선 모두 회수한다.
REVOKE ALL ON TABLE public.reports FROM anon, authenticated;

-- 신고 접수에 필요한 컬럼에만 INSERT를 허용한다. id/status/created_at은
-- 컬럼 권한 목록에 없으므로 anon/authenticated가 직접 값을 지정할 수 없고,
-- 컬럼 기본값(status DEFAULT 'pending' 등)이 그대로 적용된다.
GRANT INSERT (profile_id, type, reason, requested_instagram_id, is_self_claimed)
  ON public.reports TO anon, authenticated;

DROP POLICY IF EXISTS "anon can read all reports" ON public.reports;
DROP POLICY IF EXISTS "anon can update report status" ON public.reports;
DROP POLICY IF EXISTS "temp service role delete" ON public.reports;
DROP POLICY IF EXISTS "reports_insert" ON public.reports;

CREATE POLICY "reports_insert" ON public.reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');

-- handle_report_count() 함수/트리거 자체는 그대로 두고, anon/authenticated가
-- 직접 함수를 호출할 수 있는 경로만 차단한다(트리거를 통한 내부 실행은
-- 트리거 정의자의 권한으로 동작하므로 영향받지 않는다).
-- 주의: 이 함수의 실제 파라미터 시그니처는 저장소 코드/스키마 파일에 없어
-- (운영 DB에만 존재) 트리거 함수의 표준 형태(무인자, RETURNS trigger)로
-- 가정했다 — 원격 적용 전 실제 시그니처를 Supabase 대시보드에서 재확인할 것.
REVOKE EXECUTE ON FUNCTION public.handle_report_count() FROM PUBLIC, anon, authenticated;

-- ─── 2. public.profiles ─────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;

GRANT SELECT ON public.profiles TO anon, authenticated;

-- id/created_at/report_count/is_hidden은 컬럼 권한 목록에 없으므로
-- anon/authenticated가 직접 입력할 수 없고, 컬럼 기본값(각각 uuid_generate_v4(),
-- now(), 0, false)이 적용된다 — 아래 profiles_insert 정책의 WITH CHECK와도 일치한다.
GRANT INSERT (
  school_id, graduation_year, grade, class_number, department,
  student_year, nickname, instagram_id, description, is_self, message
) ON public.profiles TO anon, authenticated;

DROP POLICY IF EXISTS "admin_can_delete_profiles" ON public.profiles;
DROP POLICY IF EXISTS "anon can read all profiles for admin" ON public.profiles;
DROP POLICY IF EXISTS "anon can update profile flags" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_visible" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

CREATE POLICY "profiles_read" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (is_hidden = false);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO anon, authenticated
  WITH CHECK (is_hidden = false AND report_count = 0);

-- ─── 3. public.schools ───────────────────────────────
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.schools FROM anon, authenticated;

GRANT SELECT ON public.schools TO anon, authenticated;

DROP POLICY IF EXISTS "schools_select_all" ON public.schools;
DROP POLICY IF EXISTS "schools_read" ON public.schools;

CREATE POLICY "schools_read" ON public.schools
  FOR SELECT TO anon, authenticated
  USING (true);

-- ─── 4. public.search_logs ───────────────────────────
-- 20260717120000_search_logs_aggregate_rpc.sql이 이미 REVOKE SELECT와
-- "anon can read search_logs counts" 정책 제거를 적용했다. 여기서는 그 결과를
-- 재확인(재실행해도 동일 결과)하고, INSERT 경로의 컬럼 권한/정책/제약조건까지
-- 마저 정리한다 — get_school_search_count()의 EXECUTE 권한은 건드리지 않는다.
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.search_logs FROM anon, authenticated;

-- id/created_at은 컬럼 권한 목록에 없으므로 직접 입력 불가(기본값 적용).
GRANT INSERT (query, result_count, clicked_school_id)
  ON public.search_logs TO anon, authenticated;

DROP POLICY IF EXISTS "Allow anon insert" ON public.search_logs;
DROP POLICY IF EXISTS "anon can read search_logs counts" ON public.search_logs;
DROP POLICY IF EXISTS "search_logs_insert" ON public.search_logs;

CREATE POLICY "search_logs_insert" ON public.search_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(btrim(query)) BETWEEN 1 AND 100
    AND (result_count IS NULL OR result_count >= 0)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'search_logs_query_length_check'
  ) THEN
    ALTER TABLE public.search_logs
      ADD CONSTRAINT search_logs_query_length_check
      CHECK (char_length(btrim(query)) BETWEEN 1 AND 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'search_logs_result_count_check'
  ) THEN
    ALTER TABLE public.search_logs
      ADD CONSTRAINT search_logs_result_count_check
      CHECK (result_count IS NULL OR result_count >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'search_logs_clicked_school_id_fkey'
  ) THEN
    ALTER TABLE public.search_logs
      ADD CONSTRAINT search_logs_clicked_school_id_fkey
      FOREIGN KEY (clicked_school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 5. public.traces ────────────────────────────────
ALTER TABLE public.traces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.traces FROM anon, authenticated;

GRANT SELECT ON public.traces TO anon, authenticated;

-- id/created_at/is_hidden/report_count는 컬럼 권한 목록에 없으므로
-- 직접 입력 불가(기본값 적용) — 아래 traces_insert_public의 WITH CHECK와 일치.
GRANT INSERT (school_id, graduation_year, grade, class_number, message)
  ON public.traces TO anon, authenticated;

DROP POLICY IF EXISTS "traces_select_public" ON public.traces;
DROP POLICY IF EXISTS "traces_insert_public" ON public.traces;

CREATE POLICY "traces_select_public" ON public.traces
  FOR SELECT TO anon, authenticated
  USING (is_hidden = false);

CREATE POLICY "traces_insert_public" ON public.traces
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    is_hidden = false
    AND report_count = 0
    AND char_length(message) BETWEEN 1 AND 40
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'traces_report_count_check'
  ) THEN
    ALTER TABLE public.traces
      ADD CONSTRAINT traces_report_count_check
      CHECK (report_count >= 0);
  END IF;
END $$;

-- ─── 6. service_role ─────────────────────────────────
-- service_role 권한은 이 migration에서 전혀 회수/축소하지 않는다(위 REVOKE ALL
-- 구문은 모두 anon, authenticated로만 대상을 한정했다). service_role은
-- Supabase 설정상 RLS를 우회하므로 별도 정책도 필요하지 않다.
