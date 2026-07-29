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
DECLARE result_id uuid;
BEGIN
  IF requested_status NOT IN ('draft','validated','archived') THEN RAISE EXCEPTION 'INVALID_SETUP_STATUS'; END IF;
  IF requested_features IS NULL OR NOT (requested_features <@ ARRAY['account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations']::text[]) THEN RAISE EXCEPTION 'INVALID_FEATURES'; END IF;
  INSERT INTO public.beta_setup_drafts(id,draft_key,name,starts_at,ends_at,max_users,target_scope,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,operator_memo,status,created_by)
  VALUES(coalesce(target_draft_id,extensions.uuid_generate_v4()),requested_draft_key,requested_name,requested_starts_at,requested_ends_at,requested_max_users,requested_target_scope,requested_features,coalesce(requested_invite_policy,'{}'::jsonb),requested_waitlist,coalesce(requested_stop_conditions,'{}'::jsonb),coalesce(requested_memo,''),requested_status,admin_actor)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,starts_at=excluded.starts_at,ends_at=excluded.ends_at,max_users=excluded.max_users,target_scope=excluded.target_scope,enabled_features=excluded.enabled_features,invite_policy=excluded.invite_policy,approval_waitlist_enabled=excluded.approval_waitlist_enabled,stop_conditions=excluded.stop_conditions,operator_memo=excluded.operator_memo,status=excluded.status,updated_at=now()
  RETURNING id INTO result_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'beta_setup_saved','beta_setup_draft',result_id,upper(requested_status));
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_activate_beta_setup(target_draft_id uuid, admin_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft public.beta_setup_drafts%ROWTYPE; program_id uuid;
BEGIN
  SELECT * INTO draft FROM public.beta_setup_drafts WHERE id=target_draft_id FOR UPDATE;
  IF draft.id IS NULL OR draft.status<>'validated' THEN RAISE EXCEPTION 'SETUP_NOT_VALIDATED'; END IF;
  INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at,ends_at)
  VALUES(draft.draft_key,draft.name,'paused',true,draft.starts_at,draft.ends_at) RETURNING id INTO program_id;
  UPDATE public.beta_setup_drafts SET status='activated',updated_at=now() WHERE id=draft.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'beta_setup_activated','beta_program',program_id,'CREATED_PAUSED',jsonb_build_object('draft_id',draft.id));
  RETURN program_id;
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
  FOREACH table_name IN ARRAY ARRAY['beta_setup_drafts','beta_operator_notes','beta_feedback','beta_operation_tasks','beta_campaigns','beta_campaign_aggregates','beta_readiness_snapshots']
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
REVOKE ALL ON FUNCTION public.admin_update_beta_task(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_controlled_beta_stop(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_create_beta_task(uuid,text,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_create_beta_note(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_create_beta_campaign(uuid,uuid,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_record_beta_readiness(uuid,text,jsonb,text[],boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.has_active_beta_program_membership(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,text[],jsonb,boolean,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_activate_beta_setup(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_beta_task(uuid,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_controlled_beta_stop(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_beta_task(uuid,text,text,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_beta_note(uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_beta_campaign(uuid,uuid,text,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_beta_readiness(uuid,text,jsonb,text[],boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_beta_program_membership(uuid,uuid) TO authenticated;
