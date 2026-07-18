-- =====================================================
-- get_school_search_count 와일드카드 리터럴 처리 보정
-- docs/decisions/2026-07-17-search-logs-aggregate-rpc.md의
-- "Follow-up status — 2026-07-18" 참고
--
-- 배경: get_school_search_count의 ILIKE '%' || token || '%'가 사용자 토큰의
-- %, _, \를 리터럴이 아닌 ILIKE 패턴 문자로 처리하고 있었다. 이는 SQL
-- injection이 아니다 — 함수는 여전히 파라미터화된 SQL만 실행하고 원본 로그
-- 행을 반환하지 않는다. 실질 영향은 aggregate count 범위의 정확성뿐이다:
-- 이런 문자가 포함된 토큰이 들어오면 매칭 범위가 의도보다 넓어져(예: '_'가
-- 임의의 한 글자와 매칭, '%'가 전체와 매칭) 카운트가 실제보다 크게 나올 수
-- 있다.
--
-- 이 파일은 이번 세션에서 원격 Supabase에 적용하지 않았다.
--
-- 기존 20260717120000_search_logs_aggregate_rpc.sql은 원격에 이미 적용됐고
-- 로컬 파일과 원격 정의가 일치함이 확인된 상태이므로 수정하지 않는다. 이
-- 후속 migration에서 CREATE OR REPLACE로 함수 정의만 교체한다 — 함수명,
-- 인자, 반환 타입, LANGUAGE/STABLE/SECURITY DEFINER/search_path/권한 부여
-- 대상은 전부 그대로 유지한다.
-- =====================================================

-- ─── get_school_search_count(search_tokens text[]) 재정의 ───────────
-- 기존 공개 계약(함수명/인자/RETURNS integer)은 그대로 유지하면서 두 가지를
-- 보정한다:
--   1) 사용자 토큰의 %, _, \ 문자를 ILIKE 와일드카드가 아닌 리터럴 문자로
--      처리한다(이스케이프 순서: \ -> %  -> _, 뒤에서 설명).
--   2) 입력 배열 자체가 비정상적으로 큰 경우(cardinality > 20) defense-in-depth
--      차원에서 빈 집합으로 처리한다. 정상 앱 경로(schoolSearchTokens())는
--      구조적으로 최대 5개 토큰만 생성하므로 20은 충분한 여유이며, 기존
--      [1:8] 슬라이스가 이미 함수 내부 처리 비용을 완전히 상한선으로
--      막고 있으므로 이 가드는 payload 전송 비용 자체를 막지는 못한다
--      (그 방어는 PostgREST/플랫폼 계층의 몫이다) — 다만 명백히 비정상적인
--      입력에 대해 예외 없이 조용히 0을 반환하도록 의도를 명확히 한다.
create or replace function public.get_school_search_count(
  search_tokens text[]
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with limited_tokens as (
    select unnest(
      case
        when cardinality(
          coalesce(search_tokens, array[]::text[])
        ) > 20
          then array[]::text[]
        else (
          coalesce(search_tokens, array[]::text[])
        )[1:8]
      end
    ) as raw_token
  ),
  valid_tokens as (
    select distinct
      btrim(raw_token) as token
    from limited_tokens
    where length(btrim(raw_token)) between 2 and 100
  ),
  -- 순서가 중요하다: 사용자가 입력한 백슬래시부터 먼저 이중 이스케이프
  -- (\ -> \\)한 뒤에 %, _ 를 이스케이프해야 한다 — 순서를 바꾸면 %, _
  -- 이스케이프 과정에서 새로 만든 백슬래시가 다시 이스케이프되어 의미가
  -- 깨진다.
  escaped_tokens as (
    select
      replace(
        replace(
          replace(
            token,
            E'\\',
            E'\\\\'
          ),
          '%',
          E'\\%'
        ),
        '_',
        E'\\_'
      ) as escaped_token
    from valid_tokens
  ),
  token_counts as (
    select (
      select count(*)
      from public.search_logs sl
      where sl.query ilike (
        '%' || et.escaped_token || '%'
      ) escape E'\\'
    ) as cnt
    from escaped_tokens et
  )
  select coalesce(max(cnt), 0)::integer
  from token_counts;
$$;

comment on function public.get_school_search_count(text[]) is
  'search_logs 원문 대신 검색 횟수 집계값만 반환하는 읽기 전용 함수. id/query/created_at 등 개별 로그 행은 반환하지 않는다. 토큰의 %, _, \ 문자는 ILIKE 와일드카드가 아닌 리터럴 문자로 처리한다.';

-- CREATE OR REPLACE는 동일 시그니처일 때 기존 ACL을 보존하지만, 이 저장소는
-- 대시보드 수동 변경으로 권한이 드리프트된 전례가 있어(20260717130000의
-- 존재 자체가 그 증거) 방어적으로 다시 명시한다. 재실행해도 안전(멱등)하다.
revoke all
on function public.get_school_search_count(text[])
from public;

grant execute
on function public.get_school_search_count(text[])
to anon, authenticated, service_role;
