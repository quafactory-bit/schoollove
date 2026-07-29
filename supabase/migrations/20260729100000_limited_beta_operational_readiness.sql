-- PHASE 10F: limited-beta access control and operational readiness.
-- This migration never changes or assigns ownership of existing profile rows.

CREATE TABLE public.beta_programs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_key text NOT NULL UNIQUE CHECK (program_key ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','closed')),
  requires_admin_approval boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  emergency_disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE public.beta_invites (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid NOT NULL REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  email_hash text CHECK (email_hash IS NULL OR email_hash ~ '^[0-9a-f]{64}$'),
  domain_hash text CHECK (domain_hash IS NULL OR domain_hash ~ '^[0-9a-f]{64}$'),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 1000),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0 AND use_count <= max_uses),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE TABLE public.beta_members (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid NOT NULL REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_id uuid REFERENCES public.beta_invites(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','active','suspended','rejected','withdrawn')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  reason_code text CHECK (reason_code IS NULL OR reason_code ~ '^[A-Z0-9_]{2,60}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id,user_id)
);

CREATE TABLE public.beta_feature_flags (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL CHECK (feature_key IN (
    'account_registration','private_profile','people_search','connection_request','messaging',
    'instagram_permission','promotion_application','promotion_operations'
  )),
  enabled boolean NOT NULL DEFAULT false,
  reason_code text NOT NULL DEFAULT 'LIMITED_BETA' CHECK (reason_code ~ '^[A-Z0-9_]{2,60}$'),
  updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (program_id IS NOT NULL AND user_id IS NOT NULL))
);
CREATE UNIQUE INDEX beta_feature_flags_global_unique ON public.beta_feature_flags(feature_key)
  WHERE program_id IS NULL AND user_id IS NULL;
CREATE UNIQUE INDEX beta_feature_flags_program_unique ON public.beta_feature_flags(program_id,feature_key)
  WHERE program_id IS NOT NULL AND user_id IS NULL;
CREATE UNIQUE INDEX beta_feature_flags_user_unique ON public.beta_feature_flags(user_id,feature_key)
  WHERE program_id IS NULL AND user_id IS NOT NULL;

CREATE TABLE public.beta_audit_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin','service','user','system')),
  actor_reference text NOT NULL CHECK (char_length(actor_reference) BETWEEN 1 AND 100),
  action text NOT NULL CHECK (action ~ '^[a-z0-9_]{3,80}$'),
  target_type text NOT NULL CHECK (target_type ~ '^[a-z0-9_]{3,80}$'),
  target_id uuid,
  reason_code text CHECK (reason_code IS NULL OR reason_code ~ '^[A-Z0-9_]{2,60}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.operational_job_runs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  job_key text NOT NULL CHECK (job_key ~ '^[a-z0-9][a-z0-9:_-]{2,120}$'),
  run_key text NOT NULL UNIQUE CHECK (char_length(run_key) BETWEEN 8 AND 160),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed','skipped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result)='object'),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[A-Z0-9_]{2,60}$')
);
CREATE INDEX operational_job_runs_started_idx ON public.operational_job_runs(started_at DESC);

CREATE TABLE public.data_export_jobs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('json','csv')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','ready','expired','failed','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  expires_at timestamptz,
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[A-Z0-9_]{2,60}$'),
  CHECK (expires_at IS NULL OR ready_at IS NULL OR expires_at > ready_at)
);
CREATE UNIQUE INDEX data_export_jobs_one_open ON public.data_export_jobs(owner_user_id)
  WHERE status IN ('queued','ready');

CREATE TABLE public.retention_policy_versions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  policy_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules)='object'),
  approved_by text NOT NULL CHECK (char_length(approved_by) BETWEEN 1 AND 100),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(policy_key,version)
);
CREATE UNIQUE INDEX retention_policy_one_active ON public.retention_policy_versions(policy_key) WHERE status='active';

CREATE TABLE public.operational_event_counters (
  metric_date date NOT NULL,
  event_key text NOT NULL CHECK (event_key ~ '^[a-z0-9][a-z0-9_.-]{2,80}$'),
  count bigint NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(metric_date,event_key)
);

CREATE TABLE public.operational_incidents (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  incident_key text NOT NULL UNIQUE CHECK (incident_key ~ '^[A-Z0-9_-]{3,80}$'),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','monitoring','resolved')),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 200),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_by text NOT NULL CHECK (char_length(updated_by) BETWEEN 1 AND 100)
);

INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at)
VALUES ('limited_beta_2026','Limited beta 2026','active',true,now());

INSERT INTO public.beta_feature_flags(program_id,user_id,feature_key,enabled,reason_code,updated_by)
SELECT NULL,NULL,key,true,'LIMITED_BETA_DEFAULT_ENABLED','migration:phase10f'
FROM unnest(ARRAY[
  'account_registration','private_profile','people_search','connection_request','messaging',
  'instagram_permission','promotion_application','promotion_operations'
]) key;

INSERT INTO public.retention_policy_versions(policy_key,version,status,rules,approved_by)
VALUES ('phase10f',1,'active',jsonb_build_object(
  'match_tokens_hours',24,'verification_hours',24,'request_expiry_days',30,
  'raw_promotion_metrics_days',32,'export_ready_days',3,'job_history_days',90
),'migration:phase10f');

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
      SELECT 1 FROM public.beta_members m JOIN public.beta_programs p ON p.id=m.program_id
      WHERE m.user_id=target_user_id AND m.status='active' AND p.status='active'
        AND p.emergency_disabled_at IS NULL
        AND (p.starts_at IS NULL OR p.starts_at<=now()) AND (p.ends_at IS NULL OR p.ends_at>now())
        AND COALESCE(
          (SELECT f.enabled FROM public.beta_feature_flags f WHERE f.user_id=target_user_id AND f.program_id IS NULL AND f.feature_key=requested_feature),
          (SELECT f.enabled FROM public.beta_feature_flags f WHERE f.program_id=p.id AND f.user_id IS NULL AND f.feature_key=requested_feature),
          (SELECT f.enabled FROM public.beta_feature_flags f WHERE f.program_id IS NULL AND f.user_id IS NULL AND f.feature_key=requested_feature),
          false
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_past_graduation_year()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.graduation_year > extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer THEN
    RAISE EXCEPTION 'FUTURE_GRADUATION_YEAR_NOT_ALLOWED';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profile_school_memberships_past_year ON public.profile_school_memberships;
CREATE TRIGGER profile_school_memberships_past_year BEFORE INSERT OR UPDATE OF graduation_year
ON public.profile_school_memberships FOR EACH ROW EXECUTE FUNCTION public.enforce_past_graduation_year();

CREATE OR REPLACE FUNCTION public.enforce_beta_write_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; feature text;
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
  IF NOT public.has_beta_feature_access(actor,feature) THEN RAISE EXCEPTION 'BETA_ACCESS_REQUIRED'; END IF;
  RETURN NEW;
END; $$;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['private_profiles','profile_school_memberships','connection_match_tokens','connection_requests','connection_messages','connection_instagram_permissions','promotion_accounts','promotion_requests']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I','phase10f_beta_write',table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_beta_write_access()','phase10f_beta_write',table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.redeem_beta_invite(actor_user_id uuid, requested_token_hash text, actor_email_hash text, actor_domain_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite public.beta_invites%ROWTYPE; program public.beta_programs%ROWTYPE; next_status text;
BEGIN
  IF requested_token_hash !~ '^[0-9a-f]{64}$' OR actor_email_hash !~ '^[0-9a-f]{64}$' OR actor_domain_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'INVALID'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.adult_eligibility_records a
    WHERE a.user_id=actor_user_id AND a.adult_eligible=true
      AND a.verification_method='self_attestation' AND a.policy_version='phase10b-2026-07-28'
  ) OR EXISTS (
    SELECT required_type FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
    WHERE NOT EXISTS (
      SELECT 1 FROM public.consent_records c WHERE c.user_id=actor_user_id
        AND c.consent_type=required_type AND c.consented=true AND c.policy_version='phase10b-2026-07-28'
    )
  ) THEN RETURN 'ADULT_CONSENT_REQUIRED'; END IF;
  SELECT * INTO invite FROM public.beta_invites WHERE token_hash=requested_token_hash FOR UPDATE;
  IF invite.id IS NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at<=now() OR invite.use_count>=invite.max_uses THEN RETURN 'UNAVAILABLE'; END IF;
  IF invite.email_hash IS NOT NULL AND invite.email_hash<>actor_email_hash THEN RETURN 'IDENTITY_MISMATCH'; END IF;
  IF invite.domain_hash IS NOT NULL AND invite.domain_hash<>actor_domain_hash THEN RETURN 'IDENTITY_MISMATCH'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=invite.program_id AND status='active' AND emergency_disabled_at IS NULL FOR UPDATE;
  IF program.id IS NULL THEN RETURN 'PROGRAM_UNAVAILABLE'; END IF;
  next_status:=CASE WHEN program.requires_admin_approval THEN 'pending_review' ELSE 'active' END;
  INSERT INTO public.beta_members(program_id,user_id,invite_id,status)
  VALUES(program.id,actor_user_id,invite.id,next_status)
  ON CONFLICT(program_id,user_id) DO UPDATE SET invite_id=excluded.invite_id,status=CASE WHEN public.beta_members.status='active' THEN 'active' ELSE excluded.status END,updated_at=now();
  UPDATE public.beta_invites SET use_count=use_count+1 WHERE id=invite.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id)
  VALUES('user',actor_user_id::text,'invite_redeemed','beta_member',actor_user_id);
  RETURN upper(next_status);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_issue_beta_invite(target_program_id uuid, requested_token_hash text, requested_email_hash text, requested_domain_hash text, requested_max_uses integer, requested_expires_at timestamptz, admin_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invite_id uuid;
BEGIN
  IF requested_token_hash !~ '^[0-9a-f]{64}$' OR requested_expires_at<=now() OR requested_expires_at>now()+interval '90 days' OR char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_INVITE'; END IF;
  INSERT INTO public.beta_invites(program_id,token_hash,email_hash,domain_hash,max_uses,expires_at,created_by)
  VALUES(target_program_id,requested_token_hash,requested_email_hash,requested_domain_hash,requested_max_uses,requested_expires_at,admin_actor) RETURNING id INTO invite_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id) VALUES('admin',admin_actor,'invite_issued','beta_invite',invite_id);
  RETURN invite_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_beta_member(target_member_id uuid, requested_status text, requested_reason text, admin_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_status NOT IN ('active','suspended','rejected','withdrawn') OR requested_reason !~ '^[A-Z0-9_]{2,60}$' THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
  UPDATE public.beta_members SET status=requested_status,reviewed_at=now(),reviewed_by=admin_actor,reason_code=requested_reason,updated_at=now() WHERE id=target_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code) VALUES('admin',admin_actor,'member_reviewed','beta_member',target_member_id,requested_reason);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_beta_feature(target_program_id uuid, target_user_id uuid, requested_feature text, requested_enabled boolean, requested_reason text, admin_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE flag_id uuid;
BEGIN
  IF requested_feature NOT IN ('account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations') OR requested_reason !~ '^[A-Z0-9_]{2,60}$' THEN RAISE EXCEPTION 'INVALID_FEATURE'; END IF;
  INSERT INTO public.beta_feature_flags(program_id,user_id,feature_key,enabled,reason_code,updated_by)
  VALUES(target_program_id,target_user_id,requested_feature,requested_enabled,requested_reason,admin_actor)
  ON CONFLICT DO NOTHING RETURNING id INTO flag_id;
  IF flag_id IS NULL THEN
    UPDATE public.beta_feature_flags SET enabled=requested_enabled,reason_code=requested_reason,updated_by=admin_actor,updated_at=now()
    WHERE feature_key=requested_feature AND program_id IS NOT DISTINCT FROM target_program_id AND user_id IS NOT DISTINCT FROM target_user_id RETURNING id INTO flag_id;
  END IF;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code) VALUES('admin',admin_actor,'feature_updated','beta_feature_flag',flag_id,requested_reason);
  RETURN flag_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_beta_emergency(target_program_id uuid, requested_disabled boolean, requested_reason text, admin_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.beta_programs SET emergency_disabled_at=CASE WHEN requested_disabled THEN now() ELSE NULL END,updated_at=now() WHERE id=target_program_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code) VALUES('admin',admin_actor,CASE WHEN requested_disabled THEN 'emergency_disabled' ELSE 'emergency_restored' END,'beta_program',target_program_id,requested_reason);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.request_own_data_export(actor_user_id uuid, requested_format text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE export_id uuid;
BEGIN
  IF requested_format NOT IN ('json','csv') THEN RAISE EXCEPTION 'INVALID_FORMAT'; END IF;
  IF EXISTS(SELECT 1 FROM public.data_export_jobs WHERE owner_user_id=actor_user_id AND status IN ('queued','ready')) THEN RAISE EXCEPTION 'EXPORT_ALREADY_OPEN'; END IF;
  INSERT INTO public.data_export_jobs(owner_user_id,format) VALUES(actor_user_id,requested_format) RETURNING id INTO export_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id) VALUES('user',actor_user_id::text,'export_requested','data_export_job',export_id);
  RETURN export_id;
END; $$;

CREATE OR REPLACE FUNCTION public.record_operational_event(requested_event_key text, requested_count integer DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_event_key !~ '^[a-z0-9][a-z0-9_.-]{2,80}$' OR requested_count NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
  INSERT INTO public.operational_event_counters(metric_date,event_key,count) VALUES((now() AT TIME ZONE 'Asia/Seoul')::date,requested_event_key,requested_count)
  ON CONFLICT(metric_date,event_key) DO UPDATE SET count=public.operational_event_counters.count+excluded.count,updated_at=now();
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.run_phase10f_maintenance(requested_run_key text, requested_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  run_id uuid;
  v_result jsonb:='{}'::jsonb;
  retention jsonb;
  affected integer;
  total integer;
  item record;
  report_id uuid;
  report_start date;
  report_end date;
BEGIN
  IF char_length(requested_run_key) NOT BETWEEN 8 AND 160 THEN RAISE EXCEPTION 'INVALID_RUN_KEY'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase10f-maintenance',0));
  SELECT j.id,j.result INTO run_id,v_result FROM public.operational_job_runs j WHERE j.run_key=requested_run_key;
  IF run_id IS NOT NULL THEN RETURN v_result||jsonb_build_object('idempotent',true); END IF;
  v_result:='{}'::jsonb;
  INSERT INTO public.operational_job_runs(job_key,run_key) VALUES('phase10f_maintenance',requested_run_key) RETURNING id INTO run_id;

  BEGIN
    SELECT rules INTO retention FROM public.retention_policy_versions WHERE policy_key='phase10f' AND status='active';
    IF retention IS NULL THEN RAISE EXCEPTION 'RETENTION_POLICY_MISSING'; END IF;

    DELETE FROM public.connection_match_tokens WHERE (used_at IS NOT NULL OR expires_at<=requested_as_of) AND created_at<requested_as_of-((retention->>'match_tokens_hours')||' hours')::interval;
    GET DIAGNOSTICS affected=ROW_COUNT; v_result:=v_result||jsonb_build_object('match_tokens_deleted',affected);
    UPDATE public.connection_requests SET status='expired',updated_at=requested_as_of WHERE status='pending' AND sent_at<requested_as_of-((retention->>'request_expiry_days')||' days')::interval;
    GET DIAGNOSTICS affected=ROW_COUNT; v_result:=v_result||jsonb_build_object('connection_requests_expired',affected);
    UPDATE public.promotion_account_verifications SET used_at=requested_as_of WHERE used_at IS NULL AND verified_at IS NULL AND expires_at<=requested_as_of;
    GET DIAGNOSTICS affected=ROW_COUNT; v_result:=v_result||jsonb_build_object('promotion_verifications_expired',affected);
    UPDATE public.promotion_quotes SET status='expired',responded_at=requested_as_of WHERE status='issued' AND expires_at<=requested_as_of;
    GET DIAGNOSTICS affected=ROW_COUNT; v_result:=v_result||jsonb_build_object('quotes_expired',affected);

    total:=0;
    FOR item IN
      SELECT id,status FROM public.promotion_commercial_orders
      WHERE status='awaiting_payment' AND payment_due_at<=requested_as_of
      FOR UPDATE SKIP LOCKED
    LOOP
      UPDATE public.promotion_commercial_orders SET status='expired',updated_at=requested_as_of WHERE id=item.id;
      INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code)
      VALUES(item.id,item.status,'expired','system','phase10f_maintenance','payment_due_elapsed');
      total:=total+1;
    END LOOP;
    v_result:=v_result||jsonb_build_object('orders_expired',total);

    total:=0;
    FOR item IN
      SELECT p.id AS placement_id,p.request_id,o.id AS order_id,o.owner_user_id,o.status AS order_status
      FROM public.promotion_placements p
      JOIN public.promotion_commercial_orders o ON o.request_id=p.request_id
      WHERE p.status='scheduled' AND o.status='scheduled' AND p.starts_at<=requested_as_of AND p.ends_at>requested_as_of
      FOR UPDATE OF p,o SKIP LOCKED
    LOOP
      UPDATE public.promotion_placements SET status='active',updated_at=requested_as_of WHERE id=item.placement_id;
      UPDATE public.promotion_commercial_orders SET status='active',updated_at=requested_as_of WHERE id=item.order_id;
      UPDATE public.promotion_requests SET status='active',updated_at=requested_as_of WHERE id=item.request_id;
      INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code)
      VALUES(item.order_id,item.order_status,'active','system','phase10f_maintenance','scheduled_start');
      INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
      VALUES(item.owner_user_id,'promotion_started','order',item.order_id,'promotion-started:'||item.placement_id,jsonb_build_object('order_id',item.order_id))
      ON CONFLICT(idempotency_key) DO NOTHING;
      total:=total+1;
    END LOOP;
    v_result:=v_result||jsonb_build_object('placements_activated',total);

    total:=0;
    FOR item IN
      SELECT p.id AS placement_id,p.request_id,p.starts_at,p.ends_at,o.id AS order_id,o.owner_user_id,o.status AS order_status
      FROM public.promotion_placements p
      JOIN public.promotion_commercial_orders o ON o.request_id=p.request_id
      WHERE p.status IN ('active','paused') AND o.status IN ('active','paused') AND p.ends_at<=requested_as_of
      FOR UPDATE OF p,o SKIP LOCKED
    LOOP
      UPDATE public.promotion_placements SET status='completed',updated_at=requested_as_of WHERE id=item.placement_id;
      UPDATE public.promotion_commercial_orders SET status='completed',updated_at=requested_as_of WHERE id=item.order_id;
      UPDATE public.promotion_requests SET status='completed',updated_at=requested_as_of WHERE id=item.request_id;
      INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code)
      VALUES(item.order_id,item.order_status,'completed','system','phase10f_maintenance','scheduled_end');
      INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
      VALUES(item.owner_user_id,'promotion_ended','order',item.order_id,'promotion-ended:'||item.placement_id,jsonb_build_object('order_id',item.order_id))
      ON CONFLICT(idempotency_key) DO NOTHING;

      report_start:=(item.starts_at AT TIME ZONE 'Asia/Seoul')::date;
      report_end:=(item.ends_at AT TIME ZONE 'Asia/Seoul')::date;
      IF NOT EXISTS(SELECT 1 FROM public.promotion_performance_reports WHERE order_id=item.order_id AND period_start=report_start AND period_end=report_end) THEN
        report_id:=public.admin_generate_promotion_report(item.order_id,report_start,report_end,'system:phase10f_maintenance');
      END IF;
      total:=total+1;
    END LOOP;
    v_result:=v_result||jsonb_build_object('placements_completed',total);

    UPDATE public.data_export_jobs SET status='ready',ready_at=requested_as_of,expires_at=requested_as_of+((retention->>'export_ready_days')||' days')::interval WHERE status='queued';
    GET DIAGNOSTICS affected=ROW_COUNT; v_result:=v_result||jsonb_build_object('exports_ready',affected);
    UPDATE public.data_export_jobs SET status='expired' WHERE status='ready' AND expires_at<=requested_as_of;
    GET DIAGNOSTICS affected=ROW_COUNT; v_result:=v_result||jsonb_build_object('exports_expired',affected);
    DELETE FROM public.promotion_impressions WHERE occurred_at<requested_as_of-((retention->>'raw_promotion_metrics_days')||' days')::interval;
    GET DIAGNOSTICS affected=ROW_COUNT; v_result:=v_result||jsonb_build_object('promotion_impressions_deleted',affected);
    DELETE FROM public.promotion_clicks WHERE occurred_at<requested_as_of-((retention->>'raw_promotion_metrics_days')||' days')::interval;
    GET DIAGNOSTICS affected=ROW_COUNT; v_result:=v_result||jsonb_build_object('promotion_clicks_deleted',affected);
    SELECT count(*)::integer INTO affected FROM public.promotion_notification_outbox WHERE status IN ('pending','failed') AND available_at<=requested_as_of;
    v_result:=v_result||jsonb_build_object('notifications_pending',affected,'ok',true);
    UPDATE public.operational_job_runs SET status='succeeded',finished_at=now(),result=v_result WHERE id=run_id;
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    v_result:=jsonb_build_object('ok',false,'error','MAINTENANCE_FAILED');
    UPDATE public.operational_job_runs SET status='failed',finished_at=now(),safe_error_code='MAINTENANCE_FAILED',result=v_result WHERE id=run_id;
    RETURN v_result;
  END;
END; $$;

ALTER TABLE public.promotion_commercial_orders DROP CONSTRAINT promotion_commercial_orders_status_check;
ALTER TABLE public.promotion_commercial_orders ADD CONSTRAINT promotion_commercial_orders_status_check CHECK (status IN (
  'awaiting_payment','payment_submitted','payment_review','payment_confirmed','scheduled','active','paused','completed',
  'cancel_requested','cancelled','refund_pending','partial_refund','refunded','refund_unavailable','expired'
));

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['beta_programs','beta_invites','beta_members','beta_feature_flags','beta_audit_logs','operational_job_runs','data_export_jobs','retention_policy_versions','operational_event_counters','operational_incidents']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',table_name);
  END LOOP;
END $$;
GRANT SELECT ON public.beta_members,public.data_export_jobs TO authenticated;
CREATE POLICY beta_members_owner_select ON public.beta_members FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY data_export_jobs_owner_select ON public.data_export_jobs FOR SELECT TO authenticated USING(owner_user_id=auth.uid());

DO $$ DECLARE signature regprocedure; BEGIN
  FOR signature IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (
    'has_beta_feature_access','redeem_beta_invite','admin_issue_beta_invite','admin_review_beta_member','admin_set_beta_feature',
    'admin_set_beta_emergency','request_own_data_export','record_operational_event','run_phase10f_maintenance'
  ) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.has_beta_feature_access(uuid,text) TO authenticated;

-- PHASE 10B owner policies remain, but creating or editing private profile data now
-- additionally requires an active limited-beta membership. Owner delete remains available.
DROP POLICY IF EXISTS private_profiles_owner_insert ON public.private_profiles;
DROP POLICY IF EXISTS private_profiles_owner_update ON public.private_profiles;
CREATE POLICY private_profiles_owner_insert ON public.private_profiles FOR INSERT TO authenticated
  WITH CHECK(owner_user_id=auth.uid() AND profile_visibility='private'
    AND public.has_current_adult_access(auth.uid()) AND public.has_beta_feature_access(auth.uid(),'private_profile'));
CREATE POLICY private_profiles_owner_update ON public.private_profiles FOR UPDATE TO authenticated
  USING(owner_user_id=auth.uid())
  WITH CHECK(owner_user_id=auth.uid() AND profile_visibility='private'
    AND public.has_current_adult_access(auth.uid()) AND public.has_beta_feature_access(auth.uid(),'private_profile'));
DROP POLICY IF EXISTS memberships_owner_insert ON public.profile_school_memberships;
DROP POLICY IF EXISTS memberships_owner_update ON public.profile_school_memberships;
CREATE POLICY memberships_owner_insert ON public.profile_school_memberships FOR INSERT TO authenticated
  WITH CHECK(owner_user_id=auth.uid() AND public.has_current_adult_access(auth.uid())
    AND public.has_beta_feature_access(auth.uid(),'private_profile'));
CREATE POLICY memberships_owner_update ON public.profile_school_memberships FOR UPDATE TO authenticated
  USING(owner_user_id=auth.uid())
  WITH CHECK(owner_user_id=auth.uid() AND public.has_current_adult_access(auth.uid())
    AND public.has_beta_feature_access(auth.uid(),'private_profile'));
