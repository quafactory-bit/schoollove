-- v2-01 후속: search_schools_with_activity가 항상 실패하던 문제를 고친다. 추가만 하는 migration(기존 파일 수정 없음).
-- 원인(2026-10-23 Preview 읽기 전용 조회로 확인): search_schools_v2는 `SETOF schools`(12개 컬럼,
-- address가 slug보다 앞, 끝에 search_blob·current_level·level_updated_at)를 돌려주는데, 래퍼는
-- 9개 컬럼(slug가 address보다 앞)을 선언하고 `SELECT *`로 넘겨 RETURN QUERY 형식 불일치로 실패했다.
-- 수정: 선언한 9개 컬럼을 이름으로 골라 같은 순서·타입으로 돌려준다. 통계 기록은 선택 사항이므로
-- 실패해도 검색 결과를 막지 않게 별도 예외 블록에 둔다. 반환 형식·권한·인자는 그대로다.
BEGIN;

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

COMMIT;
