-- PHASE 10J-B: first controlled-beta safety boundaries.
-- This migration is local/Draft only until separately approved for Production.
-- It does not backfill legacy programs, snapshots, schools, members, or feature flags.

ALTER TABLE public.beta_setup_drafts
  ADD COLUMN target_school_id uuid REFERENCES public.schools(id) ON DELETE RESTRICT;

ALTER TABLE public.beta_program_setup_snapshots
  ADD COLUMN target_school_id uuid REFERENCES public.schools(id) ON DELETE RESTRICT,
  ADD CONSTRAINT beta_program_setup_snapshots_id_program_unique UNIQUE (id,program_id);

ALTER TABLE public.beta_members
  ADD COLUMN target_school_id uuid REFERENCES public.schools(id) ON DELETE RESTRICT;

CREATE TABLE public.beta_program_schools (
  program_id uuid PRIMARY KEY REFERENCES public.beta_programs(id) ON DELETE RESTRICT,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  source_snapshot_id uuid NOT NULL UNIQUE,
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_program_schools_program_school_unique UNIQUE(program_id,school_id),
  CONSTRAINT beta_program_schools_snapshot_program_fk
    FOREIGN KEY(source_snapshot_id,program_id)
    REFERENCES public.beta_program_setup_snapshots(id,program_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.prevent_beta_program_school_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'PROGRAM_SCHOOL_IMMUTABLE';
END; $$;

CREATE TRIGGER beta_program_schools_immutable
BEFORE UPDATE OR DELETE ON public.beta_program_schools
FOR EACH ROW EXECUTE FUNCTION public.prevent_beta_program_school_mutation();

ALTER TABLE public.beta_program_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_program_schools FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beta_program_schools FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.beta_program_schools TO service_role;

DROP FUNCTION public.admin_save_beta_setup(
  uuid,text,text,timestamptz,timestamptz,integer,text,text[],jsonb,boolean,jsonb,text,text,text
);

CREATE FUNCTION public.admin_save_beta_setup(
  target_draft_id uuid, requested_draft_key text, requested_name text,
  requested_starts_at timestamptz, requested_ends_at timestamptz, requested_max_users integer,
  requested_target_scope text, requested_target_school_id uuid, requested_features text[],
  requested_invite_policy jsonb, requested_waitlist boolean, requested_stop_conditions jsonb,
  requested_memo text, requested_status text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid; existing_draft public.beta_setup_drafts%ROWTYPE; previous_key text;
BEGIN
  IF char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_ADMIN_ACTOR'; END IF;
  IF requested_status NOT IN ('draft','validated','archived') THEN RAISE EXCEPTION 'INVALID_SETUP_STATUS'; END IF;
  IF requested_draft_key !~ '^[a-z0-9][a-z0-9_-]{2,39}$' THEN RAISE EXCEPTION 'INVALID_DRAFT_KEY'; END IF;
  IF requested_status='validated' AND requested_target_school_id IS NULL THEN RAISE EXCEPTION 'TARGET_SCHOOL_REQUIRED'; END IF;
  IF requested_target_school_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.schools school WHERE school.id=requested_target_school_id)
    THEN RAISE EXCEPTION 'TARGET_SCHOOL_NOT_FOUND'; END IF;
  IF requested_features IS NULL OR cardinality(requested_features)<>2
    OR NOT (requested_features @> ARRAY['account_registration','private_profile']::text[])
    OR NOT (requested_features <@ ARRAY['account_registration','private_profile']::text[])
    THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_FEATURE_SET'; END IF;
  IF requested_stop_conditions IS NULL OR jsonb_typeof(requested_stop_conditions) IS DISTINCT FROM 'object'
    OR NOT (requested_stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'REQUIRED_STOP_CONDITION_MISSING'; END IF;
  IF requested_invite_policy IS NULL OR jsonb_typeof(requested_invite_policy) IS DISTINCT FROM 'object'
    OR requested_invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_INVITE_POLICY'; END IF;
  IF requested_status='validated' AND (
    requested_max_users<>20 OR requested_starts_at IS NULL OR requested_ends_at IS NULL
    OR requested_ends_at-requested_starts_at<>interval '14 days' OR requested_waitlist IS DISTINCT FROM true
  ) THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_CONTRACT'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase10j-program-key:'||requested_draft_key,0));
  IF EXISTS(SELECT 1 FROM public.beta_programs WHERE program_key=requested_draft_key) THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END IF;

  IF target_draft_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.beta_setup_drafts WHERE draft_key=requested_draft_key) THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END IF;
    BEGIN
      INSERT INTO public.beta_setup_drafts(
        draft_key,name,starts_at,ends_at,max_users,target_scope,target_school_id,enabled_features,
        invite_policy,approval_waitlist_enabled,stop_conditions,operator_memo,status,created_by
      ) VALUES(
        requested_draft_key,requested_name,requested_starts_at,requested_ends_at,requested_max_users,
        requested_target_scope,requested_target_school_id,requested_features,requested_invite_policy,
        requested_waitlist,requested_stop_conditions,coalesce(requested_memo,''),requested_status,admin_actor
      ) RETURNING id INTO result_id;
    EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END;
    previous_key:=NULL;
  ELSE
    SELECT * INTO existing_draft FROM public.beta_setup_drafts WHERE id=target_draft_id FOR UPDATE;
    IF existing_draft.id IS NULL THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND'; END IF;
    IF existing_draft.status='activated' THEN RAISE EXCEPTION 'DRAFT_ALREADY_ACTIVATED'; END IF;
    IF EXISTS(SELECT 1 FROM public.beta_setup_drafts WHERE draft_key=requested_draft_key AND id<>target_draft_id)
      THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END IF;
    previous_key:=existing_draft.draft_key;
    BEGIN
      UPDATE public.beta_setup_drafts SET
        draft_key=requested_draft_key,name=requested_name,starts_at=requested_starts_at,ends_at=requested_ends_at,
        max_users=requested_max_users,target_scope=requested_target_scope,target_school_id=requested_target_school_id,
        enabled_features=requested_features,invite_policy=requested_invite_policy,
        approval_waitlist_enabled=requested_waitlist,stop_conditions=requested_stop_conditions,
        operator_memo=coalesce(requested_memo,''),status=requested_status,updated_at=now()
      WHERE id=target_draft_id RETURNING id INTO result_id;
    EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END;
  END IF;

  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'beta_setup_saved','beta_setup_draft',result_id,upper(requested_status));
  IF previous_key IS DISTINCT FROM requested_draft_key THEN
    INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
    VALUES('admin',admin_actor,'beta_setup_key_changed','beta_setup_draft',result_id,'DRAFT_KEY_CHANGED',
      jsonb_build_object('previous_key',previous_key,'new_key',requested_draft_key));
  END IF;
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_activate_beta_setup(target_draft_id uuid, admin_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft public.beta_setup_drafts%ROWTYPE; program_id uuid; snapshot_id uuid;
BEGIN
  IF char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_ADMIN_ACTOR'; END IF;
  SELECT * INTO draft FROM public.beta_setup_drafts WHERE id=target_draft_id FOR UPDATE;
  IF draft.id IS NULL THEN RAISE EXCEPTION 'SETUP_NOT_FOUND'; END IF;
  IF draft.status='activated' THEN
    SELECT snapshot.program_id INTO program_id FROM public.beta_program_setup_snapshots snapshot
      JOIN public.beta_program_schools allowed ON allowed.source_snapshot_id=snapshot.id AND allowed.program_id=snapshot.program_id
      WHERE snapshot.source_draft_id=draft.id;
    IF program_id IS NULL THEN RAISE EXCEPTION 'ACTIVATED_SETUP_CONTRACT_MISSING'; END IF;
    RETURN program_id;
  END IF;
  IF draft.status<>'validated' THEN RAISE EXCEPTION 'SETUP_NOT_VALIDATED'; END IF;
  IF draft.target_school_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=draft.target_school_id)
    THEN RAISE EXCEPTION 'TARGET_SCHOOL_NOT_FOUND'; END IF;
  IF draft.max_users<>20 OR draft.starts_at IS NULL OR draft.ends_at IS NULL
    OR draft.ends_at-draft.starts_at<>interval '14 days'
    OR cardinality(draft.enabled_features)<>2
    OR NOT (draft.enabled_features @> ARRAY['account_registration','private_profile']::text[])
    OR NOT (draft.enabled_features <@ ARRAY['account_registration','private_profile']::text[])
    OR draft.invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR draft.approval_waitlist_enabled IS DISTINCT FROM true
    OR NOT (draft.stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_CONTRACT'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase10j-program-key:'||draft.draft_key,0));
  IF EXISTS(SELECT 1 FROM public.beta_programs WHERE program_key=draft.draft_key) THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END IF;
  BEGIN
    INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at,ends_at)
    VALUES(draft.draft_key,draft.name,'paused',true,draft.starts_at,draft.ends_at) RETURNING id INTO program_id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END;
  INSERT INTO public.beta_program_setup_snapshots(
    program_id,source_draft_id,max_users,target_scope,target_school_id,enabled_features,
    invite_policy,approval_waitlist_enabled,stop_conditions,created_by
  ) VALUES(
    program_id,draft.id,draft.max_users,draft.target_scope,draft.target_school_id,draft.enabled_features,
    draft.invite_policy,draft.approval_waitlist_enabled,draft.stop_conditions,admin_actor
  ) RETURNING id INTO snapshot_id;
  INSERT INTO public.beta_program_schools(program_id,school_id,source_snapshot_id,created_by)
  VALUES(program_id,draft.target_school_id,snapshot_id,admin_actor);
  UPDATE public.beta_setup_drafts SET status='activated',updated_at=now() WHERE id=draft.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'beta_setup_activated','beta_program',program_id,'CREATED_PAUSED',
    jsonb_build_object('draft_id',draft.id,'snapshot_id',snapshot_id,'school_contract',true));
  RETURN program_id;
END; $$;

CREATE OR REPLACE FUNCTION public.has_beta_feature_access(target_user_id uuid, requested_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT target_user_id IS NOT NULL
    AND (auth.uid()=target_user_id OR auth.role()='service_role' OR session_user='postgres')
    AND requested_feature IN ('account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations')
    AND NOT EXISTS (
      SELECT 1 FROM public.beta_feature_flags f
      WHERE f.program_id IS NULL AND f.user_id IS NULL AND f.feature_key=requested_feature
        AND f.enabled=false
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.safety_account_restrictions restriction
      WHERE restriction.user_id=target_user_id AND restriction.status='suspended'
    )
    AND EXISTS (
      SELECT 1 FROM public.beta_members member
      JOIN public.beta_programs program ON program.id=member.program_id
      LEFT JOIN public.beta_program_setup_snapshots snapshot ON snapshot.program_id=program.id
      WHERE member.user_id=target_user_id AND member.status='active' AND program.status='active'
        AND program.emergency_disabled_at IS NULL
        AND (program.starts_at IS NULL OR program.starts_at<=now())
        AND (program.ends_at IS NULL OR program.ends_at>now())
        AND (
          (snapshot.id IS NOT NULL
            AND requested_feature=ANY(snapshot.enabled_features)
            AND EXISTS(
              SELECT 1 FROM public.beta_feature_flags program_flag
              WHERE program_flag.program_id=program.id AND program_flag.user_id IS NULL
                AND program_flag.feature_key=requested_feature AND program_flag.enabled=true
            )
            AND COALESCE((
              SELECT user_flag.enabled FROM public.beta_feature_flags user_flag
              WHERE user_flag.user_id=target_user_id AND user_flag.program_id IS NULL
                AND user_flag.feature_key=requested_feature
            ),true)
          )
          OR
          (snapshot.id IS NULL AND COALESCE(
            (SELECT user_flag.enabled FROM public.beta_feature_flags user_flag
              WHERE user_flag.user_id=target_user_id AND user_flag.program_id IS NULL AND user_flag.feature_key=requested_feature),
            (SELECT program_flag.enabled FROM public.beta_feature_flags program_flag
              WHERE program_flag.program_id=program.id AND program_flag.user_id IS NULL AND program_flag.feature_key=requested_feature),
            (SELECT global_flag.enabled FROM public.beta_feature_flags global_flag
              WHERE global_flag.program_id IS NULL AND global_flag.user_id IS NULL AND global_flag.feature_key=requested_feature),
            false
          ))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_configure_controlled_beta_features(
  target_program_id uuid, requested_enabled_features text[], admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE program public.beta_programs%ROWTYPE; snapshot public.beta_program_setup_snapshots%ROWTYPE; current_valid boolean;
BEGIN
  IF char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_ADMIN_ACTOR'; END IF;
  IF requested_enabled_features IS NULL OR cardinality(requested_enabled_features)<>2
    OR NOT (requested_enabled_features @> ARRAY['account_registration','private_profile']::text[])
    OR NOT (requested_enabled_features <@ ARRAY['account_registration','private_profile']::text[])
    THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_FEATURE_SET'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  IF program.status<>'paused' OR program.emergency_disabled_at IS NOT NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_CONFIGURABLE'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  IF snapshot.id IS NULL OR cardinality(snapshot.enabled_features)<>2
    OR NOT (snapshot.enabled_features @> ARRAY['account_registration','private_profile']::text[])
    OR NOT (snapshot.enabled_features <@ ARRAY['account_registration','private_profile']::text[])
    THEN RAISE EXCEPTION 'PROGRAM_SETUP_CONTRACT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.beta_invites WHERE program_id=program.id)
    OR EXISTS(SELECT 1 FROM public.beta_members WHERE program_id=program.id)
    THEN RAISE EXCEPTION 'PROGRAM_ALREADY_USED'; END IF;
  SELECT count(*)=8
    AND count(*) FILTER(WHERE enabled)=2
    AND count(*) FILTER(WHERE enabled AND feature_key IN ('account_registration','private_profile'))=2
    INTO current_valid
  FROM public.beta_feature_flags WHERE program_id=program.id AND user_id IS NULL;
  IF current_valid THEN RETURN true; END IF;
  INSERT INTO public.beta_feature_flags(program_id,user_id,feature_key,enabled,reason_code,updated_by)
  SELECT program.id,NULL,feature_key,feature_key=ANY(requested_enabled_features),'FIRST_CONTROLLED_BETA',admin_actor
  FROM unnest(ARRAY[
    'account_registration','private_profile','people_search','connection_request','messaging',
    'instagram_permission','promotion_application','promotion_operations'
  ]::text[]) feature_key
  ON CONFLICT(program_id,feature_key) WHERE program_id IS NOT NULL AND user_id IS NULL
  DO UPDATE SET enabled=excluded.enabled,reason_code=excluded.reason_code,updated_by=excluded.updated_by,updated_at=now();
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'controlled_beta_features_configured','beta_program',program.id,'FIRST_BETA_FEATURE_SET');
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_start_controlled_beta_program(
  target_program_id uuid, requested_reason text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  program public.beta_programs%ROWTYPE; snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE; flag_count integer; enabled_count integer;
  readiness public.beta_readiness_snapshots%ROWTYPE;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_START_REQUEST'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  IF program.status='active' AND EXISTS(
    SELECT 1 FROM public.beta_audit_logs log WHERE log.target_id=program.id AND log.action='controlled_beta_started'
  ) THEN RETURN true; END IF;
  IF program.status<>'paused' THEN RAISE EXCEPTION 'PROGRAM_NOT_PAUSED'; END IF;
  IF program.program_key='limited_beta_2026' OR program.emergency_disabled_at IS NOT NULL
    THEN RAISE EXCEPTION 'LEGACY_OR_EMERGENCY_PROGRAM_REJECTED'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  IF snapshot.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_SETUP_SNAPSHOT_REQUIRED'; END IF;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
  IF allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id OR allowed.school_id<>snapshot.target_school_id
    THEN RAISE EXCEPTION 'PROGRAM_SCHOOL_CONTRACT_INVALID'; END IF;
  IF snapshot.max_users<>20 OR program.starts_at IS NULL OR program.ends_at IS NULL
    OR program.ends_at-program.starts_at<>interval '14 days'
    OR now()<program.starts_at OR now()>=program.ends_at
    OR cardinality(snapshot.enabled_features)<>2
    OR NOT (snapshot.enabled_features @> ARRAY['account_registration','private_profile']::text[])
    OR NOT (snapshot.enabled_features <@ ARRAY['account_registration','private_profile']::text[])
    OR snapshot.invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR snapshot.approval_waitlist_enabled IS DISTINCT FROM true
    OR NOT (snapshot.stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'PROGRAM_SETUP_CONTRACT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.beta_invites WHERE program_id=program.id)
    OR EXISTS(SELECT 1 FROM public.beta_members WHERE program_id=program.id)
    THEN RAISE EXCEPTION 'PROGRAM_ALREADY_USED'; END IF;
  SELECT count(*),count(*) FILTER(WHERE enabled) INTO flag_count,enabled_count
    FROM public.beta_feature_flags WHERE program_id=program.id AND user_id IS NULL;
  IF flag_count<>8 OR enabled_count<>2
    OR NOT EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id=program.id AND feature_key='account_registration' AND enabled)
    OR NOT EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id=program.id AND feature_key='private_profile' AND enabled)
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id=program.id AND feature_key NOT IN ('account_registration','private_profile') AND enabled)
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id IS NULL AND user_id IS NULL
      AND feature_key IN ('account_registration','private_profile') AND enabled=false)
    THEN RAISE EXCEPTION 'PROGRAM_FEATURE_SET_INCOMPLETE'; END IF;
  SELECT * INTO readiness FROM public.beta_readiness_snapshots WHERE program_id=program.id ORDER BY created_at DESC LIMIT 1;
  IF readiness.id IS NULL OR readiness.status<>'limited_beta' OR readiness.operator_decision IS DISTINCT FROM true
    OR cardinality(readiness.blocker_codes)<>0 THEN RAISE EXCEPTION 'FRESH_READINESS_REQUIRED'; END IF;
  UPDATE public.beta_programs SET status='active',updated_at=now() WHERE id=program.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'controlled_beta_started','beta_program',program.id,requested_reason,
    jsonb_build_object('snapshot_id',snapshot.id,'school_contract',true,'max_users',20,'duration_days',14));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_beta_emergency(
  target_program_id uuid, requested_disabled boolean, requested_reason text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE program public.beta_programs%ROWTYPE; snapshot_exists boolean;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_EMERGENCY_REQUEST'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.beta_program_setup_snapshots WHERE program_id=program.id) INTO snapshot_exists;
  IF NOT requested_disabled THEN
    IF program.emergency_disabled_at IS NULL THEN RETURN true; END IF;
    RAISE EXCEPTION 'REACTIVATION_REQUIRED';
  END IF;
  IF program.emergency_disabled_at IS NOT NULL THEN RETURN true; END IF;
  UPDATE public.beta_programs SET
    emergency_disabled_at=clock_timestamp(),
    status=CASE WHEN snapshot_exists AND status='active' THEN 'paused' ELSE status END,
    updated_at=now()
  WHERE id=program.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'emergency_disabled','beta_program',program.id,requested_reason);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_record_beta_readiness(
  target_program_id uuid, requested_status text, requested_criteria jsonb,
  requested_blockers text[], requested_operator_decision boolean, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  IF requested_status NOT IN ('blocked','internal_only','limited_beta','beta_stable','launch_candidate')
    OR char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_READINESS_REQUEST'; END IF;
  IF requested_status='launch_candidate' AND NOT requested_operator_decision THEN RAISE EXCEPTION 'OPERATOR_DECISION_REQUIRED'; END IF;
  INSERT INTO public.beta_readiness_snapshots(
    program_id,status,criteria,blocker_codes,operator_decision,decided_by,created_at
  ) VALUES(
    target_program_id,requested_status,coalesce(requested_criteria,'{}'::jsonb),
    coalesce(requested_blockers,'{}'::text[]),requested_operator_decision,admin_actor,clock_timestamp()
  ) RETURNING id INTO result_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'beta_readiness_recorded','beta_readiness_snapshot',result_id,upper(requested_status));
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_controlled_beta_program(
  target_program_id uuid, requested_reason text, requested_resolution_code text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  program public.beta_programs%ROWTYPE; snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE; readiness public.beta_readiness_snapshots%ROWTYPE;
  flag_count integer; enabled_count integer; occupied integer;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR requested_resolution_code !~ '^[A-Z0-9_]{2,60}$'
    OR char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_REACTIVATION_REQUEST'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  IF program.program_key='limited_beta_2026' THEN RAISE EXCEPTION 'LEGACY_PROGRAM_REJECTED'; END IF;
  IF program.status='active' AND program.emergency_disabled_at IS NULL
    AND EXISTS(SELECT 1 FROM public.beta_audit_logs WHERE target_id=program.id AND action='controlled_beta_reactivated')
    THEN RETURN true; END IF;
  IF program.status<>'paused' OR program.emergency_disabled_at IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_REACTIVATABLE'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
  IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id
    OR allowed.school_id<>snapshot.target_school_id THEN RAISE EXCEPTION 'PROGRAM_SCHOOL_CONTRACT_INVALID'; END IF;
  IF snapshot.max_users<>20 OR program.starts_at IS NULL OR program.ends_at IS NULL
    OR program.ends_at-program.starts_at<>interval '14 days' OR now()<program.starts_at OR now()>=program.ends_at
    OR cardinality(snapshot.enabled_features)<>2
    OR NOT (snapshot.enabled_features @> ARRAY['account_registration','private_profile']::text[])
    OR NOT (snapshot.enabled_features <@ ARRAY['account_registration','private_profile']::text[])
    OR snapshot.invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR snapshot.approval_waitlist_enabled IS DISTINCT FROM true
    OR NOT (snapshot.stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'PROGRAM_SETUP_CONTRACT_INVALID'; END IF;
  SELECT count(*),count(*) FILTER(WHERE enabled) INTO flag_count,enabled_count
    FROM public.beta_feature_flags WHERE program_id=program.id AND user_id IS NULL;
  IF flag_count<>8 OR enabled_count<>2
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id=program.id AND feature_key NOT IN ('account_registration','private_profile') AND enabled)
    OR NOT EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id=program.id AND feature_key='account_registration' AND enabled)
    OR NOT EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id=program.id AND feature_key='private_profile' AND enabled)
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id IS NULL AND user_id IS NULL
      AND feature_key IN ('account_registration','private_profile') AND enabled=false)
    THEN RAISE EXCEPTION 'PROGRAM_FEATURE_SET_INCOMPLETE'; END IF;
  SELECT count(*) INTO occupied FROM public.beta_members WHERE program_id=program.id AND status IN ('pending_review','active','suspended');
  IF occupied>snapshot.max_users THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  SELECT * INTO readiness FROM public.beta_readiness_snapshots
    WHERE program_id=program.id AND created_at>program.emergency_disabled_at ORDER BY created_at DESC LIMIT 1;
  IF readiness.id IS NULL OR readiness.status<>'limited_beta' OR readiness.operator_decision IS DISTINCT FROM true
    OR cardinality(readiness.blocker_codes)<>0 THEN RAISE EXCEPTION 'FRESH_READINESS_REQUIRED'; END IF;
  UPDATE public.beta_programs SET status='active',emergency_disabled_at=NULL,updated_at=now() WHERE id=program.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'controlled_beta_reactivated','beta_program',program.id,requested_reason,
    jsonb_build_object('resolution_code',requested_resolution_code,'readiness_id',readiness.id));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_issue_beta_invite(
  target_program_id uuid, requested_token_hash text, requested_email_hash text,
  requested_domain_hash text, requested_max_uses integer,
  requested_expires_at timestamptz, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  invite_id uuid; program public.beta_programs%ROWTYPE; snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE; occupied integer; outstanding integer;
BEGIN
  IF requested_token_hash !~ '^[0-9a-f]{64}$'
    OR (requested_email_hash IS NOT NULL AND requested_email_hash !~ '^[0-9a-f]{64}$')
    OR (requested_domain_hash IS NOT NULL AND requested_domain_hash !~ '^[0-9a-f]{64}$')
    OR requested_max_uses<>1 OR requested_expires_at<=now()
    OR requested_expires_at>now()+interval '7 days' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_INVITE'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL OR program.status<>'active' OR program.emergency_disabled_at IS NOT NULL
    OR now()<program.starts_at OR now()>=program.ends_at THEN RAISE EXCEPTION 'PROGRAM_UNAVAILABLE'; END IF;
  IF requested_expires_at>program.ends_at THEN RAISE EXCEPTION 'INVITE_EXCEEDS_PROGRAM_END'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
  IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id
    OR allowed.school_id<>snapshot.target_school_id THEN RAISE EXCEPTION 'PROGRAM_SCHOOL_CONTRACT_INVALID'; END IF;
  IF snapshot.invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR snapshot.approval_waitlist_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'INVITE_POLICY_NOT_ACTIVE'; END IF;
  SELECT count(*) INTO occupied FROM public.beta_members
    WHERE program_id=program.id AND status IN ('pending_review','active','suspended');
  SELECT count(*) INTO outstanding FROM public.beta_invites
    WHERE program_id=program.id AND revoked_at IS NULL AND expires_at>now() AND use_count<max_uses;
  IF occupied+outstanding>=snapshot.max_users THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  INSERT INTO public.beta_invites(program_id,token_hash,email_hash,domain_hash,max_uses,expires_at,created_by)
  VALUES(program.id,requested_token_hash,requested_email_hash,requested_domain_hash,1,requested_expires_at,admin_actor)
  RETURNING id INTO invite_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'invite_issued','beta_invite',invite_id,'FIRST_BETA_SINGLE_USE');
  RETURN invite_id;
END; $$;

CREATE OR REPLACE FUNCTION public.redeem_beta_invite(
  actor_user_id uuid, requested_token_hash text, actor_email_hash text, actor_domain_hash text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  invite public.beta_invites%ROWTYPE; program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE; allowed public.beta_program_schools%ROWTYPE;
  next_status text; reserved_count integer; member_id uuid;
BEGIN
  IF actor_user_id IS NULL OR NOT (auth.uid()=actor_user_id OR auth.role()='service_role' OR session_user='postgres')
    THEN RETURN 'ACCESS_DENIED'; END IF;
  IF requested_token_hash !~ '^[0-9a-f]{64}$' OR actor_email_hash !~ '^[0-9a-f]{64}$'
    OR actor_domain_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'INVALID'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.adult_eligibility_records adult
    WHERE adult.user_id=actor_user_id AND adult.adult_eligible=true
      AND adult.verification_method='self_attestation' AND adult.policy_version='phase10b-2026-07-28'
  ) OR EXISTS(
    SELECT required_type FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
    WHERE NOT EXISTS(
      SELECT 1 FROM public.consent_records consent WHERE consent.user_id=actor_user_id
        AND consent.consent_type=required_type AND consent.consented=true AND consent.policy_version='phase10b-2026-07-28'
    )
  ) THEN RETURN 'ADULT_CONSENT_REQUIRED'; END IF;
  SELECT * INTO invite FROM public.beta_invites WHERE token_hash=requested_token_hash FOR UPDATE;
  IF invite.id IS NULL THEN RETURN 'UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.beta_members member WHERE member.program_id=invite.program_id AND member.user_id=actor_user_id)
    THEN RETURN 'ALREADY_REDEEMED'; END IF;
  IF invite.revoked_at IS NOT NULL OR invite.expires_at<=now() OR invite.max_uses<>1 OR invite.use_count>=1
    THEN RETURN 'UNAVAILABLE'; END IF;
  IF invite.email_hash IS NOT NULL AND invite.email_hash<>actor_email_hash THEN RETURN 'IDENTITY_MISMATCH'; END IF;
  IF invite.domain_hash IS NOT NULL AND invite.domain_hash<>actor_domain_hash THEN RETURN 'IDENTITY_MISMATCH'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=invite.program_id AND status='active'
    AND emergency_disabled_at IS NULL AND starts_at<=now() AND ends_at>now() FOR UPDATE;
  IF program.id IS NULL THEN RETURN 'PROGRAM_UNAVAILABLE'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
  IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id
    OR allowed.school_id<>snapshot.target_school_id THEN RETURN 'PROGRAM_CONTRACT_UNAVAILABLE'; END IF;
  IF snapshot.approval_waitlist_enabled IS DISTINCT FROM true THEN RETURN 'WAITLIST_DISABLED'; END IF;
  SELECT count(*) INTO reserved_count FROM public.beta_members
    WHERE program_id=program.id AND status IN ('pending_review','active','suspended');
  IF reserved_count>=snapshot.max_users THEN RETURN 'PROGRAM_FULL'; END IF;
  next_status:=CASE WHEN program.requires_admin_approval THEN 'pending_review' ELSE 'active' END;
  INSERT INTO public.beta_members(program_id,user_id,invite_id,target_school_id,status)
  VALUES(program.id,actor_user_id,invite.id,allowed.school_id,next_status) RETURNING id INTO member_id;
  UPDATE public.beta_invites SET use_count=use_count+1 WHERE id=invite.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('user',actor_user_id::text,'invite_redeemed','beta_member',member_id,'SCHOOL_SCOPE_BOUND');
  RETURN upper(next_status);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_beta_member(
  target_member_id uuid, requested_status text, requested_reason text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  member public.beta_members%ROWTYPE; program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE; allowed public.beta_program_schools%ROWTYPE;
  invite public.beta_invites%ROWTYPE; occupied_count integer;
BEGIN
  IF requested_status NOT IN ('active','suspended','rejected','withdrawn')
    OR requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
  SELECT * INTO member FROM public.beta_members WHERE id=target_member_id FOR UPDATE;
  IF member.id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF requested_status='active' AND member.status='active' THEN RETURN true; END IF;
  IF requested_status='active' THEN
    IF member.status<>'pending_review' THEN RAISE EXCEPTION 'MEMBER_NOT_PENDING_REVIEW'; END IF;
    SELECT * INTO program FROM public.beta_programs WHERE id=member.program_id FOR UPDATE;
    IF program.id IS NULL OR program.status<>'active' OR program.emergency_disabled_at IS NOT NULL
      OR program.starts_at>now() OR program.ends_at<=now() THEN RAISE EXCEPTION 'PROGRAM_UNAVAILABLE'; END IF;
    SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
    SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
    IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id
      OR allowed.school_id<>snapshot.target_school_id OR member.target_school_id<>allowed.school_id
      THEN RAISE EXCEPTION 'PROGRAM_SCHOOL_CONTRACT_INVALID'; END IF;
    IF snapshot.approval_waitlist_enabled IS DISTINCT FROM true OR program.requires_admin_approval IS DISTINCT FROM true
      THEN RAISE EXCEPTION 'APPROVAL_POLICY_INVALID'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.adult_eligibility_records adult WHERE adult.user_id=member.user_id
      AND adult.adult_eligible=true AND adult.verification_method='self_attestation' AND adult.policy_version='phase10b-2026-07-28')
      OR EXISTS(
        SELECT required_type FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
        WHERE NOT EXISTS(SELECT 1 FROM public.consent_records consent WHERE consent.user_id=member.user_id
          AND consent.consent_type=required_type AND consent.consented=true AND consent.policy_version='phase10b-2026-07-28')
      ) THEN RAISE EXCEPTION 'ADULT_CONSENT_REQUIRED'; END IF;
    SELECT * INTO invite FROM public.beta_invites WHERE id=member.invite_id AND program_id=program.id FOR UPDATE;
    IF invite.id IS NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at<=now()
      OR invite.max_uses<>1 OR invite.use_count<>1 OR invite.expires_at>program.ends_at
      THEN RAISE EXCEPTION 'INVITE_CONTRACT_INVALID'; END IF;
    SELECT count(*) INTO occupied_count FROM public.beta_members
      WHERE program_id=program.id AND id<>member.id AND status IN ('pending_review','active','suspended');
    IF occupied_count>=snapshot.max_users THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  END IF;
  UPDATE public.beta_members SET status=requested_status,reviewed_at=now(),reviewed_by=admin_actor,
    reason_code=requested_reason,updated_at=now() WHERE id=member.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'member_reviewed','beta_member',member.id,requested_reason);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_controlled_beta_school_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.beta_members%ROWTYPE; allowed public.beta_program_schools%ROWTYPE; member_count integer; existing_count integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid()<>NEW.owner_user_id THEN RAISE EXCEPTION 'MEMBERSHIP_OWNER_REQUIRED'; END IF;
  SELECT count(*) INTO member_count FROM public.beta_members candidate
    JOIN public.beta_programs program ON program.id=candidate.program_id
    JOIN public.beta_program_setup_snapshots snapshot ON snapshot.program_id=program.id
    WHERE candidate.user_id=NEW.owner_user_id AND candidate.status='active' AND program.status='active'
      AND program.emergency_disabled_at IS NULL AND program.starts_at<=now() AND program.ends_at>now();
  IF member_count<>1 THEN RAISE EXCEPTION 'ACTIVE_CONTROLLED_BETA_MEMBERSHIP_REQUIRED'; END IF;
  SELECT candidate.* INTO member FROM public.beta_members candidate
    JOIN public.beta_programs program ON program.id=candidate.program_id
    JOIN public.beta_program_setup_snapshots snapshot ON snapshot.program_id=program.id
    WHERE candidate.user_id=NEW.owner_user_id AND candidate.status='active' AND program.status='active'
      AND program.emergency_disabled_at IS NULL AND program.starts_at<=now() AND program.ends_at>now();
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=member.program_id;
  IF allowed.program_id IS NULL OR member.target_school_id IS NULL OR allowed.school_id<>member.target_school_id
    OR NEW.school_id<>allowed.school_id THEN RAISE EXCEPTION 'SCHOOL_OUTSIDE_BETA_SCOPE'; END IF;
  IF NEW.graduation_year>extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer
    THEN RAISE EXCEPTION 'FUTURE_GRADUATION_YEAR_NOT_ALLOWED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.private_profiles profile WHERE profile.id=NEW.profile_id
    AND profile.owner_user_id=NEW.owner_user_id AND profile.status='active' AND profile.profile_visibility='private')
    THEN RAISE EXCEPTION 'PRIVATE_PROFILE_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.adult_eligibility_records adult WHERE adult.user_id=NEW.owner_user_id
    AND adult.adult_eligible=true AND adult.verification_method='self_attestation' AND adult.policy_version='phase10b-2026-07-28')
    OR EXISTS(
      SELECT required_type FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
      WHERE NOT EXISTS(SELECT 1 FROM public.consent_records consent WHERE consent.user_id=NEW.owner_user_id
        AND consent.consent_type=required_type AND consent.consented=true AND consent.policy_version='phase10b-2026-07-28')
    ) THEN RAISE EXCEPTION 'ADULT_CONSENT_REQUIRED'; END IF;
  SELECT count(*) INTO existing_count FROM public.profile_school_memberships existing
    WHERE existing.profile_id=NEW.profile_id AND existing.id<>NEW.id;
  IF existing_count>0 THEN RAISE EXCEPTION 'SECOND_SCHOOL_NOT_ALLOWED'; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS phase10j_beta_school_scope ON public.profile_school_memberships;
CREATE TRIGGER phase10j_beta_school_scope
BEFORE INSERT OR UPDATE OF school_id,graduation_year,profile_id,owner_user_id
ON public.profile_school_memberships FOR EACH ROW EXECUTE FUNCTION public.enforce_controlled_beta_school_membership();

CREATE OR REPLACE FUNCTION public.admin_controlled_beta_stop(
  requested_scope text, requested_reason text, admin_actor text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer:=0;
BEGIN
  IF requested_scope NOT IN ('all','account_registration','private_profile','people_search','messaging','promotion_application','promotion_operations','invites')
    OR requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_STOP_REQUEST'; END IF;
  IF requested_scope='all' THEN
    UPDATE public.beta_programs program SET
      emergency_disabled_at=clock_timestamp(),
      status=CASE WHEN program.status='active' AND EXISTS(
        SELECT 1 FROM public.beta_program_setup_snapshots snapshot WHERE snapshot.program_id=program.id
      ) THEN 'paused' ELSE program.status END,
      updated_at=now()
    WHERE program.status IN ('active','paused') AND program.emergency_disabled_at IS NULL;
    GET DIAGNOSTICS affected=ROW_COUNT;
  ELSIF requested_scope='invites' THEN
    UPDATE public.beta_invites SET revoked_at=now() WHERE revoked_at IS NULL AND expires_at>now();
    GET DIAGNOSTICS affected=ROW_COUNT;
  ELSE
    INSERT INTO public.beta_feature_flags(program_id,user_id,feature_key,enabled,reason_code,updated_by)
    VALUES(NULL,NULL,requested_scope,false,requested_reason,admin_actor)
    ON CONFLICT(feature_key) WHERE program_id IS NULL AND user_id IS NULL
    DO UPDATE SET enabled=false,reason_code=excluded.reason_code,updated_by=excluded.updated_by,updated_at=now();
    affected:=1;
  END IF;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,reason_code,metadata)
  VALUES('admin',admin_actor,'controlled_beta_stop','beta_operation',requested_reason,
    jsonb_build_object('scope',requested_scope,'affected',affected));
  RETURN affected;
END; $$;

REVOKE ALL ON FUNCTION public.prevent_beta_program_school_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enforce_controlled_beta_school_membership() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_activate_beta_setup(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_configure_controlled_beta_features(uuid,text[],text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_start_controlled_beta_program(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_reactivate_controlled_beta_program(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_issue_beta_invite(uuid,text,text,text,integer,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_review_beta_member(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_set_beta_emergency(uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_record_beta_readiness(uuid,text,jsonb,text[],boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_controlled_beta_stop(text,text,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_activate_beta_setup(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_configure_controlled_beta_features(uuid,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_start_controlled_beta_program(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_controlled_beta_program(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_issue_beta_invite(uuid,text,text,text,integer,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_beta_member(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_beta_emergency(uuid,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_beta_readiness(uuid,text,jsonb,text[],boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_controlled_beta_stop(text,text,text) TO service_role;

COMMENT ON TABLE public.beta_program_schools IS
  'Immutable one-school authorization boundary for snapshot-backed controlled beta programs.';
COMMENT ON COLUMN public.beta_setup_drafts.target_scope IS
  'Operator-facing description only; never an authorization boundary.';
COMMENT ON COLUMN public.beta_setup_drafts.target_school_id IS
  'Validated school UUID copied into the immutable setup snapshot.';
COMMENT ON COLUMN public.beta_members.target_school_id IS
  'Immutable beta school scope copied from the program allowlist during invite redemption.';
