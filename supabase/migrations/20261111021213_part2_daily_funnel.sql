-- Approved Part 2 aggregate only. Existing schemas, functions and data are untouched.
BEGIN;
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
COMMIT;
