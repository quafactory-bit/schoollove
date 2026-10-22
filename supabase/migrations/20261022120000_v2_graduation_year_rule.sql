-- v2-02: 졸업연도로 재학 중인 학교 등록을 막는다. 신규 등록에만 적용하고 기존 행은 건드리지 않는다.
-- 기존 migration은 수정하지 않는다. 새 helper를 추가하고 브라우저 진입점 RPC만 교체한다.
-- 고 ≤ Y-1, 중 ≤ Y-4, 초 ≤ Y-7, 대학·전문대학 ≤ Y, 하한 1950 (Y = Asia/Seoul 올해).
BEGIN;

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

COMMIT;
