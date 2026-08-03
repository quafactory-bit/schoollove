-- PHASE 10N-A: public account soft-launch boundary.
-- Forward-only. Applying this migration never opens registration: the singleton starts closed.

CREATE TABLE public.public_account_launch_control (
  control_key text PRIMARY KEY CHECK (control_key = 'public_account'),
  state text NOT NULL CHECK (state IN ('closed','internal_test','ready','open','emergency_stopped')),
  account_registration_enabled boolean NOT NULL DEFAULT false,
  private_profile_enabled boolean NOT NULL DEFAULT false,
  school_membership_enabled boolean NOT NULL DEFAULT false,
  emergency_stopped_at timestamptz,
  last_reason_code text NOT NULL CHECK (last_reason_code ~ '^[A-Z0-9_]{2,60}$'),
  updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state = 'open' AND account_registration_enabled AND private_profile_enabled AND school_membership_enabled)
    OR (state = 'internal_test' AND NOT account_registration_enabled AND private_profile_enabled AND school_membership_enabled)
    OR (state IN ('closed','ready','emergency_stopped') AND NOT account_registration_enabled AND NOT private_profile_enabled AND NOT school_membership_enabled)
  ),
  CHECK ((state = 'emergency_stopped') = (emergency_stopped_at IS NOT NULL))
);

INSERT INTO public.public_account_launch_control (
  control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,
  emergency_stopped_at,last_reason_code,updated_by
) VALUES (
  'public_account','closed',false,false,false,NULL,'MIGRATION_DEFAULT_CLOSED','migration'
);

CREATE TABLE public.public_account_launch_audit (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  action text NOT NULL CHECK (action IN ('state_changed','emergency_stopped','deletion_completed')),
  from_state text CHECK (from_state IS NULL OR from_state IN ('closed','internal_test','ready','open','emergency_stopped')),
  to_state text CHECK (to_state IS NULL OR to_state IN ('closed','internal_test','ready','open','emergency_stopped')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{2,60}$'),
  actor_reference text NOT NULL CHECK (char_length(actor_reference) BETWEEN 1 AND 100),
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (metadata = jsonb_strip_nulls(metadata))
);

CREATE TABLE public.public_account_daily_funnel (
  metric_date date NOT NULL,
  event_key text NOT NULL CHECK (event_key IN (
    'public_home_view','school_search_started','login_page_view','otp_request_accepted',
    'otp_verify_succeeded','adult_eligibility_completed','required_consents_completed',
    'private_profile_saved','school_membership_saved','onboarding_completed',
    'return_session','account_deletion_requested'
  )),
  source_channel text NOT NULL CHECK (source_channel IN ('direct','school_search','account','onboarding')),
  event_count bigint NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_date,event_key,source_channel)
);

ALTER TABLE public.public_account_launch_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_account_launch_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_account_daily_funnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_account_launch_control FORCE ROW LEVEL SECURITY;
ALTER TABLE public.public_account_launch_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.public_account_daily_funnel FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_account_launch_control,public.public_account_launch_audit,
  public.public_account_daily_funnel FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.public_account_launch_control,public.public_account_launch_audit,
  public.public_account_daily_funnel TO service_role;

CREATE UNIQUE INDEX adult_eligibility_records_user_policy_unique
  ON public.adult_eligibility_records(user_id,policy_version);
CREATE UNIQUE INDEX consent_records_user_type_policy_unique
  ON public.consent_records(user_id,consent_type,policy_version);

CREATE OR REPLACE FUNCTION public.get_public_account_launch_state()
RETURNS TABLE (
  state text,
  registration_enabled boolean,
  private_profile_enabled boolean,
  school_membership_enabled boolean,
  emergency_stopped boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT control.state,control.account_registration_enabled,control.private_profile_enabled,
    control.school_membership_enabled,control.state = 'emergency_stopped'
  FROM public.public_account_launch_control control
  WHERE control.control_key = 'public_account';
$$;

CREATE OR REPLACE FUNCTION public.public_account_access_active(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.account_deletion_requests request
      WHERE request.user_id = target_user_id AND request.status IN ('pending','done')
    );
$$;

CREATE OR REPLACE FUNCTION public.public_account_feature_enabled(requested_feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE requested_feature
    WHEN 'private_profile' THEN control.private_profile_enabled
    WHEN 'school_membership' THEN control.school_membership_enabled
    ELSE false
  END
  AND auth.uid() IS NOT NULL
  AND public.public_account_access_active(auth.uid())
  FROM public.public_account_launch_control control
  WHERE control.control_key = 'public_account';
$$;

CREATE OR REPLACE FUNCTION public.admin_set_public_account_launch_state(
  requested_state text,
  requested_reason text,
  admin_actor text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  control public.public_account_launch_control%ROWTYPE;
BEGIN
  IF requested_state NOT IN ('closed','internal_test','ready','open','emergency_stopped')
    OR requested_reason !~ '^[A-Z0-9_]{2,60}$'
    OR char_length(admin_actor) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'INVALID_LAUNCH_CHANGE'; END IF;

  SELECT * INTO control FROM public.public_account_launch_control
  WHERE control_key = 'public_account' FOR UPDATE;

  IF control.state = 'emergency_stopped'
    AND (requested_state <> 'closed' OR requested_reason <> 'POST_EMERGENCY_READINESS_REVIEWED')
  THEN RAISE EXCEPTION 'POST_EMERGENCY_READINESS_REQUIRED'; END IF;

  IF requested_state = 'open' AND control.state <> 'ready'
  THEN RAISE EXCEPTION 'OPEN_REQUIRES_READY_STATE'; END IF;

  UPDATE public.public_account_launch_control SET
    state = requested_state,
    account_registration_enabled = requested_state = 'open',
    private_profile_enabled = requested_state IN ('internal_test','open'),
    school_membership_enabled = requested_state IN ('internal_test','open'),
    emergency_stopped_at = CASE WHEN requested_state = 'emergency_stopped' THEN clock_timestamp() ELSE NULL END,
    last_reason_code = requested_reason,
    updated_by = admin_actor,
    updated_at = clock_timestamp()
  WHERE control_key = 'public_account';

  INSERT INTO public.public_account_launch_audit(
    action,from_state,to_state,reason_code,actor_reference,metadata
  ) VALUES (
    CASE WHEN requested_state = 'emergency_stopped' THEN 'emergency_stopped' ELSE 'state_changed' END,
    control.state,requested_state,requested_reason,admin_actor,
    jsonb_build_object('features',CASE requested_state
      WHEN 'open' THEN jsonb_build_array('account_registration','private_profile','school_membership')
      WHEN 'internal_test' THEN jsonb_build_array('private_profile','school_membership')
      ELSE '[]'::jsonb END)
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_public_account_event(
  requested_event text,
  requested_source text DEFAULT 'direct'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF requested_event NOT IN (
    'public_home_view','school_search_started','login_page_view','otp_request_accepted',
    'otp_verify_succeeded','adult_eligibility_completed','required_consents_completed',
    'private_profile_saved','school_membership_saved','onboarding_completed',
    'return_session','account_deletion_requested'
  ) OR requested_source NOT IN ('direct','school_search','account','onboarding')
  THEN RETURN false; END IF;

  INSERT INTO public.public_account_daily_funnel(metric_date,event_key,source_channel,event_count)
  VALUES((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date,requested_event,requested_source,1)
  ON CONFLICT(metric_date,event_key,source_channel) DO UPDATE
    SET event_count = public.public_account_daily_funnel.event_count + 1,
        updated_at = clock_timestamp();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_account_funnel()
RETURNS TABLE(metric_date date,event_key text,source_channel text,event_count bigint,masked boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT metric.metric_date,metric.event_key,metric.source_channel,
    CASE WHEN metric.event_count < 10 THEN NULL ELSE metric.event_count END,
    metric.event_count < 10
  FROM public.public_account_daily_funnel metric
  WHERE metric.metric_date >= ((now() AT TIME ZONE 'Asia/Seoul')::date - 13)
  ORDER BY metric.metric_date DESC,metric.event_key,metric.source_channel;
$$;

-- Deletion requests never retain free-form user text. One pending request is idempotent,
-- and all subsequent private writes are denied by the shared account-access predicate.
CREATE OR REPLACE FUNCTION public.request_own_account_deletion(request_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE requester uuid := auth.uid();
BEGIN
  IF requester IS NULL THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.account_deletion_requests request
    WHERE request.user_id=requester AND request.status='done') THEN RETURN true; END IF;
  UPDATE public.private_profiles SET status='deletion_requested',updated_at=clock_timestamp()
  WHERE owner_user_id=requester;
  INSERT INTO public.account_deletion_requests(user_id,reason,status)
  VALUES(requester,NULL,'pending') ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_complete_public_account_deletion(
  target_request_id uuid,
  requested_reason text,
  admin_actor text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$'
    OR char_length(admin_actor) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'INVALID_DELETION_COMPLETION'; END IF;
  SELECT * INTO request FROM public.account_deletion_requests
    WHERE id=target_request_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'DELETION_REQUEST_NOT_FOUND'; END IF;
  IF request.status='done' THEN RETURN true; END IF;
  IF request.status<>'pending' THEN RAISE EXCEPTION 'DELETION_REQUEST_NOT_PENDING'; END IF;

  DELETE FROM public.beta_onboarding_progress WHERE user_id=request.user_id;
  DELETE FROM public.private_profiles WHERE owner_user_id=request.user_id;
  UPDATE auth.users SET banned_until='9999-12-31 23:59:59+00'::timestamptz,updated_at=clock_timestamp()
    WHERE id=request.user_id;
  UPDATE public.account_deletion_requests
    SET status='done',reason=NULL,resolved_at=clock_timestamp()
    WHERE id=request.id;
  INSERT INTO public.public_account_launch_audit(
    action,reason_code,actor_reference,target_id,metadata
  ) VALUES ('deletion_completed',requested_reason,admin_actor,request.id,
    jsonb_build_object('auth_identity_policy','retained_blocked_tombstone_until_9999',
      'eligibility_policy','retained_for_legal_audit','consent_policy','retained_for_legal_audit'));
  RETURN true;
END;
$$;

-- Keep every dormant beta-only table on its original beta feature gate. Only the two
-- owner-only account tables gain the separate public soft-launch authorization path.
CREATE OR REPLACE FUNCTION public.enforce_beta_write_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE actor uuid; feature text; public_feature text;
BEGIN
  actor := (CASE TG_TABLE_NAME
    WHEN 'private_profiles' THEN to_jsonb(NEW)->>'owner_user_id'
    WHEN 'profile_school_memberships' THEN to_jsonb(NEW)->>'owner_user_id'
    WHEN 'connection_match_tokens' THEN to_jsonb(NEW)->>'requester_user_id'
    WHEN 'connection_requests' THEN to_jsonb(NEW)->>'sender_user_id'
    WHEN 'connection_messages' THEN to_jsonb(NEW)->>'sender_user_id'
    WHEN 'connection_instagram_permissions' THEN to_jsonb(NEW)->>'grantor_user_id'
    WHEN 'promotion_accounts' THEN to_jsonb(NEW)->>'owner_user_id'
    WHEN 'promotion_requests' THEN to_jsonb(NEW)->>'owner_user_id'
    ELSE NULL END)::uuid;
  feature := CASE TG_TABLE_NAME
    WHEN 'private_profiles' THEN 'private_profile'
    WHEN 'profile_school_memberships' THEN 'private_profile'
    WHEN 'connection_match_tokens' THEN 'people_search'
    WHEN 'connection_requests' THEN 'connection_request'
    WHEN 'connection_messages' THEN 'messaging'
    WHEN 'connection_instagram_permissions' THEN 'instagram_permission'
    WHEN 'promotion_accounts' THEN 'promotion_application'
    WHEN 'promotion_requests' THEN 'promotion_application'
    ELSE 'account_registration' END;
  public_feature := CASE TG_TABLE_NAME
    WHEN 'private_profiles' THEN 'private_profile'
    WHEN 'profile_school_memberships' THEN 'school_membership'
    ELSE NULL END;
  IF public_feature IS NOT NULL
    AND public.public_account_access_active(actor)
    AND public.public_account_feature_enabled(public_feature)
  THEN RETURN NEW; END IF;
  IF NOT public.has_beta_feature_access(actor,feature) THEN RAISE EXCEPTION 'BETA_ACCESS_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;

-- Public soft-launch users and controlled-beta members are separate authorization paths.
-- An active controlled-beta member keeps the immutable one-school contract.
CREATE OR REPLACE FUNCTION public.enforce_public_or_controlled_beta_school_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  member public.beta_members%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE;
  active_beta_count integer;
  existing_count integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid()<>NEW.owner_user_id
    THEN RAISE EXCEPTION 'MEMBERSHIP_OWNER_REQUIRED'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.owner_user_id::text,0));
  IF NOT public.public_account_access_active(NEW.owner_user_id)
    THEN RAISE EXCEPTION 'ACCOUNT_DELETION_REQUESTED'; END IF;
  IF NEW.graduation_year>extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer
    THEN RAISE EXCEPTION 'FUTURE_GRADUATION_YEAR_NOT_ALLOWED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.private_profiles profile WHERE profile.id=NEW.profile_id
    AND profile.owner_user_id=NEW.owner_user_id AND profile.status='active' AND profile.profile_visibility='private')
    THEN RAISE EXCEPTION 'PRIVATE_PROFILE_REQUIRED'; END IF;
  IF NOT public.has_current_adult_access(NEW.owner_user_id)
    THEN RAISE EXCEPTION 'ADULT_CONSENT_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.profile_school_memberships existing
    WHERE existing.profile_id=NEW.profile_id AND existing.school_id=NEW.school_id
      AND existing.graduation_year=NEW.graduation_year AND existing.id<>NEW.id)
    THEN RAISE EXCEPTION 'PUBLIC_ACCOUNT_SCHOOL_DUPLICATE'; END IF;

  SELECT count(*) INTO active_beta_count FROM public.beta_members candidate
    JOIN public.beta_programs program ON program.id=candidate.program_id
    JOIN public.beta_program_setup_snapshots snapshot ON snapshot.program_id=program.id
    WHERE candidate.user_id=NEW.owner_user_id AND candidate.status='active' AND program.status='active'
      AND program.emergency_disabled_at IS NULL AND program.starts_at<=now() AND program.ends_at>now();

  SELECT count(*) INTO existing_count FROM public.profile_school_memberships existing
    WHERE existing.profile_id=NEW.profile_id AND existing.id<>NEW.id;

  IF active_beta_count > 0 THEN
    IF active_beta_count<>1 THEN RAISE EXCEPTION 'ACTIVE_CONTROLLED_BETA_MEMBERSHIP_REQUIRED'; END IF;
    SELECT candidate.* INTO member FROM public.beta_members candidate
      JOIN public.beta_programs program ON program.id=candidate.program_id
      JOIN public.beta_program_setup_snapshots snapshot ON snapshot.program_id=program.id
      WHERE candidate.user_id=NEW.owner_user_id AND candidate.status='active' AND program.status='active'
        AND program.emergency_disabled_at IS NULL AND program.starts_at<=now() AND program.ends_at>now();
    SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=member.program_id;
    IF allowed.program_id IS NULL OR member.target_school_id IS NULL OR allowed.school_id<>member.target_school_id
      OR NEW.school_id<>allowed.school_id THEN RAISE EXCEPTION 'SCHOOL_OUTSIDE_BETA_SCOPE'; END IF;
    IF existing_count>0 THEN RAISE EXCEPTION 'SECOND_SCHOOL_NOT_ALLOWED'; END IF;
  ELSE
    IF NOT public.public_account_feature_enabled('school_membership')
      THEN RAISE EXCEPTION 'PUBLIC_ACCOUNT_SCHOOL_MEMBERSHIP_CLOSED'; END IF;
    IF existing_count>=3 THEN RAISE EXCEPTION 'PUBLIC_ACCOUNT_SCHOOL_LIMIT_REACHED'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase10j_beta_school_scope ON public.profile_school_memberships;
DROP TRIGGER IF EXISTS phase10n_account_school_scope ON public.profile_school_memberships;
CREATE TRIGGER phase10n_account_school_scope
BEFORE INSERT OR UPDATE OF school_id,graduation_year,profile_id,owner_user_id
ON public.profile_school_memberships FOR EACH ROW
EXECUTE FUNCTION public.enforce_public_or_controlled_beta_school_membership();

DROP POLICY IF EXISTS private_profiles_owner_insert ON public.private_profiles;
DROP POLICY IF EXISTS private_profiles_owner_update ON public.private_profiles;
CREATE POLICY private_profiles_owner_insert ON public.private_profiles FOR INSERT TO authenticated
  WITH CHECK(owner_user_id=auth.uid() AND profile_visibility='private' AND status='active'
    AND public.has_current_adult_access(auth.uid()) AND public.public_account_access_active(auth.uid())
    AND (public.public_account_feature_enabled('private_profile')
      OR public.has_beta_feature_access(auth.uid(),'private_profile')));
CREATE POLICY private_profiles_owner_update ON public.private_profiles FOR UPDATE TO authenticated
  USING(owner_user_id=auth.uid() AND public.public_account_access_active(auth.uid()))
  WITH CHECK(owner_user_id=auth.uid() AND profile_visibility='private' AND status='active'
    AND public.has_current_adult_access(auth.uid()) AND public.public_account_access_active(auth.uid())
    AND (public.public_account_feature_enabled('private_profile')
      OR public.has_beta_feature_access(auth.uid(),'private_profile')));

DROP POLICY IF EXISTS memberships_owner_insert ON public.profile_school_memberships;
DROP POLICY IF EXISTS memberships_owner_update ON public.profile_school_memberships;
CREATE POLICY memberships_owner_insert ON public.profile_school_memberships FOR INSERT TO authenticated
  WITH CHECK(owner_user_id=auth.uid() AND public.has_current_adult_access(auth.uid())
    AND public.public_account_access_active(auth.uid())
    AND (public.public_account_feature_enabled('school_membership')
      OR public.has_beta_feature_access(auth.uid(),'private_profile')));
CREATE POLICY memberships_owner_update ON public.profile_school_memberships FOR UPDATE TO authenticated
  USING(owner_user_id=auth.uid() AND public.public_account_access_active(auth.uid()))
  WITH CHECK(owner_user_id=auth.uid() AND public.has_current_adult_access(auth.uid())
    AND public.public_account_access_active(auth.uid())
    AND (public.public_account_feature_enabled('school_membership')
      OR public.has_beta_feature_access(auth.uid(),'private_profile')));

REVOKE ALL ON FUNCTION public.get_public_account_launch_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_account_access_active(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.public_account_feature_enabled(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_public_account_launch_state(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_public_account_event(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_public_account_funnel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_complete_public_account_deletion(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enforce_public_or_controlled_beta_school_membership() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enforce_beta_write_access() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_account_launch_state() TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.public_account_access_active(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.public_account_feature_enabled(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_public_account_launch_state(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_public_account_event(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_account_funnel() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_complete_public_account_deletion(uuid,text,text) TO service_role;

COMMENT ON TABLE public.public_account_launch_control IS
  'Service-role controlled public-account soft-launch boundary. The migration default is closed.';
COMMENT ON TABLE public.public_account_daily_funnel IS
  'Privacy-safe KST daily counters only; never stores user, email, IP, query, token, or profile identifiers.';
COMMENT ON FUNCTION public.admin_complete_public_account_deletion(uuid,text,text) IS
  'Atomically removes private profile/memberships and blocks app access. Auth identity is retained as a long-term blocked tombstone; eligibility, consent, and audit records are retained for legal evidence.';
