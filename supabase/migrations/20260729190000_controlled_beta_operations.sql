-- PHASE 10I: operator-only controlled beta operations.
-- Stores no raw email, name, Instagram, search query, message, IP, cookie, or token.

CREATE TABLE public.beta_setup_drafts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  draft_key text NOT NULL UNIQUE CHECK (draft_key ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  starts_at timestamptz,
  ends_at timestamptz,
  max_users integer NOT NULL CHECK (max_users BETWEEN 1 AND 1000),
  target_scope text NOT NULL CHECK (char_length(target_scope) BETWEEN 2 AND 120),
  enabled_features text[] NOT NULL DEFAULT '{}'::text[] CHECK (
    enabled_features <@ ARRAY['account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations']::text[]
  ),
  invite_policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(invite_policy)='object'),
  approval_waitlist_enabled boolean NOT NULL DEFAULT true,
  stop_conditions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(stop_conditions)='object'),
  operator_memo text NOT NULL DEFAULT '' CHECK (char_length(operator_memo) <= 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','activated','archived')),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE public.beta_program_setup_snapshots (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid NOT NULL UNIQUE REFERENCES public.beta_programs(id) ON DELETE RESTRICT,
  source_draft_id uuid NOT NULL UNIQUE REFERENCES public.beta_setup_drafts(id) ON DELETE RESTRICT,
  max_users integer NOT NULL CHECK (max_users BETWEEN 1 AND 1000),
  target_scope text NOT NULL CHECK (char_length(target_scope) BETWEEN 2 AND 120),
  enabled_features text[] NOT NULL CHECK (
    enabled_features <@ ARRAY['account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations']::text[]
    AND (NOT ('messaging'=ANY(enabled_features)) OR 'connection_request'=ANY(enabled_features))
    AND (NOT ('connection_request'=ANY(enabled_features)) OR 'people_search'=ANY(enabled_features))
  ),
  invite_policy jsonb NOT NULL CHECK (
    jsonb_typeof(invite_policy)='object'
    AND CASE WHEN jsonb_typeof(invite_policy->'maxUsesPerInvite')='number' AND (invite_policy->>'maxUsesPerInvite') ~ '^[0-9]+$'
      THEN (invite_policy->>'maxUsesPerInvite')::integer BETWEEN 1 AND 100 ELSE false END
    AND CASE WHEN jsonb_typeof(invite_policy->'expiresInDays')='number' AND (invite_policy->>'expiresInDays') ~ '^[0-9]+$'
      THEN (invite_policy->>'expiresInDays')::integer BETWEEN 1 AND 30 ELSE false END
  ),
  approval_waitlist_enabled boolean NOT NULL,
  stop_conditions jsonb NOT NULL CHECK (
    jsonb_typeof(stop_conditions)='object'
    AND stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb
  ),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.prevent_beta_program_setup_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'PROGRAM_SETUP_SNAPSHOT_IMMUTABLE';
END; $$;
CREATE TRIGGER beta_program_setup_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.beta_program_setup_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_beta_program_setup_snapshot_mutation();

CREATE TABLE public.beta_operator_notes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('program','member','school','advertiser','feedback','task','incident')),
  entity_id uuid,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','archived')),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.beta_feedback (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid NOT NULL REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('error','confusing','missing_feature','greeting_message','privacy','advertising','other')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 2000),
  page_path text NOT NULL CHECK (char_length(page_path) BETWEEN 1 AND 300 AND page_path LIKE '/%'),
  coarse_browser text CHECK (coarse_browser IS NULL OR coarse_browser IN ('chrome','safari','edge','firefox','other')),
  coarse_device text CHECK (coarse_device IS NULL OR coarse_device IN ('mobile','tablet','desktop','other')),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[A-Z0-9_]{2,60}$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','in_progress','resolved','dismissed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to text CHECK (assigned_to IS NULL OR char_length(assigned_to) BETWEEN 1 AND 100),
  resolution_code text CHECK (resolution_code IS NULL OR resolution_code ~ '^[A-Z0-9_]{2,60}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beta_feedback_owner_idx ON public.beta_feedback(owner_user_id,created_at DESC);
CREATE INDEX beta_feedback_queue_idx ON public.beta_feedback(status,priority,created_at);

CREATE TABLE public.beta_operation_tasks (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN ('beta_approval','onboarding_failure','report','block_review','deletion_request','advertiser_verification','advertiser_review','quote','payment_confirmation','ad_schedule','refund','cron_failure','outbox_failure','feedback','health_warning')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','resolved','dismissed')),
  entity_type text,
  entity_id uuid,
  due_at timestamptz,
  assigned_to text CHECK (assigned_to IS NULL OR char_length(assigned_to) BETWEEN 1 AND 100),
  safe_summary text NOT NULL CHECK (char_length(safe_summary) BETWEEN 1 AND 300),
  resolution_code text CHECK (resolution_code IS NULL OR resolution_code ~ '^[A-Z0-9_]{2,60}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX beta_operation_tasks_queue_idx ON public.beta_operation_tasks(status,priority,due_at NULLS LAST,created_at);

CREATE TABLE public.beta_campaigns (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid NOT NULL REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  campaign_code text NOT NULL UNIQUE CHECK (campaign_code ~ '^[a-z0-9][a-z0-9_-]{2,79}$'),
  channel text NOT NULL CHECK (channel IN ('instagram','threads','x','tiktok','youtube','community','creator','direct','other')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','active','paused','completed','cancelled')),
  invite_id uuid REFERENCES public.beta_invites(id) ON DELETE SET NULL,
  next_action text CHECK (next_action IS NULL OR char_length(next_action) <= 300),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE public.beta_campaign_aggregates (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.beta_campaigns(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  metric_key text NOT NULL CHECK (metric_key IN ('invite_issued','invite_redeemed','approved','onboarding_ready','school_added','people_search','greeting_sent','accepted','first_reply','report_or_block','advertiser_application','review_pending','payment_pending','active_ad','task_open','cron_failure','outbox_failure')),
  segment_key text NOT NULL DEFAULT 'all' CHECK (segment_key ~ '^[a-z0-9][a-z0-9:_-]{0,79}$'),
  metric_count integer,
  masked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,metric_date,metric_key,segment_key),
  CHECK ((masked AND metric_count IS NULL) OR (NOT masked AND metric_count >= 10))
);

CREATE TABLE public.beta_readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('blocked','internal_only','limited_beta','beta_stable','launch_candidate')),
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(criteria)='object'),
  blocker_codes text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(blocker_codes)=0 OR array_to_string(blocker_codes,',') ~ '^([A-Z0-9_]{2,60})(,[A-Z0-9_]{2,60})*$'),
  operator_decision boolean NOT NULL DEFAULT false,
  decided_by text NOT NULL CHECK (char_length(decided_by) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.admin_save_beta_setup(
  target_draft_id uuid, requested_draft_key text, requested_name text,
  requested_starts_at timestamptz, requested_ends_at timestamptz, requested_max_users integer,
  requested_target_scope text, requested_features text[], requested_invite_policy jsonb,
  requested_waitlist boolean, requested_stop_conditions jsonb, requested_memo text,
  requested_status text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid; existing_draft public.beta_setup_drafts%ROWTYPE; previous_key text;
BEGIN
  IF requested_status NOT IN ('draft','validated','archived') THEN RAISE EXCEPTION 'INVALID_SETUP_STATUS'; END IF;
  IF requested_draft_key !~ '^[a-z0-9][a-z0-9_-]{2,39}$' THEN RAISE EXCEPTION 'INVALID_DRAFT_KEY'; END IF;
  IF requested_features IS NULL OR NOT (requested_features <@ ARRAY['account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations']::text[])
    OR ('messaging'=ANY(requested_features) AND NOT ('connection_request'=ANY(requested_features)))
    OR ('connection_request'=ANY(requested_features) AND NOT ('people_search'=ANY(requested_features)))
    THEN RAISE EXCEPTION 'INVALID_FEATURES'; END IF;
  IF requested_stop_conditions IS NULL OR jsonb_typeof(requested_stop_conditions) IS DISTINCT FROM 'object'
    OR NOT (requested_stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'REQUIRED_STOP_CONDITION_MISSING'; END IF;
  IF requested_invite_policy IS NULL OR jsonb_typeof(requested_invite_policy) IS DISTINCT FROM 'object'
    OR jsonb_typeof(requested_invite_policy->'maxUsesPerInvite') IS DISTINCT FROM 'number'
    OR jsonb_typeof(requested_invite_policy->'expiresInDays') IS DISTINCT FROM 'number'
    OR NOT coalesce((requested_invite_policy->>'maxUsesPerInvite') ~ '^[0-9]+$',false)
    OR NOT coalesce((requested_invite_policy->>'expiresInDays') ~ '^[0-9]+$',false)
    THEN RAISE EXCEPTION 'INVALID_INVITE_POLICY'; END IF;
  IF (requested_invite_policy->>'maxUsesPerInvite')::integer NOT BETWEEN 1 AND 100
    OR (requested_invite_policy->>'expiresInDays')::integer NOT BETWEEN 1 AND 30
    THEN RAISE EXCEPTION 'INVALID_INVITE_POLICY'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase10i-program-key:'||requested_draft_key,0));
  IF EXISTS(SELECT 1 FROM public.beta_programs WHERE program_key=requested_draft_key) THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END IF;

  IF target_draft_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.beta_setup_drafts WHERE draft_key=requested_draft_key) THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END IF;
    BEGIN
      INSERT INTO public.beta_setup_drafts(draft_key,name,starts_at,ends_at,max_users,target_scope,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,operator_memo,status,created_by)
      VALUES(requested_draft_key,requested_name,requested_starts_at,requested_ends_at,requested_max_users,requested_target_scope,requested_features,requested_invite_policy,requested_waitlist,requested_stop_conditions,coalesce(requested_memo,''),requested_status,admin_actor)
      RETURNING id INTO result_id;
    EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END;
    previous_key:=NULL;
  ELSE
    SELECT * INTO existing_draft FROM public.beta_setup_drafts WHERE id=target_draft_id FOR UPDATE;
    IF existing_draft.id IS NULL THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND'; END IF;
    IF existing_draft.status='activated' THEN RAISE EXCEPTION 'DRAFT_ALREADY_ACTIVATED'; END IF;
    IF EXISTS(SELECT 1 FROM public.beta_setup_drafts WHERE draft_key=requested_draft_key AND id<>target_draft_id) THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END IF;
    previous_key:=existing_draft.draft_key;
    BEGIN
      UPDATE public.beta_setup_drafts SET draft_key=requested_draft_key,name=requested_name,starts_at=requested_starts_at,ends_at=requested_ends_at,max_users=requested_max_users,target_scope=requested_target_scope,enabled_features=requested_features,invite_policy=requested_invite_policy,approval_waitlist_enabled=requested_waitlist,stop_conditions=requested_stop_conditions,operator_memo=coalesce(requested_memo,''),status=requested_status,updated_at=now()
      WHERE id=target_draft_id RETURNING id INTO result_id;
    EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END;
  END IF;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'beta_setup_saved','beta_setup_draft',result_id,upper(requested_status));
  IF previous_key IS DISTINCT FROM requested_draft_key THEN
    INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
    VALUES('admin',admin_actor,'beta_setup_key_changed','beta_setup_draft',result_id,'DRAFT_KEY_CHANGED',jsonb_build_object('previous_key',previous_key,'new_key',requested_draft_key));
  END IF;
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_activate_beta_setup(target_draft_id uuid, admin_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft public.beta_setup_drafts%ROWTYPE; program_id uuid; snapshot_id uuid;
BEGIN
  SELECT * INTO draft FROM public.beta_setup_drafts WHERE id=target_draft_id FOR UPDATE;
  IF draft.id IS NULL THEN RAISE EXCEPTION 'SETUP_NOT_FOUND'; END IF;
  IF draft.status='activated' THEN
    SELECT snapshot.program_id INTO program_id FROM public.beta_program_setup_snapshots snapshot WHERE snapshot.source_draft_id=draft.id;
    IF program_id IS NULL THEN RAISE EXCEPTION 'ACTIVATED_SETUP_SNAPSHOT_MISSING'; END IF;
    RETURN program_id;
  END IF;
  IF draft.status<>'validated' THEN RAISE EXCEPTION 'SETUP_NOT_VALIDATED'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase10i-program-key:'||draft.draft_key,0));
  IF EXISTS(SELECT 1 FROM public.beta_programs WHERE program_key=draft.draft_key) THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END IF;
  BEGIN
    INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at,ends_at)
    VALUES(draft.draft_key,draft.name,'paused',true,draft.starts_at,draft.ends_at) RETURNING id INTO program_id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END;
  INSERT INTO public.beta_program_setup_snapshots(program_id,source_draft_id,max_users,target_scope,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,created_by)
  VALUES(program_id,draft.id,draft.max_users,draft.target_scope,draft.enabled_features,draft.invite_policy,draft.approval_waitlist_enabled,draft.stop_conditions,admin_actor)
  RETURNING id INTO snapshot_id;
  UPDATE public.beta_setup_drafts SET status='activated',updated_at=now() WHERE id=draft.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'beta_setup_activated','beta_program',program_id,'CREATED_PAUSED',jsonb_build_object('draft_id',draft.id,'snapshot_id',snapshot_id));
  RETURN program_id;
END; $$;

-- A PHASE 10I program contract restricts every effective feature even when an older
-- global or user flag is enabled. Programs without a snapshot retain PHASE 10F behavior.
CREATE OR REPLACE FUNCTION public.has_beta_feature_access(target_user_id uuid, requested_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT target_user_id IS NOT NULL
    AND (auth.uid()=target_user_id OR auth.role()='service_role' OR session_user='postgres')
    AND requested_feature IN ('account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations')
    AND NOT EXISTS (
      SELECT 1 FROM public.beta_feature_flags f
      WHERE f.program_id IS NULL AND f.user_id IS NULL AND f.feature_key=requested_feature AND f.enabled=false
        AND f.reason_code='EMERGENCY_DISABLED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.safety_account_restrictions r
      WHERE r.user_id=target_user_id AND r.status='suspended'
    )
    AND EXISTS (
      SELECT 1 FROM public.beta_members m
      JOIN public.beta_programs p ON p.id=m.program_id
      LEFT JOIN public.beta_program_setup_snapshots snapshot ON snapshot.program_id=p.id
      WHERE m.user_id=target_user_id AND m.status='active' AND p.status='active'
        AND p.emergency_disabled_at IS NULL
        AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now())
        AND (snapshot.id IS NULL OR requested_feature=ANY(snapshot.enabled_features))
        AND COALESCE(
          (SELECT f.enabled FROM public.beta_feature_flags f WHERE f.user_id=target_user_id AND f.program_id IS NULL AND f.feature_key=requested_feature),
          (SELECT f.enabled FROM public.beta_feature_flags f WHERE f.program_id=p.id AND f.user_id IS NULL AND f.feature_key=requested_feature),
          (SELECT f.enabled FROM public.beta_feature_flags f WHERE f.program_id IS NULL AND f.user_id IS NULL AND f.feature_key=requested_feature),
          false
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_issue_beta_invite(
  target_program_id uuid, requested_token_hash text, requested_email_hash text,
  requested_domain_hash text, requested_max_uses integer,
  requested_expires_at timestamptz, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite_id uuid; snapshot public.beta_program_setup_snapshots%ROWTYPE;
BEGIN
  IF requested_token_hash !~ '^[0-9a-f]{64}$' OR requested_expires_at<=now()
    OR requested_expires_at>now()+interval '90 days' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_INVITE'; END IF;
  PERFORM 1 FROM public.beta_programs WHERE id=target_program_id AND status IN ('paused','active') AND emergency_disabled_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRAM_UNAVAILABLE'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=target_program_id;
  IF snapshot.id IS NOT NULL THEN
    IF requested_max_uses<1 OR requested_max_uses>(snapshot.invite_policy->>'maxUsesPerInvite')::integer
      THEN RAISE EXCEPTION 'INVITE_MAX_USES_EXCEEDS_SETUP'; END IF;
    IF requested_expires_at>now()+make_interval(days=>(snapshot.invite_policy->>'expiresInDays')::integer)
      THEN RAISE EXCEPTION 'INVITE_EXPIRY_EXCEEDS_SETUP'; END IF;
  END IF;
  INSERT INTO public.beta_invites(program_id,token_hash,email_hash,domain_hash,max_uses,expires_at,created_by)
  VALUES(target_program_id,requested_token_hash,requested_email_hash,requested_domain_hash,requested_max_uses,requested_expires_at,admin_actor)
  RETURNING id INTO invite_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id)
  VALUES('admin',admin_actor,'invite_issued','beta_invite',invite_id);
  RETURN invite_id;
END; $$;

CREATE OR REPLACE FUNCTION public.redeem_beta_invite(
  actor_user_id uuid, requested_token_hash text, actor_email_hash text, actor_domain_hash text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite public.beta_invites%ROWTYPE; program public.beta_programs%ROWTYPE; snapshot public.beta_program_setup_snapshots%ROWTYPE; next_status text; reserved_count integer;
BEGIN
  IF requested_token_hash !~ '^[0-9a-f]{64}$' OR actor_email_hash !~ '^[0-9a-f]{64}$'
    OR actor_domain_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'INVALID'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.adult_eligibility_records a
    WHERE a.user_id=actor_user_id AND a.adult_eligible=true
      AND a.verification_method='self_attestation' AND a.policy_version='phase10b-2026-07-28'
  ) OR EXISTS(
    SELECT required_type FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
    WHERE NOT EXISTS(
      SELECT 1 FROM public.consent_records c WHERE c.user_id=actor_user_id
        AND c.consent_type=required_type AND c.consented=true AND c.policy_version='phase10b-2026-07-28'
    )
  ) THEN RETURN 'ADULT_CONSENT_REQUIRED'; END IF;
  SELECT * INTO invite FROM public.beta_invites WHERE token_hash=requested_token_hash FOR UPDATE;
  IF invite.id IS NULL THEN RETURN 'UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.beta_members m WHERE m.program_id=invite.program_id AND m.user_id=actor_user_id)
    THEN RETURN 'ALREADY_REDEEMED'; END IF;
  IF invite.revoked_at IS NOT NULL OR invite.expires_at<=now() OR invite.use_count>=invite.max_uses
    THEN RETURN 'UNAVAILABLE'; END IF;
  IF invite.email_hash IS NOT NULL AND invite.email_hash<>actor_email_hash THEN RETURN 'IDENTITY_MISMATCH'; END IF;
  IF invite.domain_hash IS NOT NULL AND invite.domain_hash<>actor_domain_hash THEN RETURN 'IDENTITY_MISMATCH'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=invite.program_id AND status='active'
    AND emergency_disabled_at IS NULL AND (starts_at IS NULL OR starts_at<=now())
    AND (ends_at IS NULL OR ends_at>now()) FOR UPDATE;
  IF program.id IS NULL THEN RETURN 'PROGRAM_UNAVAILABLE'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  IF snapshot.id IS NOT NULL THEN
    IF NOT snapshot.approval_waitlist_enabled THEN RETURN 'WAITLIST_DISABLED'; END IF;
    SELECT count(*) INTO reserved_count FROM public.beta_members
      WHERE program_id=program.id AND status IN ('pending_review','active','suspended');
    IF reserved_count>=snapshot.max_users THEN RETURN 'PROGRAM_FULL'; END IF;
  END IF;
  next_status:=CASE WHEN program.requires_admin_approval THEN 'pending_review' ELSE 'active' END;
  INSERT INTO public.beta_members(program_id,user_id,invite_id,status)
  VALUES(program.id,actor_user_id,invite.id,next_status);
  UPDATE public.beta_invites SET use_count=use_count+1 WHERE id=invite.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id)
  VALUES('user',actor_user_id::text,'invite_redeemed','beta_member',actor_user_id);
  RETURN upper(next_status);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_beta_member(
  target_member_id uuid, requested_status text, requested_reason text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.beta_members%ROWTYPE; snapshot public.beta_program_setup_snapshots%ROWTYPE; occupied_count integer;
BEGIN
  IF requested_status NOT IN ('active','suspended','rejected','withdrawn') OR requested_reason !~ '^[A-Z0-9_]{2,60}$'
    THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
  SELECT * INTO member FROM public.beta_members WHERE id=target_member_id FOR UPDATE;
  IF member.id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  PERFORM 1 FROM public.beta_programs WHERE id=member.program_id FOR UPDATE;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=member.program_id;
  IF requested_status='active' AND member.status<>'active' AND snapshot.id IS NOT NULL THEN
    SELECT count(*) INTO occupied_count FROM public.beta_members
      WHERE program_id=member.program_id AND id<>member.id AND status IN ('pending_review','active','suspended');
    IF occupied_count>=snapshot.max_users THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  END IF;
  UPDATE public.beta_members SET status=requested_status,reviewed_at=now(),reviewed_by=admin_actor,reason_code=requested_reason,updated_at=now()
  WHERE id=target_member_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'member_reviewed','beta_member',target_member_id,requested_reason);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_beta_feature(
  target_program_id uuid, target_user_id uuid, requested_feature text,
  requested_enabled boolean, requested_reason text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE flag_id uuid; snapshot public.beta_program_setup_snapshots%ROWTYPE;
BEGIN
  IF requested_feature NOT IN ('account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations')
    OR requested_reason !~ '^[A-Z0-9_]{2,60}$' THEN RAISE EXCEPTION 'INVALID_FEATURE'; END IF;
  IF target_program_id IS NOT NULL AND requested_enabled THEN
    SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=target_program_id;
    IF snapshot.id IS NOT NULL AND NOT (requested_feature=ANY(snapshot.enabled_features))
      THEN RAISE EXCEPTION 'FEATURE_NOT_IN_SETUP'; END IF;
  END IF;
  IF target_program_id IS NULL AND target_user_id IS NOT NULL AND requested_enabled
    AND EXISTS(SELECT 1 FROM public.beta_members member JOIN public.beta_program_setup_snapshots contract ON contract.program_id=member.program_id WHERE member.user_id=target_user_id)
    AND NOT EXISTS(SELECT 1 FROM public.beta_members member JOIN public.beta_program_setup_snapshots contract ON contract.program_id=member.program_id WHERE member.user_id=target_user_id AND requested_feature=ANY(contract.enabled_features))
    THEN RAISE EXCEPTION 'FEATURE_NOT_IN_SETUP'; END IF;
  INSERT INTO public.beta_feature_flags(program_id,user_id,feature_key,enabled,reason_code,updated_by)
  VALUES(target_program_id,target_user_id,requested_feature,requested_enabled,requested_reason,admin_actor)
  ON CONFLICT DO NOTHING RETURNING id INTO flag_id;
  IF flag_id IS NULL THEN
    UPDATE public.beta_feature_flags SET enabled=requested_enabled,reason_code=requested_reason,updated_by=admin_actor,updated_at=now()
    WHERE feature_key=requested_feature AND program_id IS NOT DISTINCT FROM target_program_id AND user_id IS NOT DISTINCT FROM target_user_id RETURNING id INTO flag_id;
  END IF;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'feature_updated','beta_feature_flag',flag_id,requested_reason);
  RETURN flag_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_beta_task(
  target_task_id uuid, requested_status text, requested_priority text,
  requested_assignee text, requested_resolution text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_status NOT IN ('open','assigned','in_progress','resolved','dismissed') OR requested_priority NOT IN ('low','normal','high','urgent') THEN RAISE EXCEPTION 'INVALID_TASK_STATE'; END IF;
  UPDATE public.beta_operation_tasks SET status=requested_status,priority=requested_priority,assigned_to=requested_assignee,resolution_code=requested_resolution,updated_at=now(),resolved_at=CASE WHEN requested_status IN ('resolved','dismissed') THEN now() ELSE NULL END WHERE id=target_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'beta_task_updated','beta_operation_task',target_task_id,coalesce(requested_resolution,upper(requested_status)));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_controlled_beta_stop(requested_scope text, requested_reason text, admin_actor text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer:=0;
BEGIN
  IF requested_scope NOT IN ('all','people_search','messaging','promotion_application','promotion_operations','invites') OR requested_reason !~ '^[A-Z0-9_]{2,60}$' THEN RAISE EXCEPTION 'INVALID_STOP_REQUEST'; END IF;
  IF requested_scope='all' THEN
    UPDATE public.beta_programs SET emergency_disabled_at=now(),updated_at=now() WHERE status IN ('active','paused') AND emergency_disabled_at IS NULL;
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
  VALUES('admin',admin_actor,'controlled_beta_stop','beta_operation',requested_reason,jsonb_build_object('scope',requested_scope,'affected',affected));
  RETURN affected;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_beta_task(
  target_program_id uuid, requested_task_type text, requested_priority text,
  requested_summary text, requested_due_at timestamptz, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  INSERT INTO public.beta_operation_tasks(program_id,task_type,priority,safe_summary,due_at)
  VALUES(target_program_id,requested_task_type,requested_priority,requested_summary,requested_due_at) RETURNING id INTO result_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id)
  VALUES('admin',admin_actor,'beta_task_created','beta_operation_task',result_id);
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_beta_note(
  target_program_id uuid, requested_entity_type text, requested_entity_id uuid,
  requested_note text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  INSERT INTO public.beta_operator_notes(program_id,entity_type,entity_id,note,created_by)
  VALUES(target_program_id,requested_entity_type,requested_entity_id,requested_note,admin_actor) RETURNING id INTO result_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id)
  VALUES('admin',admin_actor,'beta_note_created','beta_operator_note',result_id);
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_beta_campaign(
  target_program_id uuid, target_school_id uuid, requested_campaign_code text,
  requested_channel text, target_invite_id uuid, requested_next_action text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  INSERT INTO public.beta_campaigns(program_id,school_id,campaign_code,channel,invite_id,next_action,created_by)
  VALUES(target_program_id,target_school_id,requested_campaign_code,requested_channel,target_invite_id,requested_next_action,admin_actor) RETURNING id INTO result_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id)
  VALUES('admin',admin_actor,'beta_campaign_created','beta_campaign',result_id);
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_record_beta_readiness(
  target_program_id uuid, requested_status text, requested_criteria jsonb,
  requested_blockers text[], requested_operator_decision boolean, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  IF requested_status='launch_candidate' AND NOT requested_operator_decision THEN RAISE EXCEPTION 'OPERATOR_DECISION_REQUIRED'; END IF;
  INSERT INTO public.beta_readiness_snapshots(program_id,status,criteria,blocker_codes,operator_decision,decided_by)
  VALUES(target_program_id,requested_status,coalesce(requested_criteria,'{}'::jsonb),coalesce(requested_blockers,'{}'::text[]),requested_operator_decision,admin_actor) RETURNING id INTO result_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'beta_readiness_recorded','beta_readiness_snapshot',result_id,upper(requested_status));
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.has_active_beta_program_membership(actor_user_id uuid, target_program_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT actor_user_id IS NOT NULL AND actor_user_id=auth.uid() AND target_program_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.beta_members member JOIN public.beta_programs program ON program.id=member.program_id
    WHERE member.program_id=target_program_id AND member.user_id=actor_user_id AND member.status='active'
      AND program.status='active' AND program.emergency_disabled_at IS NULL
  );
$$;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['beta_setup_drafts','beta_program_setup_snapshots','beta_operator_notes','beta_feedback','beta_operation_tasks','beta_campaigns','beta_campaign_aggregates','beta_readiness_snapshots']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',table_name);
  END LOOP;
END $$;

GRANT SELECT,INSERT ON public.beta_feedback TO authenticated;
CREATE POLICY beta_feedback_owner_select ON public.beta_feedback FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY beta_feedback_owner_insert ON public.beta_feedback FOR INSERT TO authenticated WITH CHECK(
  owner_user_id=auth.uid() AND public.has_active_beta_program_membership(auth.uid(),program_id)
);

REVOKE ALL ON FUNCTION public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,text[],jsonb,boolean,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_activate_beta_setup(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_issue_beta_invite(uuid,text,text,text,integer,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_review_beta_member(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_set_beta_feature(uuid,uuid,text,boolean,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.has_beta_feature_access(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.redeem_beta_invite(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.prevent_beta_program_setup_snapshot_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_update_beta_task(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_controlled_beta_stop(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_create_beta_task(uuid,text,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_create_beta_note(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_create_beta_campaign(uuid,uuid,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_record_beta_readiness(uuid,text,jsonb,text[],boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.has_active_beta_program_membership(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,text[],jsonb,boolean,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_activate_beta_setup(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_issue_beta_invite(uuid,text,text,text,integer,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_beta_member(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_beta_feature(uuid,uuid,text,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_beta_invite(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_beta_feature_access(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_beta_task(uuid,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_controlled_beta_stop(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_beta_task(uuid,text,text,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_beta_note(uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_beta_campaign(uuid,uuid,text,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_beta_readiness(uuid,text,jsonb,text[],boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_beta_program_membership(uuid,uuid) TO authenticated;
