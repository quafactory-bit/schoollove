-- v2-04: 로그인 전 학교 페이지의 졸업연도별 등록 수. 숫자만 반환하고 이름·ID 등 개인 식별 컬럼은 반환하지 않는다.
-- 명단 표시를 켠(동의 철회 전) 활성 비공개 프로필의 학교 이력만 센다. 추가만 하는 migration.
BEGIN;

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

COMMIT;
