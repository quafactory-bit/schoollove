-- =====================================================
-- School Growth Foundation Phase 1B — 주간/오늘 성장 순위 집계 RPC
-- docs/decisions/2026-07-15-school-growth-ranking-rpc.md 참고
--
-- 이 파일은 이번 세션에서 Supabase에 적용하지 않았다.
-- 적용 전 반드시 docs/decisions/2026-07-15-school-growth-ranking-rpc.md의
-- "Supabase 적용 전 수동 검토 항목"을 확인할 것.
-- =====================================================

-- ─── 1. 부분 인덱스 ─────────────────────────────────
-- 대상 쿼리: is_hidden = false AND created_at BETWEEN ... GROUP BY school_id
-- 기존 idx_profiles_created(created_at DESC)는 is_hidden 조건과 school_id 그룹화를
-- 지원하지 못해 실질적으로 동일하지 않다 — 부분 인덱스를 새로 추가한다.
-- 컬럼 순서 근거:
--   1) created_at DESC 선두: 이 쿼리의 WHERE 조건이 "최근 N일" 범위 필터이므로
--      전체 이력 대비 선택도가 가장 높다. is_hidden은 대부분 false라 선두 컬럼으로
--      두어도 선택도 이득이 적어, 대신 부분 인덱스 조건(WHERE is_hidden = false)으로
--      아예 물리적으로 제외한다.
--   2) school_id 후행: 기간으로 좁힌 뒤 GROUP BY school_id 집계를 지원한다.
--   3) DESC 방향: "가장 최근 등록 시각"(MAX)과 최신순 스캔에도 그대로 도움이 된다.
CREATE INDEX IF NOT EXISTS idx_profiles_visible_created_school
  ON profiles (created_at DESC, school_id)
  WHERE is_hidden = false;

-- ─── 2. school_growth_ranking_v1 RPC ───────────────
-- 기간(p_since ~ p_until) 동안 신규 공개(is_hidden=false) 프로필이 있었던 학교를
-- 신규 수 내림차순으로 최대 p_limit개 반환한다.
--
-- 주간 순위와 "오늘 가장 빠르게 성장한 학교"는 이 함수 하나를 재사용한다
-- (p_since/p_limit만 다르게 호출) — 거의 동일한 RPC를 두 개 만들지 않기 위함.
--
-- visible_profile_count(학교의 전체 공개 프로필 수, 기간과 무관)를 함께 반환하는 이유:
-- TypeScript 계약(types/ranking.ts)의 remainingToNext는 기간 내 신규 수가 아니라
-- 전체 누적 인원 기준으로 계산해야 하는데(lib/policy/schoolGrowth.ts와 동일 정의),
-- 이를 애플리케이션에서 학교별로 다시 조회하면 N+1이 되므로 이 함수 안에서
-- (이미 p_limit으로 좁혀진) 최종 결과 행에 한해서만 상관 서브쿼리로 채운다.
CREATE OR REPLACE FUNCTION public.school_growth_ranking_v1(
  p_since timestamptz,
  p_until timestamptz DEFAULT now(),
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  school_id uuid,
  school_name text,
  slug text,
  new_visible_profiles bigint,
  most_recent_registration_at timestamptz,
  current_level integer,
  visible_profile_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH period_activity AS (
    SELECT
      p.school_id,
      COUNT(*) AS new_visible_profiles,
      MAX(p.created_at) AS most_recent_registration_at
    FROM profiles p
    WHERE p.is_hidden = false
      AND p.created_at >= p_since
      AND p.created_at <= LEAST(p_until, now())
    GROUP BY p.school_id
  ),
  ranked AS (
    SELECT
      pa.school_id,
      s.school_name,
      s.slug,
      pa.new_visible_profiles,
      pa.most_recent_registration_at,
      s.current_level
    FROM period_activity pa
    JOIN schools s ON s.id = pa.school_id
    ORDER BY
      pa.new_visible_profiles DESC,
      pa.most_recent_registration_at DESC,
      s.school_name ASC,
      s.id ASC
    -- p_limit에 안전한 최소·최대 제한(1~50)을 적용한다. NULL이면 기본 5.
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 50)
  )
  SELECT
    r.school_id,
    r.school_name,
    r.slug,
    r.new_visible_profiles,
    r.most_recent_registration_at,
    r.current_level,
    (
      SELECT COUNT(*)
      FROM profiles vp
      WHERE vp.school_id = r.school_id
        AND vp.is_hidden = false
    ) AS visible_profile_count
  FROM ranked r
  -- ranked CTE 내부의 ORDER BY는 LIMIT 대상만 결정할 뿐 최종 반환 순서를 보장하지
  -- 않는다(PostgreSQL은 CTE의 정렬을 바깥 쿼리에 전파한다고 보장하지 않음) — 그래서
  -- 최종 SELECT에도 동일한 결정적 정렬을 다시 명시한다.
  ORDER BY
    r.new_visible_profiles DESC,
    r.most_recent_registration_at DESC,
    r.school_name ASC,
    r.school_id ASC;
$$;

COMMENT ON FUNCTION public.school_growth_ranking_v1(timestamptz, timestamptz, integer) IS
  'School Growth Foundation Phase 1B — 기간 내 신규 공개 프로필 수 기준 학교 순위. 개인 식별 가능한 프로필 필드는 반환하지 않는 읽기 전용 집계 함수.';

-- ─── 3. 실행 권한 ───────────────────────────────────
-- SECURITY INVOKER이므로 호출자(anon/authenticated)가 schools/profiles에 대해
-- 이미 가진 SELECT 권한 + RLS(schools_select_all, profiles_select_visible)가 그대로 적용된다.
-- service_role 전용으로 제한하지 않는다 — 공개 Home에서 anon으로 호출해야 한다.
REVOKE ALL ON FUNCTION public.school_growth_ranking_v1(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.school_growth_ranking_v1(timestamptz, timestamptz, integer) TO anon, authenticated;
