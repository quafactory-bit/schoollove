-- =====================================================
-- search_logs 원문 공개 조회 제거 + 집계 전용 RPC 도입
-- docs/decisions/2026-07-17-search-logs-aggregate-rpc.md 참고
--
-- 배경: search_logs는 anon에게 SELECT가 열려 있어(테이블 GRANT 또는 RLS 정책)
-- query 원문 + created_at 등 개별 로그 행이 외부에 그대로 노출될 수 있었다.
-- School Hub에는 "검색 횟수" 숫자만 필요하므로, 원본 행 조회를 막고
-- SECURITY DEFINER 집계 함수 하나로만 접근하도록 좁힌다.
--
-- 이 파일은 이번 세션에서 원격 Supabase에 적용하지 않았다.
-- =====================================================

-- ─── 1. get_school_search_count(search_tokens text[]) ───────────────
-- 여러 후보 토큰(lib/api/search.ts의 schoolSearchTokens 결과) 중 가장 많이
-- 매칭된 카운트를 반환한다. 개별 로그 행(id/query/created_at)은 절대 반환하지 않는다.
--
-- 입력 정제 순서(애플리케이션과 동일한 의미를 SQL에서도 유지):
--   1) 앞에서부터 최대 8개 토큰만 사용 (search_tokens[1:8])
--   2) btrim 후 길이 2~100인 토큰만 사용
--   3) 중복 토큰 제거
-- 위 조건을 만족하는 토큰이 하나도 없으면(또는 입력이 NULL이면) 0을 반환한다.
CREATE OR REPLACE FUNCTION public.get_school_search_count(search_tokens text[])
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH limited_tokens AS (
    SELECT unnest((COALESCE(search_tokens, ARRAY[]::text[]))[1:8]) AS raw_token
  ),
  valid_tokens AS (
    SELECT DISTINCT btrim(raw_token) AS token
    FROM limited_tokens
    WHERE length(btrim(raw_token)) BETWEEN 2 AND 100
  ),
  token_counts AS (
    SELECT (
      SELECT COUNT(*)
      FROM public.search_logs sl
      WHERE sl.query ILIKE '%' || vt.token || '%'
    ) AS cnt
    FROM valid_tokens vt
  )
  SELECT COALESCE(MAX(cnt), 0)::integer FROM token_counts;
$$;

COMMENT ON FUNCTION public.get_school_search_count(text[]) IS
  'search_logs 원문 대신 검색 횟수 집계값만 반환하는 읽기 전용 함수. id/query/created_at 등 개별 로그 행은 반환하지 않는다.';

-- SECURITY DEFINER 함수는 소유자(테이블 owner, 보통 postgres) 권한으로 실행되어
-- search_logs에 대한 anon SELECT REVOKE와 무관하게 계속 집계를 계산할 수 있다.
REVOKE ALL ON FUNCTION public.get_school_search_count(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_search_count(text[]) TO anon, authenticated, service_role;

-- ─── 2. search_logs 원본 공개 조회 제거 ──────────────────────────────
-- 운영 대시보드에서 확인된 기존 공개 조회 정책이 있다면 제거한다(없으면 no-op).
DROP POLICY IF EXISTS "anon can read search_logs counts" ON public.search_logs;

-- RLS 정책 유무와 무관하게, 테이블 단위 SELECT 권한 자체를 회수해
-- anon/authenticated가 search_logs를 직접 조회할 수 없도록 한다.
-- search_logs_insert 정책과 컬럼 단위 INSERT 권한은 그대로 유지한다(변경 없음).
-- service_role 권한도 변경하지 않는다.
REVOKE SELECT ON public.search_logs FROM anon, authenticated;
