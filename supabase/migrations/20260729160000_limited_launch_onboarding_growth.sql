-- PHASE 10H: adult-only limited launch onboarding and aggregate growth operations.
-- No raw email, name, Instagram, school name, search query, IP, referrer, or raw UTM is stored.

CREATE TABLE public.beta_onboarding_progress (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid NOT NULL REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_key text NOT NULL CHECK (stage_key IN (
    'adult_required','consent_required','invite_required','approval_pending','access_paused',
    'profile_required','school_required','ready'
  )),
  source_channel text NOT NULL DEFAULT 'unknown' CHECK (source_channel IN (
    'direct','organic_social','creator','community','referral','paid_social','unknown'
  )),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  profile_ready_at timestamptz,
  school_ready_at timestamptz,
  ready_at timestamptz,
  UNIQUE(program_id,user_id)
);
CREATE INDEX beta_onboarding_progress_stage_idx ON public.beta_onboarding_progress(stage_key,last_synced_at DESC);

CREATE TABLE public.beta_onboarding_stage_events (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  progress_id uuid NOT NULL REFERENCES public.beta_onboarding_progress(id) ON DELETE CASCADE,
  stage_key text NOT NULL CHECK (stage_key IN (
    'adult_required','consent_required','invite_required','approval_pending','access_paused',
    'profile_required','school_required','ready'
  )),
  source_channel text NOT NULL CHECK (source_channel IN (
    'direct','organic_social','creator','community','referral','paid_social','unknown'
  )),
  entered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(progress_id,stage_key)
);

CREATE TABLE public.beta_growth_daily_metrics (
  metric_date date NOT NULL,
  source_channel text NOT NULL CHECK (source_channel IN (
    'direct','organic_social','creator','community','referral','paid_social','unknown'
  )),
  stage_key text NOT NULL CHECK (stage_key IN (
    'adult_required','consent_required','invite_required','approval_pending','access_paused',
    'profile_required','school_required','ready'
  )),
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(metric_date,source_channel,stage_key)
);

CREATE OR REPLACE FUNCTION public.sync_own_beta_onboarding_state(
  actor_user_id uuid, requested_source text DEFAULT 'unknown'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  program_row public.beta_programs%ROWTYPE;
  member_status text;
  adult_ready boolean;
  consent_ready boolean;
  profile_ready boolean;
  school_ready boolean;
  discovery_ready boolean;
  next_stage text;
  target_progress_id uuid;
  effective_source text;
  event_inserted integer;
BEGIN
  IF actor_user_id IS NULL OR NOT (
    auth.uid()=actor_user_id OR auth.role()='service_role' OR session_user='postgres'
  ) THEN RAISE EXCEPTION 'ONBOARDING_ACCESS_DENIED'; END IF;
  IF requested_source NOT IN ('direct','organic_social','creator','community','referral','paid_social','unknown')
    THEN RAISE EXCEPTION 'INVALID_ONBOARDING_SOURCE'; END IF;

  SELECT p.* INTO program_row FROM public.beta_programs p
  WHERE p.status IN ('active','paused') AND p.emergency_disabled_at IS NULL
    AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now())
  ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END,p.created_at LIMIT 1;
  IF program_row.id IS NULL THEN
    RETURN jsonb_build_object('stage','access_paused','programAvailable',false,'adultReady',false,
      'consentsReady',false,'memberStatus',NULL,'profileReady',false,'schoolReady',false,'discoveryReady',false);
  END IF;

  SELECT m.status INTO member_status FROM public.beta_members m
  WHERE m.program_id=program_row.id AND m.user_id=actor_user_id;
  adult_ready:=EXISTS(SELECT 1 FROM public.adult_eligibility_records a
    WHERE a.user_id=actor_user_id AND a.adult_eligible=true
      AND a.verification_method='self_attestation' AND a.policy_version='phase10b-2026-07-28');
  consent_ready:=NOT EXISTS(
    SELECT required_type FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
    WHERE NOT EXISTS(SELECT 1 FROM public.consent_records c WHERE c.user_id=actor_user_id
      AND c.consent_type=required_type AND c.consented=true AND c.policy_version='phase10b-2026-07-28')
  );
  profile_ready:=EXISTS(SELECT 1 FROM public.private_profiles p
    WHERE p.owner_user_id=actor_user_id AND p.status='active' AND p.profile_visibility='private');
  school_ready:=EXISTS(SELECT 1 FROM public.profile_school_memberships m
    WHERE m.owner_user_id=actor_user_id AND m.graduation_year<=extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer);
  discovery_ready:=member_status='active' AND adult_ready AND consent_ready AND profile_ready AND school_ready
    AND public.has_beta_feature_access(actor_user_id,'people_search');

  next_stage:=CASE
    WHEN program_row.status<>'active' THEN 'access_paused'
    WHEN NOT adult_ready THEN 'adult_required'
    WHEN NOT consent_ready THEN 'consent_required'
    WHEN member_status IS NULL THEN 'invite_required'
    WHEN member_status='pending_review' THEN 'approval_pending'
    WHEN member_status<>'active' THEN 'access_paused'
    WHEN NOT profile_ready THEN 'profile_required'
    WHEN NOT school_ready THEN 'school_required'
    WHEN NOT discovery_ready THEN 'access_paused'
    ELSE 'ready'
  END;

  INSERT INTO public.beta_onboarding_progress(
    program_id,user_id,stage_key,source_channel,activated_at,profile_ready_at,school_ready_at,ready_at
  ) VALUES(
    program_row.id,actor_user_id,next_stage,requested_source,
    CASE WHEN member_status='active' THEN now() END,
    CASE WHEN profile_ready THEN now() END,
    CASE WHEN school_ready THEN now() END,
    CASE WHEN discovery_ready THEN now() END
  )
  ON CONFLICT(program_id,user_id) DO UPDATE SET
    stage_key=excluded.stage_key,
    source_channel=CASE WHEN public.beta_onboarding_progress.source_channel='unknown'
      THEN excluded.source_channel ELSE public.beta_onboarding_progress.source_channel END,
    last_synced_at=now(),
    activated_at=COALESCE(public.beta_onboarding_progress.activated_at,excluded.activated_at),
    profile_ready_at=COALESCE(public.beta_onboarding_progress.profile_ready_at,excluded.profile_ready_at),
    school_ready_at=COALESCE(public.beta_onboarding_progress.school_ready_at,excluded.school_ready_at),
    ready_at=COALESCE(public.beta_onboarding_progress.ready_at,excluded.ready_at)
  RETURNING id,source_channel INTO target_progress_id,effective_source;

  INSERT INTO public.beta_onboarding_stage_events(progress_id,stage_key,source_channel)
  VALUES(target_progress_id,next_stage,effective_source) ON CONFLICT(progress_id,stage_key) DO NOTHING;
  GET DIAGNOSTICS event_inserted=ROW_COUNT;
  IF event_inserted=1 THEN
    INSERT INTO public.beta_growth_daily_metrics(metric_date,source_channel,stage_key,count)
    VALUES((now() AT TIME ZONE 'Asia/Seoul')::date,effective_source,next_stage,1)
    ON CONFLICT(metric_date,source_channel,stage_key) DO UPDATE
      SET count=public.beta_growth_daily_metrics.count+1,updated_at=now();
  END IF;

  RETURN jsonb_build_object(
    'stage',next_stage,'programAvailable',true,'adultReady',adult_ready,'consentsReady',consent_ready,
    'memberStatus',member_status,'profileReady',profile_ready,'schoolReady',school_ready,
    'discoveryReady',discovery_ready,'source',effective_source
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_limited_launch_funnel(
  requested_start date, requested_end date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF requested_start IS NULL OR requested_end IS NULL OR requested_start>requested_end
    OR requested_end>requested_start+90 THEN RAISE EXCEPTION 'INVALID_FUNNEL_PERIOD'; END IF;
  SELECT jsonb_build_object(
    'currentStages',COALESCE((SELECT jsonb_agg(row_to_json(s) ORDER BY s.stage_key,s.source_channel) FROM (
      SELECT stage_key,source_channel,count(*)::integer AS count
      FROM public.beta_onboarding_progress GROUP BY stage_key,source_channel
    ) s),'[]'::jsonb),
    'dailyEntries',COALESCE((SELECT jsonb_agg(row_to_json(d) ORDER BY d.metric_date,d.stage_key,d.source_channel) FROM (
      SELECT metric_date,stage_key,source_channel,count
      FROM public.beta_growth_daily_metrics WHERE metric_date BETWEEN requested_start AND requested_end
    ) d),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.run_phase10h_maintenance(
  requested_run_key text, requested_as_of timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE run_id uuid; retention jsonb; affected integer; result_json jsonb;
BEGIN
  IF char_length(requested_run_key) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'INVALID_RUN_KEY'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase10h-maintenance',0));
  SELECT j.id,j.result INTO run_id,result_json FROM public.operational_job_runs j WHERE j.run_key=requested_run_key;
  IF run_id IS NOT NULL THEN RETURN result_json||jsonb_build_object('idempotent',true); END IF;
  INSERT INTO public.operational_job_runs(job_key,run_key) VALUES('phase10h_maintenance',requested_run_key) RETURNING id INTO run_id;
  SELECT rules INTO retention FROM public.retention_policy_versions WHERE policy_key='phase10h' AND status='active';
  IF retention IS NULL THEN RAISE EXCEPTION 'RETENTION_POLICY_MISSING'; END IF;
  DELETE FROM public.beta_growth_daily_metrics
    WHERE metric_date < (requested_as_of AT TIME ZONE 'Asia/Seoul')::date-(retention->>'aggregate_days')::integer;
  GET DIAGNOSTICS affected=ROW_COUNT;
  result_json:=jsonb_build_object('ok',true,'growth_metrics_deleted',affected);
  UPDATE public.operational_job_runs SET status='succeeded',finished_at=now(),result=result_json WHERE id=run_id;
  RETURN result_json;
EXCEPTION WHEN OTHERS THEN
  IF run_id IS NOT NULL THEN UPDATE public.operational_job_runs SET status='failed',finished_at=now(),safe_error_code='PHASE10H_MAINTENANCE_FAILED' WHERE id=run_id; END IF;
  RAISE;
END; $$;

ALTER TABLE public.beta_onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_onboarding_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_growth_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_onboarding_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beta_onboarding_stage_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beta_growth_daily_metrics FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.beta_onboarding_progress,public.beta_onboarding_stage_events,
  public.beta_growth_daily_metrics FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.beta_onboarding_progress,public.beta_onboarding_stage_events,
  public.beta_growth_daily_metrics TO service_role;
GRANT SELECT ON public.beta_onboarding_progress TO authenticated;
CREATE POLICY beta_onboarding_progress_owner_select ON public.beta_onboarding_progress
  FOR SELECT TO authenticated USING(user_id=auth.uid());

REVOKE ALL ON FUNCTION public.sync_own_beta_onboarding_state(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_get_limited_launch_funnel(date,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.run_phase10h_maintenance(text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_own_beta_onboarding_state(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_limited_launch_funnel(date,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_phase10h_maintenance(text,timestamptz) TO service_role;

INSERT INTO public.retention_policy_versions(policy_key,version,status,rules,approved_by)
VALUES('phase10h',1,'active',jsonb_build_object(
  'user_progress_retention','account_lifetime','stage_event_retention','account_lifetime','aggregate_days',400
),'migration:phase10h')
ON CONFLICT(policy_key,version) DO NOTHING;
