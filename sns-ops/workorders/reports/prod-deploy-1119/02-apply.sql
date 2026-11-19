-- 운영(schoollovei, ucnybhzpbatzcipwqtox) 적용 2026-11-19, Part 2 1차 운영 배포.
-- migration 2개를 저장소 본문 그대로(안쪽 BEGIN/COMMIT만 걷어냄) 한 트랜잭션으로 적용하고 이력 2건 기록.
--   20261111021213_part2_daily_funnel.sql      sha256 b392b2b433a52f195c18a258d784c745369cfba20e44e069fbf42574487fee4b
--   20261119030000_part2_p1_public_previews.sql sha256 5d9358b14b1cc3088f19daec3f553be0348b4909874a8957dfa80993ca5e7119
-- 어느 한 문장이라도 실패하면 전체 ROLLBACK, 운영 DB는 적용 전과 같다.
BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.part2_daily_funnel') IS NOT NULL THEN RAISE EXCEPTION 'ABORT: part2_daily_funnel already exists'; END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261111021213','20261119030000')) THEN RAISE EXCEPTION 'ABORT: already recorded'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'part2\_%') THEN RAISE EXCEPTION 'ABORT: part2 function exists'; END IF;
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) <> '20261023100000' THEN RAISE EXCEPTION 'ABORT: ledger changed since precheck'; END IF;
  IF md5(pg_get_functiondef(to_regprocedure('public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)'))) <> '9b5a31e775bbd7c59bc851294fd6153a' THEN RAISE EXCEPTION 'ABORT: owner function changed since precheck'; END IF;
END
$guard$;

-- ===== 1/2: 20261111021213_part2_daily_funnel.sql =====
-- Approved Part 2 aggregate only. Existing schemas, functions and data are untouched.
CREATE TABLE public.part2_daily_funnel (
  metric_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  event_key text NOT NULL CHECK (event_key IN (
    'landing_view','home_viewed','home_search_submitted','school_search_submitted',
    'school_result_selected','school_detail_viewed','chalkboard_initials_started',
    'google_login_started','google_login_completed','signup_completed',
    'summons_share_clicked','cohort_link_share_clicked'
  )),
  source_channel text NOT NULL CHECK (source_channel IN ('direct','instagram','threads','share','other')),
  browser_context text NOT NULL CHECK (browser_context IN ('external','instagram','threads','facebook','unknown')),
  school_id uuid REFERENCES public.schools(id),
  event_count bigint NOT NULL DEFAULT 1 CHECK (event_count > 0),
  CONSTRAINT part2_daily_funnel_key UNIQUE NULLS NOT DISTINCT
    (metric_date,event_key,source_channel,browser_context,school_id),
  CHECK ((event_key IN ('school_result_selected','school_detail_viewed','signup_completed','cohort_link_share_clicked')) = (school_id IS NOT NULL))
);
ALTER TABLE public.part2_daily_funnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part2_daily_funnel FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.part2_daily_funnel FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.part2_daily_funnel TO service_role;

CREATE FUNCTION public.part2_record_funnel_event(
  requested_event text,requested_source text,requested_browser text,requested_school_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF requested_event IS NULL OR requested_source IS NULL OR requested_browser IS NULL
    OR requested_event NOT IN ('landing_view','home_viewed','home_search_submitted','school_search_submitted',
      'school_result_selected','school_detail_viewed','chalkboard_initials_started',
      'google_login_started','google_login_completed','signup_completed','summons_share_clicked','cohort_link_share_clicked')
    OR requested_source NOT IN ('direct','instagram','threads','share','other')
    OR requested_browser NOT IN ('external','instagram','threads','facebook','unknown')
    OR ((requested_event IN ('school_result_selected','school_detail_viewed','signup_completed','cohort_link_share_clicked')) <> (requested_school_id IS NOT NULL))
  THEN RETURN false; END IF;
  IF requested_school_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.schools WHERE id=requested_school_id)
    THEN RETURN false; END IF;
  INSERT INTO public.part2_daily_funnel AS daily(event_key,source_channel,browser_context,school_id)
  VALUES(requested_event,requested_source,requested_browser,requested_school_id)
  ON CONFLICT ON CONSTRAINT part2_daily_funnel_key
  DO UPDATE SET event_count=daily.event_count+EXCLUDED.event_count;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.part2_record_funnel_event(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.part2_record_funnel_event(text,text,text,uuid) TO service_role;

-- New owner-safe wrapper; never replace the existing membership functions.
-- Lock the existing first-school milestone, delegate all existing checks/writes,
-- and isolate optional measurement errors after a successful membership save.
CREATE FUNCTION public.part2_add_own_school_membership(
  requested_school_id uuid,requested_graduation_year integer,requested_grade_classes jsonb,
  requested_roster_consent boolean,requested_source text,requested_browser text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid:=auth.uid();
  previous_first timestamptz;
  saved jsonb;
  previous_lock_timeout text:=current_setting('lock_timeout');
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  -- Match the original owner's lock order, including mixed-version callers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  SELECT school_membership_first_created_at INTO previous_first
  FROM public.adult_eligibility_records
  WHERE user_id=actor AND policy_version='phase10b-2026-07-28' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADULT_ELIGIBILITY_REQUIRED'; END IF;
  saved:=public.add_own_school_membership_with_roster(
    requested_school_id,requested_graduation_year,requested_grade_classes,requested_roster_consent
  );
  IF previous_first IS NULL THEN
    BEGIN
      PERFORM set_config('lock_timeout','1000ms',true);
      PERFORM public.part2_record_funnel_event('signup_completed',requested_source,requested_browser,requested_school_id);
      PERFORM set_config('lock_timeout',previous_lock_timeout,true);
    EXCEPTION WHEN query_canceled THEN NULL; WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN saved;
END; $$;
REVOKE ALL ON FUNCTION public.part2_add_own_school_membership(uuid,integer,jsonb,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.part2_add_own_school_membership(uuid,integer,jsonb,boolean,text,text) TO authenticated,service_role;
COMMENT ON TABLE public.part2_daily_funnel IS
  'KST daily aggregate counts only. No event IDs, account/session keys, personal text, URLs or user-agent text. Admin output suppresses small cells.';
-- One bounded MVCC snapshot avoids offset-pagination races during live writes.
CREATE FUNCTION public.part2_get_funnel_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(snapshot)), '[]'::jsonb)
  FROM (
    SELECT f.metric_date,f.event_key,f.source_channel,f.browser_context,f.school_id,f.event_count,
      CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('school_name',s.school_name,'slug',s.slug) END AS schools
    FROM public.part2_daily_funnel f LEFT JOIN public.schools s ON s.id=f.school_id
    WHERE f.metric_date BETWEEN ((now() AT TIME ZONE 'Asia/Seoul')::date-13) AND (now() AT TIME ZONE 'Asia/Seoul')::date
    ORDER BY f.metric_date,f.event_key,f.source_channel,f.browser_context,f.school_id NULLS FIRST
    LIMIT 20001
  ) snapshot;
$$;
REVOKE ALL ON FUNCTION public.part2_get_funnel_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.part2_get_funnel_snapshot() TO service_role;

-- ===== 2/2: 20261119030000_part2_p1_public_previews.sql =====
-- Part 2 P1: public previews for school detail, search and home.
-- Add-only: four new functions, no new table, no change to existing functions or data.
-- Names leave the database only as server-masked strings (first char + O + last char).

-- 1) Logged-out year preview: masked names only, at most 6, for roster-visible active profiles.
CREATE FUNCTION public.part2_year_masked_preview(p_school_id uuid, p_year integer)
RETURNS TABLE(masked_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
           WHEN char_length(clean.name) <= 1 THEN 'O'
           WHEN char_length(clean.name) = 2 THEN left(clean.name, 1) || 'O'
           ELSE left(clean.name, 1) || 'O' || right(clean.name, 1)
         END
  FROM (
    SELECT regexp_replace(btrim(profile.display_name), '\s+', '', 'g') AS name, consent.consented_at
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
      AND membership.graduation_year = p_year
  ) clean
  WHERE char_length(clean.name) > 0
  ORDER BY clean.consented_at DESC
  LIMIT 6;
$$;

-- 2) Search result badges: whether a school has any roster-visible member (counts are already public).
CREATE FUNCTION public.part2_school_roster_flags(p_school_ids uuid[])
RETURNS TABLE(school_id uuid, has_roster boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT requested.id, EXISTS (
    SELECT 1
    FROM public.profile_school_memberships membership
    JOIN public.school_roster_consents consent
      ON consent.membership_id = membership.id
     AND consent.owner_user_id = membership.owner_user_id
     AND consent.withdrawn_at IS NULL
    JOIN public.private_profiles profile
      ON profile.id = membership.profile_id
     AND profile.owner_user_id = membership.owner_user_id
     AND profile.status = 'active'
    WHERE membership.school_id = requested.id
  )
  FROM (SELECT DISTINCT unnest(p_school_ids[1:50]) AS id) requested;
$$;

-- 3) Home LIVE ticker + TOP 5. Hidden entirely when fewer than 5 roster check-ins in the last 7 days.
--    No names, no Instagram: school + graduation year + count only.
CREATE FUNCTION public.part2_home_attendance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recent_total integer;
  ticker jsonb;
  top_schools jsonb;
BEGIN
  SELECT count(*)::integer INTO recent_total
  FROM public.school_roster_consents consent
  JOIN public.profile_school_memberships membership
    ON membership.id = consent.membership_id AND membership.owner_user_id = consent.owner_user_id
  JOIN public.private_profiles profile
    ON profile.id = membership.profile_id AND profile.owner_user_id = membership.owner_user_id AND profile.status = 'active'
  WHERE consent.withdrawn_at IS NULL
    AND consent.consented_at >= now() - interval '7 days';

  IF recent_total < 5 THEN
    RETURN jsonb_build_object('visible', false);
  END IF;

  -- Order by most recent check-in, but never return the timestamp itself.
  SELECT coalesce(jsonb_agg(row_data ORDER BY latest DESC), '[]'::jsonb) INTO ticker
  FROM (
    SELECT jsonb_build_object(
      'school_name', school.school_name,
      'slug', school.slug,
      'graduation_year', membership.graduation_year,
      'count', count(*)::integer
    ) AS row_data,
    max(consent.consented_at) AS latest
    FROM public.school_roster_consents consent
    JOIN public.profile_school_memberships membership
      ON membership.id = consent.membership_id AND membership.owner_user_id = consent.owner_user_id
    JOIN public.private_profiles profile
      ON profile.id = membership.profile_id AND profile.owner_user_id = membership.owner_user_id AND profile.status = 'active'
    JOIN public.schools school ON school.id = membership.school_id
    WHERE consent.withdrawn_at IS NULL
      AND consent.consented_at >= now() - interval '7 days'
    GROUP BY school.id, school.school_name, school.slug, membership.graduation_year
    ORDER BY max(consent.consented_at) DESC
    LIMIT 8
  ) recent;

  SELECT coalesce(jsonb_agg(row_data ORDER BY (row_data->>'count')::integer DESC, row_data->>'school_name'), '[]'::jsonb) INTO top_schools
  FROM (
    SELECT jsonb_build_object('school_name', school.school_name, 'slug', school.slug, 'count', count(*)::integer) AS row_data
    FROM public.school_roster_consents consent
    JOIN public.profile_school_memberships membership
      ON membership.id = consent.membership_id AND membership.owner_user_id = consent.owner_user_id
    JOIN public.private_profiles profile
      ON profile.id = membership.profile_id AND profile.owner_user_id = membership.owner_user_id AND profile.status = 'active'
    JOIN public.schools school ON school.id = membership.school_id
    WHERE consent.withdrawn_at IS NULL
    GROUP BY school.id, school.school_name, school.slug
    ORDER BY count(*) DESC, school.school_name
    LIMIT 5
  ) ranked;

  RETURN jsonb_build_object('visible', true, 'recent_total', recent_total, 'ticker', ticker, 'top', top_schools);
END;
$$;

-- 4) "지금 동창들이 많이 찾는 학교" chips: last 7 days of search-result selections (Part 2 aggregate),
--    schools with at least 3 selections only. Server-only.
CREATE FUNCTION public.part2_popular_schools()
RETURNS TABLE(school_name text, slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT school.school_name, school.slug
  FROM public.part2_daily_funnel funnel
  JOIN public.schools school ON school.id = funnel.school_id
  WHERE funnel.event_key = 'school_result_selected'
    AND funnel.metric_date >= ((now() AT TIME ZONE 'Asia/Seoul')::date - 6)
  GROUP BY school.id, school.school_name, school.slug
  HAVING sum(funnel.event_count) >= 3
  ORDER BY sum(funnel.event_count) DESC, school.school_name
  LIMIT 6;
$$;

REVOKE ALL ON FUNCTION public.part2_year_masked_preview(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.part2_school_roster_flags(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.part2_home_attendance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.part2_popular_schools() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.part2_year_masked_preview(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_school_roster_flags(uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_home_attendance() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_popular_schools() TO service_role;


INSERT INTO supabase_migrations.schema_migrations(version, name) VALUES
  ('20261111021213', 'part2_daily_funnel'),
  ('20261119030000', 'part2_p1_public_previews');
DO $after$
BEGIN
  IF md5(pg_get_functiondef(to_regprocedure('public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)'))) <> '9b5a31e775bbd7c59bc851294fd6153a' THEN RAISE EXCEPTION 'ABORT: owner function changed during apply'; END IF;
END
$after$;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT to_jsonb(x)::text AS verify FROM (
  SELECT
    (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261111021213','20261119030000')) AS ledger_rows,
    (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.part2_daily_funnel'::regclass) AS funnel_rls_forced,
    has_table_privilege('anon','public.part2_daily_funnel','SELECT') OR has_table_privilege('authenticated','public.part2_daily_funnel','SELECT') AS client_can_read_funnel,
    (SELECT jsonb_object_agg(p.proname, jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'auth',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE')))
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'part2\_%') AS fn_privileges,
    public.part2_home_attendance() AS home_now
) x;
