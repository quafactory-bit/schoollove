-- PHASE 10N-A: public account soft-launch boundary.
-- Forward-only. Applying this migration never opens registration: the singleton starts closed.

BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('phase10n-public-account-soft-launch',0)
);

-- Fail before the first permanent DDL unless Production still matches the audited
-- post-reset contract. This also freezes the complete public-table and UUID
-- person-link catalogs so a newly introduced surface cannot be silently skipped.
CREATE TEMP TABLE phase10n_table_contract(table_name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO phase10n_table_contract(table_name) VALUES
  ('account_deletion_requests'),('admin_audit_logs'),('adult_eligibility_records'),
  ('beta_audit_logs'),('beta_campaign_aggregates'),('beta_campaigns'),('beta_feature_flags'),
  ('beta_feedback'),('beta_growth_daily_metrics'),('beta_invites'),('beta_members'),
  ('beta_onboarding_progress'),('beta_onboarding_stage_events'),('beta_operation_tasks'),
  ('beta_operator_notes'),('beta_program_schools'),('beta_program_setup_snapshots'),
  ('beta_programs'),('beta_readiness_snapshots'),('beta_setup_drafts'),
  ('connection_instagram_permissions'),('connection_match_tokens'),('connection_messages'),
  ('connection_requests'),('connections'),('consent_records'),('data_export_jobs'),
  ('editorial_features'),('notifications'),('operational_event_counters'),
  ('operational_incidents'),('operational_job_runs'),('payment_document_requests'),
  ('payment_refund_attempts'),('payment_transactions'),('payment_webhook_events'),
  ('private_profiles'),('profile_school_memberships'),('profiles'),
  ('promotion_account_verifications'),('promotion_accounts'),('promotion_assets'),
  ('promotion_audit_logs'),('promotion_cancellation_requests'),('promotion_clicks'),
  ('promotion_commercial_orders'),('promotion_impressions'),('promotion_notification_outbox'),
  ('promotion_order_status_history'),('promotion_orders'),('promotion_payment_confirmations'),
  ('promotion_payment_submissions'),('promotion_performance_reports'),('promotion_placements'),
  ('promotion_products'),('promotion_quotes'),('promotion_refunds'),('promotion_reports'),
  ('promotion_requests'),('promotion_reviews'),('reports'),('retention_policy_versions'),
  ('safety_account_restrictions'),('safety_reports'),('schools'),('search_logs'),('traces'),
  ('user_blocks');

DO $phase10n_table_preflight$
DECLARE actual_count integer; mismatch text;
BEGIN
  SELECT count(*) INTO actual_count FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relkind='r';
  SELECT string_agg(format('%s:%s',side,table_name),', ' ORDER BY side,table_name)
    INTO mismatch FROM (
      SELECT 'unexpected' side,relation.relname table_name
      FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      LEFT JOIN phase10n_table_contract contract ON contract.table_name=relation.relname
      WHERE namespace.nspname='public' AND relation.relkind='r' AND contract.table_name IS NULL
      UNION ALL
      SELECT 'missing',contract.table_name FROM phase10n_table_contract contract
      WHERE to_regclass(format('public.%I',contract.table_name)) IS NULL
    ) differences;
  IF (SELECT count(*) FROM phase10n_table_contract)<>68 OR actual_count<>68 OR mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10N_PUBLIC_TABLE_CONTRACT_MISMATCH'
      USING DETAIL=format('contract=68 actual=%s mismatch=%s',actual_count,coalesce(mismatch,'none'));
  END IF;
END
$phase10n_table_preflight$;

CREATE TEMP TABLE phase10n_person_link_contract(
  table_name text NOT NULL,column_name text NOT NULL,PRIMARY KEY(table_name,column_name)
) ON COMMIT DROP;
INSERT INTO phase10n_person_link_contract(table_name,column_name) VALUES
  ('account_deletion_requests','user_id'),('adult_eligibility_records','user_id'),
  ('beta_campaigns','invite_id'),('beta_feature_flags','user_id'),('beta_feedback','owner_user_id'),
  ('beta_members','invite_id'),('beta_members','user_id'),('beta_onboarding_progress','user_id'),
  ('connection_instagram_permissions','grantee_user_id'),('connection_instagram_permissions','grantor_user_id'),
  ('connection_match_tokens','receiver_user_id'),('connection_match_tokens','requester_user_id'),
  ('connection_messages','sender_user_id'),('connection_requests','receiver_user_id'),
  ('connection_requests','sender_user_id'),('connections','disconnected_by_user_id'),
  ('consent_records','user_id'),('data_export_jobs','owner_user_id'),('editorial_features','account_id'),
  ('notifications','user_id'),('payment_document_requests','owner_user_id'),
  ('payment_transactions','owner_user_id'),('private_profiles','owner_user_id'),
  ('profile_school_memberships','owner_user_id'),('profile_school_memberships','profile_id'),
  ('profiles','owner_user_id'),('promotion_account_verifications','account_id'),
  ('promotion_accounts','owner_user_id'),('promotion_cancellation_requests','owner_user_id'),
  ('promotion_commercial_orders','owner_user_id'),('promotion_notification_outbox','owner_user_id'),
  ('promotion_payment_submissions','owner_user_id'),('promotion_performance_reports','owner_user_id'),
  ('promotion_quotes','owner_user_id'),('promotion_reports','reporter_user_id'),
  ('promotion_requests','account_id'),('promotion_requests','owner_user_id'),('reports','profile_id'),
  ('safety_account_restrictions','user_id'),('safety_reports','reported_user_id'),
  ('safety_reports','reporter_user_id'),('user_blocks','blocked_user_id'),('user_blocks','blocker_user_id');

DO $phase10n_person_link_preflight$
DECLARE mismatch text;
BEGIN
  SELECT string_agg(format('%s:%s.%s',side,table_name,column_name),', ' ORDER BY side,table_name,column_name)
  INTO mismatch FROM (
    SELECT 'unexpected' side,column_info.table_name,column_info.column_name
    FROM information_schema.columns column_info
    LEFT JOIN phase10n_person_link_contract contract
      ON contract.table_name=column_info.table_name AND contract.column_name=column_info.column_name
    WHERE column_info.table_schema='public' AND column_info.data_type='uuid'
      AND column_info.column_name ~ '(^|_)(user|profile|account|member|invite)_id$'
      AND contract.table_name IS NULL
    UNION ALL
    SELECT 'missing',contract.table_name,contract.column_name
    FROM phase10n_person_link_contract contract
    LEFT JOIN information_schema.columns column_info
      ON column_info.table_schema='public' AND column_info.table_name=contract.table_name
      AND column_info.column_name=contract.column_name AND column_info.data_type='uuid'
    WHERE column_info.column_name IS NULL
  ) differences;
  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10N_PERSON_LINK_CONTRACT_MISMATCH' USING DETAIL=mismatch;
  END IF;
END
$phase10n_person_link_preflight$;

DO $phase10n_data_preflight$
DECLARE
  legacy_count bigint; school_count bigint; school_drift bigint; person_count bigint;
  editorial_count bigint; beta_ops bigint; beta_program_count bigint;
  global_flags bigint; scoped_flags bigint; commercial_count bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.profiles)+(SELECT count(*) FROM public.reports)
    +(SELECT count(*) FROM public.traces)+(SELECT count(*) FROM public.search_logs) INTO legacy_count;
  SELECT count(*) INTO school_count FROM public.schools;
  SELECT count(*) INTO school_drift FROM public.schools
    WHERE coalesce(current_level,1)<>1 OR level_updated_at IS NOT NULL;
  SELECT (SELECT count(*) FROM public.private_profiles)+(SELECT count(*) FROM public.profile_school_memberships)
    +(SELECT count(*) FROM public.adult_eligibility_records)+(SELECT count(*) FROM public.consent_records)
    +(SELECT count(*) FROM public.account_deletion_requests)+(SELECT count(*) FROM public.connection_match_tokens)
    +(SELECT count(*) FROM public.connection_requests)+(SELECT count(*) FROM public.connections)
    +(SELECT count(*) FROM public.connection_messages)+(SELECT count(*) FROM public.connection_instagram_permissions)
    +(SELECT count(*) FROM public.notifications)+(SELECT count(*) FROM public.user_blocks)
    +(SELECT count(*) FROM public.safety_reports)+(SELECT count(*) FROM public.safety_account_restrictions)
    +(SELECT count(*) FROM public.data_export_jobs) INTO person_count;
  SELECT count(*) INTO editorial_count FROM public.editorial_features WHERE account_id IS NOT NULL;
  SELECT (SELECT count(*) FROM public.beta_setup_drafts)+(SELECT count(*) FROM public.beta_program_setup_snapshots)
    +(SELECT count(*) FROM public.beta_program_schools)+(SELECT count(*) FROM public.beta_readiness_snapshots)
    +(SELECT count(*) FROM public.beta_invites)+(SELECT count(*) FROM public.beta_members)
    +(SELECT count(*) FROM public.beta_campaigns)+(SELECT count(*) FROM public.beta_feedback)
    +(SELECT count(*) FROM public.beta_onboarding_progress)+(SELECT count(*) FROM public.beta_onboarding_stage_events)
    +(SELECT count(*) FROM public.beta_operation_tasks)+(SELECT count(*) FROM public.beta_operator_notes)
    +(SELECT count(*) FROM public.beta_growth_daily_metrics)+(SELECT count(*) FROM public.beta_campaign_aggregates)
    +(SELECT count(*) FROM public.beta_audit_logs) INTO beta_ops;
  SELECT count(*) INTO beta_program_count FROM public.beta_programs;
  SELECT count(*) FILTER(WHERE program_id IS NULL AND user_id IS NULL),
    count(*) FILTER(WHERE program_id IS NOT NULL OR user_id IS NOT NULL)
    INTO global_flags,scoped_flags FROM public.beta_feature_flags;
  SELECT (SELECT count(*) FROM public.promotion_accounts)+(SELECT count(*) FROM public.promotion_account_verifications)
    +(SELECT count(*) FROM public.promotion_assets)+(SELECT count(*) FROM public.promotion_audit_logs)
    +(SELECT count(*) FROM public.promotion_cancellation_requests)+(SELECT count(*) FROM public.promotion_clicks)
    +(SELECT count(*) FROM public.promotion_commercial_orders)+(SELECT count(*) FROM public.promotion_impressions)
    +(SELECT count(*) FROM public.promotion_notification_outbox)+(SELECT count(*) FROM public.promotion_order_status_history)
    +(SELECT count(*) FROM public.promotion_orders)+(SELECT count(*) FROM public.promotion_payment_confirmations)
    +(SELECT count(*) FROM public.promotion_payment_submissions)+(SELECT count(*) FROM public.promotion_performance_reports)
    +(SELECT count(*) FROM public.promotion_placements)+(SELECT count(*) FROM public.promotion_products)
    +(SELECT count(*) FROM public.promotion_quotes)+(SELECT count(*) FROM public.promotion_refunds)
    +(SELECT count(*) FROM public.promotion_reports)+(SELECT count(*) FROM public.promotion_requests)
    +(SELECT count(*) FROM public.promotion_reviews)+(SELECT count(*) FROM public.payment_document_requests)
    +(SELECT count(*) FROM public.payment_refund_attempts)+(SELECT count(*) FROM public.payment_transactions)
    +(SELECT count(*) FROM public.payment_webhook_events) INTO commercial_count;
  IF legacy_count<>0 OR school_count<>10006 OR school_drift<>0 OR person_count<>0
    OR editorial_count<>0 OR beta_ops<>0 OR beta_program_count<>1 OR global_flags<>8
    OR scoped_flags<>0 OR commercial_count<>0 THEN
    RAISE EXCEPTION 'PHASE10N_PRODUCTION_BASELINE_MISMATCH' USING DETAIL=format(
      'legacy=%s schools=%s school_drift=%s person=%s editorial=%s beta_ops=%s beta_programs=%s global_flags=%s scoped_flags=%s commercial=%s',
      legacy_count,school_count,school_drift,person_count,editorial_count,beta_ops,beta_program_count,global_flags,scoped_flags,commercial_count);
  END IF;
END
$phase10n_data_preflight$;

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

DO $phase10n_forced_partial_create$
BEGIN
  IF current_setting('phase10n.force_failure',true)='after_launch_control' THEN
    RAISE EXCEPTION 'PHASE10N_FORCED_FAILURE_AFTER_LAUNCH_CONTROL';
  END IF;
END
$phase10n_forced_partial_create$;

INSERT INTO public.public_account_launch_control (
  control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,
  emergency_stopped_at,last_reason_code,updated_by
) VALUES (
  'public_account','closed',false,false,false,NULL,'MIGRATION_DEFAULT_CLOSED','migration'
);

CREATE TABLE public.public_account_launch_audit (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  action text NOT NULL CHECK (action IN (
    'state_changed','readiness_recorded','launch_opened','emergency_stopped',
    'deletion_prepared','deletion_auth_failed','deletion_completed','deletion_audit_purged'
  )),
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
    'private_profile_created','first_school_membership_created','onboarding_completed',
    'account_deletion_requested'
  )),
  event_kind text NOT NULL CHECK (event_kind IN ('activity','milestone')),
  source_channel text NOT NULL CHECK (source_channel IN ('direct','school_search','account','onboarding')),
  event_count bigint NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_date,event_key,source_channel)
);

DO $phase10n_forced_after_tables$
BEGIN
  IF current_setting('phase10n.force_failure',true)='after_tables' THEN
    RAISE EXCEPTION 'PHASE10N_FORCED_FAILURE_AFTER_TABLES';
  END IF;
END
$phase10n_forced_after_tables$;

ALTER TABLE public.adult_eligibility_records
  ADD COLUMN required_consents_completed_at timestamptz,
  ADD COLUMN private_profile_first_created_at timestamptz,
  ADD COLUMN school_membership_first_created_at timestamptz,
  ADD COLUMN onboarding_completed_at timestamptz;

ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT account_deletion_requests_user_id_fkey,
  DROP CONSTRAINT account_deletion_requests_status_check,
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN purge_after timestamptz,
  ADD CONSTRAINT account_deletion_requests_user_id_fkey
    FOREIGN KEY(user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT account_deletion_requests_status_check CHECK (
    status IN ('pending','public_data_deleted','auth_deletion_pending','failed_safe','done','rejected')
  ),
  ADD CONSTRAINT account_deletion_requests_link_state_check CHECK (
    (status='done' AND user_id IS NULL) OR status<>'done'
  ),
  ADD CONSTRAINT account_deletion_requests_no_reason_check CHECK (reason IS NULL);

DROP INDEX account_deletion_requests_one_pending;
CREATE UNIQUE INDEX account_deletion_requests_one_active
  ON public.account_deletion_requests(user_id)
  WHERE user_id IS NOT NULL AND status IN ('pending','public_data_deleted','auth_deletion_pending','failed_safe');

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
      SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.account_deletion_requests request
      WHERE request.user_id = target_user_id AND request.status <> 'rejected'
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
  requested_state text,requested_reason text,admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE control public.public_account_launch_control%ROWTYPE;
BEGIN
  IF requested_state NOT IN ('closed','internal_test','emergency_stopped')
    OR requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'INVALID_LAUNCH_CHANGE'; END IF;
  SELECT * INTO control FROM public.public_account_launch_control WHERE control_key='public_account' FOR UPDATE;
  IF control.state='emergency_stopped' AND requested_state<>'closed'
    THEN RAISE EXCEPTION 'EMERGENCY_STOP_REQUIRES_CLOSED'; END IF;
  UPDATE public.public_account_launch_control SET state=requested_state,
    account_registration_enabled=false,
    private_profile_enabled=requested_state='internal_test',
    school_membership_enabled=requested_state='internal_test',
    emergency_stopped_at=CASE WHEN requested_state='emergency_stopped' THEN clock_timestamp() ELSE NULL END,
    last_reason_code=requested_reason,updated_by=admin_actor,updated_at=clock_timestamp()
  WHERE control_key='public_account';
  INSERT INTO public.public_account_launch_audit(action,from_state,to_state,reason_code,actor_reference,metadata)
  VALUES(CASE WHEN requested_state='emergency_stopped' THEN 'emergency_stopped' ELSE 'state_changed' END,
    control.state,requested_state,requested_reason,admin_actor,
    jsonb_build_object('features',CASE WHEN requested_state='internal_test'
      THEN jsonb_build_array('private_profile','school_membership') ELSE '[]'::jsonb END));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_record_public_account_readiness(
  requested_reason text,admin_actor text,verified_commit_sha text,
  verified_migration_sha256 text,blocker_count integer,verified_checks jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE control public.public_account_launch_control%ROWTYPE; audit_id uuid;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    OR verified_commit_sha !~ '^[0-9a-f]{40}$' OR verified_migration_sha256 !~ '^[A-F0-9]{64}$'
    OR blocker_count<>0 OR jsonb_typeof(verified_checks)<>'object'
    OR verified_checks->>'migration_version'<>'20260803120000'
    OR verified_checks->>'operator_decision'<>'affirmative'
    OR coalesce((verified_checks->>'preview')::boolean,false) IS NOT TRUE
    OR coalesce((verified_checks->>'health')::boolean,false) IS NOT TRUE
    OR coalesce((verified_checks->>'rls_grants')::boolean,false) IS NOT TRUE
    OR coalesce((verified_checks->>'auth_smtp')::boolean,false) IS NOT TRUE
    OR coalesce((verified_checks->>'deletion_operator')::boolean,false) IS NOT TRUE
    OR coalesce((verified_checks->>'runtime_logs')::boolean,false) IS NOT TRUE
    OR coalesce((verified_checks->>'isolated_db')::boolean,false) IS NOT TRUE
    OR coalesce((verified_checks->>'permissions')::boolean,false) IS NOT TRUE
    OR coalesce(verified_checks->'blocker_codes','null'::jsonb)<>'[]'::jsonb
  THEN RAISE EXCEPTION 'INVALID_READINESS_EVIDENCE'; END IF;
  SELECT * INTO control FROM public.public_account_launch_control WHERE control_key='public_account' FOR UPDATE;
  IF control.state NOT IN ('closed','internal_test') THEN RAISE EXCEPTION 'READINESS_REQUIRES_CLOSED_STATE'; END IF;
  INSERT INTO public.public_account_launch_audit(action,from_state,to_state,reason_code,actor_reference,metadata)
  VALUES('readiness_recorded',control.state,'ready',requested_reason,admin_actor,
    jsonb_build_object('commit_sha',verified_commit_sha,'migration_sha256',verified_migration_sha256,
      'blocker_count',blocker_count,'checks',verified_checks)) RETURNING id INTO audit_id;
  UPDATE public.public_account_launch_control SET state='ready',account_registration_enabled=false,
    private_profile_enabled=false,school_membership_enabled=false,emergency_stopped_at=NULL,
    last_reason_code=requested_reason,updated_by=admin_actor,updated_at=clock_timestamp()
    WHERE control_key='public_account';
  RETURN audit_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_open_public_account_launch(
  readiness_id uuid,requested_reason text,admin_actor text,
  expected_commit_sha text,expected_migration_sha256 text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE control public.public_account_launch_control%ROWTYPE; readiness public.public_account_launch_audit%ROWTYPE;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_OPEN_APPROVAL'; END IF;
  SELECT * INTO control FROM public.public_account_launch_control WHERE control_key='public_account' FOR UPDATE;
  SELECT * INTO readiness FROM public.public_account_launch_audit WHERE id=readiness_id AND action='readiness_recorded';
  IF control.state<>'ready' OR readiness.id IS NULL OR readiness.to_state<>'ready'
    OR readiness.id<>(SELECT latest.id FROM public.public_account_launch_audit latest
      WHERE latest.action='readiness_recorded' ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)
    OR readiness.created_at<clock_timestamp()-interval '24 hours'
    OR readiness.metadata->>'commit_sha'<>expected_commit_sha
    OR readiness.metadata->>'migration_sha256'<>expected_migration_sha256
    OR (readiness.metadata->>'blocker_count')::integer<>0
  THEN RAISE EXCEPTION 'FRESH_AFFIRMATIVE_READINESS_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.public_account_launch_audit newer
    WHERE newer.created_at>readiness.created_at AND newer.action IN ('emergency_stopped','state_changed'))
  THEN RAISE EXCEPTION 'READINESS_INVALIDATED'; END IF;
  UPDATE public.public_account_launch_control SET state='open',account_registration_enabled=true,
    private_profile_enabled=true,school_membership_enabled=true,last_reason_code=requested_reason,
    updated_by=admin_actor,updated_at=clock_timestamp() WHERE control_key='public_account';
  INSERT INTO public.public_account_launch_audit(action,from_state,to_state,reason_code,actor_reference,metadata)
  VALUES('launch_opened','ready','open',requested_reason,admin_actor,
    jsonb_build_object('readiness_id',readiness_id,'commit_sha',expected_commit_sha,
      'migration_sha256',expected_migration_sha256));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.increment_public_account_metric(
  requested_event text,requested_source text,requested_kind text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.public_account_daily_funnel(metric_date,event_key,event_kind,source_channel,event_count)
  VALUES((clock_timestamp() AT TIME ZONE 'Asia/Seoul')::date,requested_event,requested_kind,requested_source,1)
  ON CONFLICT(metric_date,event_key,source_channel) DO UPDATE SET
    event_count=public.public_account_daily_funnel.event_count+1,updated_at=clock_timestamp();
END; $$;

CREATE OR REPLACE FUNCTION public.record_public_account_activity(
  requested_event text,requested_source text DEFAULT 'direct'
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_event NOT IN ('public_home_view','school_search_started','login_page_view','otp_request_accepted')
    OR requested_source NOT IN ('direct','school_search','account') THEN RETURN false; END IF;
  PERFORM public.increment_public_account_metric(requested_event,requested_source,'activity');
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.record_own_otp_verified_milestone()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE requester uuid:=auth.uid(); already_recorded boolean;
BEGIN
  IF requester IS NULL THEN RETURN false; END IF;
  SELECT coalesce(raw_app_meta_data ? 'phase10n_otp_verified_at',false) INTO already_recorded
    FROM auth.users WHERE id=requester FOR UPDATE;
  IF already_recorded THEN RETURN true; END IF;
  UPDATE auth.users SET raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
    || jsonb_build_object('phase10n_otp_verified_at',clock_timestamp()),updated_at=clock_timestamp()
    WHERE id=requester;
  PERFORM public.increment_public_account_metric('otp_verify_succeeded','account','milestone');
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.maybe_record_own_onboarding_completion(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.adult_eligibility_records adult WHERE adult.user_id=target_user_id
      AND adult.adult_eligible AND adult.policy_version='phase10b-2026-07-28'
      AND adult.required_consents_completed_at IS NOT NULL
      AND adult.private_profile_first_created_at IS NOT NULL
      AND adult.school_membership_first_created_at IS NOT NULL
      AND adult.onboarding_completed_at IS NULL)
  THEN
    UPDATE public.adult_eligibility_records SET onboarding_completed_at=clock_timestamp()
      WHERE user_id=target_user_id AND policy_version='phase10b-2026-07-28'
        AND onboarding_completed_at IS NULL;
    IF FOUND THEN PERFORM public.increment_public_account_metric('onboarding_completed','onboarding','milestone'); END IF;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_complete_own_adult_eligibility(
  target_user_id uuid,requested_policy_version text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted_count integer;
BEGIN
  IF target_user_id IS NULL OR requested_policy_version<>'phase10b-2026-07-28'
    OR EXISTS(SELECT 1 FROM public.account_deletion_requests request WHERE request.user_id=target_user_id AND request.status<>'rejected')
    OR NOT (EXISTS(SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key='public_account' AND control.state IN ('internal_test','open')
        AND control.private_profile_enabled)
      OR public.has_beta_feature_access(target_user_id,'private_profile'))
  THEN RAISE EXCEPTION 'ADULT_ELIGIBILITY_NOT_ALLOWED'; END IF;
  INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
  VALUES(target_user_id,true,'self_attestation',requested_policy_version) ON CONFLICT(user_id,policy_version) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count=1 THEN PERFORM public.increment_public_account_metric('adult_eligibility_completed','onboarding','milestone'); END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.record_own_required_consents(requested_policy_version text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE requester uuid:=auth.uid(); updated_count integer;
BEGIN
  IF requester IS NULL OR requested_policy_version<>'phase10b-2026-07-28'
    OR NOT EXISTS(SELECT 1 FROM public.adult_eligibility_records WHERE user_id=requester
      AND adult_eligible AND policy_version=requested_policy_version)
    OR NOT public.public_account_access_active(requester)
    OR NOT (public.public_account_feature_enabled('private_profile') OR public.has_beta_feature_access(requester,'private_profile'))
  THEN RAISE EXCEPTION 'CONSENT_RECORDING_NOT_ALLOWED'; END IF;
  INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
  SELECT requester,consent_type,true,requested_policy_version FROM unnest(
    ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) consent_type
  ON CONFLICT(user_id,consent_type,policy_version) DO NOTHING;
  UPDATE public.adult_eligibility_records SET required_consents_completed_at=clock_timestamp()
    WHERE user_id=requester AND policy_version=requested_policy_version
      AND required_consents_completed_at IS NULL;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  IF updated_count=1 THEN PERFORM public.increment_public_account_metric('required_consents_completed','onboarding','milestone'); END IF;
  PERFORM public.maybe_record_own_onboarding_completion(requester);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_own_private_profile(
  requested_display_name text,requested_instagram_handle text,requested_introduction text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE requester uuid:=auth.uid(); normalized_name text; normalized_instagram text; normalized_intro text;
  saved public.private_profiles%ROWTYPE; created_now boolean:=false;
BEGIN
  normalized_name:=btrim(normalize(requested_display_name,NFKC));
  normalized_instagram:=nullif(lower(btrim(normalize(requested_instagram_handle,NFKC))),'');
  normalized_intro:=nullif(btrim(normalize(requested_introduction,NFKC)),'');
  IF requester IS NULL OR NOT public.public_account_access_active(requester)
    OR NOT public.has_current_adult_access(requester)
    OR NOT (public.public_account_feature_enabled('private_profile') OR public.has_beta_feature_access(requester,'private_profile'))
    OR char_length(normalized_name) NOT BETWEEN 1 AND 50 OR normalized_name ~ '[[:cntrl:]]'
    OR normalized_name ~ '[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]'
    OR (normalized_instagram IS NOT NULL AND normalized_instagram !~ '^[a-z0-9._]{1,30}$')
    OR (normalized_intro IS NOT NULL AND (char_length(normalized_intro)>300 OR normalized_intro ~ '[[:cntrl:]]'))
  THEN RAISE EXCEPTION 'INVALID_PRIVATE_PROFILE'; END IF;
  INSERT INTO public.private_profiles(owner_user_id,display_name,instagram_handle,profile_photo_url,introduction,profile_visibility,status)
  VALUES(requester,normalized_name,normalized_instagram,NULL,normalized_intro,'private','active')
  ON CONFLICT(owner_user_id) DO UPDATE SET display_name=excluded.display_name,
    instagram_handle=excluded.instagram_handle,profile_photo_url=NULL,introduction=excluded.introduction,
    profile_visibility='private',status='active',updated_at=clock_timestamp()
  RETURNING * INTO saved;
  UPDATE public.adult_eligibility_records SET private_profile_first_created_at=clock_timestamp()
    WHERE user_id=requester AND policy_version='phase10b-2026-07-28' AND private_profile_first_created_at IS NULL;
  created_now:=FOUND;
  IF created_now THEN PERFORM public.increment_public_account_metric('private_profile_created','onboarding','milestone'); END IF;
  PERFORM public.maybe_record_own_onboarding_completion(requester);
  RETURN jsonb_build_object('id',saved.id,'display_name',saved.display_name,
    'instagram_handle',saved.instagram_handle,'introduction',saved.introduction,
    'profile_visibility',saved.profile_visibility,'status',saved.status);
END; $$;

CREATE OR REPLACE FUNCTION public.delete_own_private_profile()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE requester uuid:=auth.uid();
BEGIN
  IF requester IS NULL OR NOT public.public_account_access_active(requester) THEN RETURN false; END IF;
  DELETE FROM public.private_profiles WHERE owner_user_id=requester;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.add_own_school_membership(
  requested_school_id uuid,requested_graduation_year integer,requested_class_number integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE requester uuid:=auth.uid(); own_profile public.private_profiles%ROWTYPE;
  saved public.profile_school_memberships%ROWTYPE; first_now boolean:=false;
BEGIN
  IF requester IS NULL OR NOT public.public_account_access_active(requester)
    OR NOT public.has_current_adult_access(requester)
    OR requested_graduation_year NOT BETWEEN 1900 AND extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer
    OR (requested_class_number IS NOT NULL AND requested_class_number NOT BETWEEN 1 AND 100)
    OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=requested_school_id)
  THEN RAISE EXCEPTION 'INVALID_SCHOOL_MEMBERSHIP'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requester::text,0));
  SELECT * INTO own_profile FROM public.private_profiles WHERE owner_user_id=requester
    AND profile_visibility='private' AND status='active' FOR UPDATE;
  IF own_profile.id IS NULL THEN RAISE EXCEPTION 'PRIVATE_PROFILE_REQUIRED'; END IF;
  IF NOT (public.public_account_feature_enabled('school_membership') OR public.has_beta_feature_access(requester,'private_profile'))
    THEN RAISE EXCEPTION 'SCHOOL_MEMBERSHIP_CLOSED'; END IF;
  INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year,class_number)
  VALUES(own_profile.id,requester,requested_school_id,requested_graduation_year,requested_class_number)
  RETURNING * INTO saved;
  UPDATE public.adult_eligibility_records SET school_membership_first_created_at=clock_timestamp()
    WHERE user_id=requester AND policy_version='phase10b-2026-07-28' AND school_membership_first_created_at IS NULL;
  first_now:=FOUND;
  IF first_now THEN PERFORM public.increment_public_account_metric('first_school_membership_created','onboarding','milestone'); END IF;
  PERFORM public.maybe_record_own_onboarding_completion(requester);
  RETURN jsonb_build_object('id',saved.id,'school_id',saved.school_id,
    'graduation_year',saved.graduation_year,'class_number',saved.class_number);
END; $$;

CREATE OR REPLACE FUNCTION public.delete_own_school_membership(target_membership_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE requester uuid:=auth.uid();
BEGIN
  IF requester IS NULL OR NOT public.public_account_access_active(requester) THEN RETURN false; END IF;
  DELETE FROM public.profile_school_memberships WHERE id=target_membership_id AND owner_user_id=requester;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.search_schools_with_activity(q text,lim integer DEFAULT 20)
RETURNS TABLE(id uuid,school_name text,school_type text,sido text,sigungu text,slug text,address text,school_code text,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF char_length(btrim(q))<2 OR lim NOT BETWEEN 1 AND 50 THEN RETURN; END IF;
  PERFORM public.increment_public_account_metric('school_search_started','school_search','activity');
  RETURN QUERY SELECT * FROM public.search_schools_v2(q,lim);
END; $$;

CREATE OR REPLACE FUNCTION public.get_public_account_funnel()
RETURNS TABLE(metric_date date,event_key text,event_kind text,source_channel text,event_count bigint,masked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT metric.metric_date,metric.event_key,metric.event_kind,metric.source_channel,
    CASE WHEN metric.event_count<10 THEN NULL ELSE metric.event_count END,metric.event_count<10
  FROM public.public_account_daily_funnel metric
  WHERE metric.metric_date>=((now() AT TIME ZONE 'Asia/Seoul')::date-13)
  ORDER BY metric.metric_date DESC,metric.event_kind,metric.event_key,metric.source_channel;
$$;

CREATE OR REPLACE FUNCTION public.request_own_account_deletion()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE requester uuid:=auth.uid(); inserted_count integer;
BEGIN
  IF requester IS NULL THEN RETURN false; END IF;
  UPDATE public.private_profiles SET status='deletion_requested',updated_at=clock_timestamp()
    WHERE owner_user_id=requester;
  INSERT INTO public.account_deletion_requests(user_id,reason,status)
  VALUES(requester,NULL,'pending') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count=1 THEN PERFORM public.increment_public_account_metric('account_deletion_requested','account','milestone'); END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_prepare_public_account_deletion(
  target_request_id uuid,requested_reason text,admin_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_DELETION_PREPARATION'; END IF;
  SELECT * INTO request FROM public.account_deletion_requests WHERE id=target_request_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'DELETION_REQUEST_NOT_FOUND'; END IF;
  IF request.status NOT IN ('pending','failed_safe') OR request.user_id IS NULL
    THEN RAISE EXCEPTION 'DELETION_REQUEST_NOT_PREPARABLE'; END IF;
  DELETE FROM public.beta_onboarding_progress WHERE user_id=request.user_id;
  DELETE FROM public.private_profiles WHERE owner_user_id=request.user_id;
  DELETE FROM public.consent_records WHERE user_id=request.user_id;
  DELETE FROM public.adult_eligibility_records WHERE user_id=request.user_id;
  UPDATE auth.users SET banned_until='9999-12-31 23:59:59+00'::timestamptz,updated_at=clock_timestamp()
    WHERE id=request.user_id;
  UPDATE public.account_deletion_requests SET status='public_data_deleted',reason=NULL,resolved_at=NULL
    WHERE id=request.id;
  INSERT INTO public.public_account_launch_audit(action,reason_code,actor_reference,target_id,metadata)
  VALUES('deletion_prepared',requested_reason,admin_actor,request.id,
    jsonb_build_object('public_data_deleted',true,'auth_deletion_required',true));
  RETURN jsonb_build_object('request_id',request.id,'public_data_deleted',true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_begin_public_account_auth_deletion(
  target_request_id uuid,admin_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_AUTH_DELETION_ACTOR'; END IF;
  SELECT * INTO request FROM public.account_deletion_requests WHERE id=target_request_id FOR UPDATE;
  IF request.id IS NULL OR request.status<>'public_data_deleted' OR request.user_id IS NULL
    THEN RAISE EXCEPTION 'PUBLIC_DATA_DELETION_NOT_COMPLETE'; END IF;
  UPDATE public.account_deletion_requests SET status='auth_deletion_pending' WHERE id=request.id;
  RETURN jsonb_build_object('request_id',request.id,'user_id',request.user_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_mark_public_account_auth_deletion_failed(
  target_request_id uuid,requested_reason text,admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_AUTH_DELETION_FAILURE'; END IF;
  UPDATE public.account_deletion_requests SET status='failed_safe',reason=NULL,resolved_at=NULL
    WHERE id=target_request_id AND status='auth_deletion_pending' AND user_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_DELETION_NOT_PENDING'; END IF;
  INSERT INTO public.public_account_launch_audit(action,reason_code,actor_reference,target_id,metadata)
  VALUES('deletion_auth_failed',requested_reason,admin_actor,target_request_id,
    jsonb_build_object('retry_required',true,'account_blocked',true));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_finalize_public_account_auth_deletion(
  target_request_id uuid,requested_reason text,admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_AUTH_DELETION_FINALIZATION'; END IF;
  UPDATE public.account_deletion_requests SET status='done',reason=NULL,resolved_at=clock_timestamp(),
    purge_after=clock_timestamp()+interval '90 days'
    WHERE id=target_request_id AND status='auth_deletion_pending' AND user_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_IDENTITY_STILL_LINKED'; END IF;
  INSERT INTO public.public_account_launch_audit(action,reason_code,actor_reference,target_id,metadata)
  VALUES('deletion_completed',requested_reason,admin_actor,target_request_id,
    jsonb_build_object('auth_identity_deleted',true,'deidentified_request_purge_days',90));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_purge_expired_public_account_deletion_audit(admin_actor text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE purged integer;
BEGIN
  IF char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PURGE_ACTOR'; END IF;
  DELETE FROM public.public_account_launch_audit audit USING public.account_deletion_requests request
    WHERE audit.target_id=request.id AND request.status='done' AND request.purge_after<=clock_timestamp();
  DELETE FROM public.account_deletion_requests WHERE status='done' AND purge_after<=clock_timestamp();
  GET DIAGNOSTICS purged=ROW_COUNT;
  RETURN purged;
END; $$;

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
DROP POLICY IF EXISTS private_profiles_owner_delete ON public.private_profiles;

DROP POLICY IF EXISTS memberships_owner_insert ON public.profile_school_memberships;
DROP POLICY IF EXISTS memberships_owner_update ON public.profile_school_memberships;
DROP POLICY IF EXISTS memberships_owner_delete ON public.profile_school_memberships;

DROP POLICY IF EXISTS consent_records_owner_insert ON public.consent_records;
DROP POLICY IF EXISTS deletion_requests_owner_insert ON public.account_deletion_requests;

REVOKE INSERT ON public.consent_records,public.account_deletion_requests FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.private_profiles,public.profile_school_memberships FROM authenticated;

REVOKE ALL ON FUNCTION public.get_public_account_launch_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_account_access_active(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.public_account_feature_enabled(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_public_account_launch_state(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_record_public_account_readiness(text,text,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_open_public_account_launch(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.increment_public_account_metric(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_public_account_activity(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_own_otp_verified_milestone() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.maybe_record_own_onboarding_completion(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_complete_own_adult_eligibility(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_own_required_consents(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.upsert_own_private_profile(text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_own_private_profile() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.add_own_school_membership(uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_own_school_membership(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.search_schools_with_activity(text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_account_funnel() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.request_own_account_deletion() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.request_own_account_deletion(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_prepare_public_account_deletion(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_begin_public_account_auth_deletion(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_mark_public_account_auth_deletion_failed(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_finalize_public_account_auth_deletion(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_purge_expired_public_account_deletion_audit(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enforce_public_or_controlled_beta_school_membership() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enforce_beta_write_access() FROM PUBLIC,anon,authenticated;
DROP FUNCTION public.request_own_account_deletion(text);
GRANT EXECUTE ON FUNCTION public.get_public_account_launch_state() TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.public_account_access_active(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.public_account_feature_enabled(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_public_account_launch_state(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_public_account_readiness(text,text,text,text,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_open_public_account_launch(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_public_account_activity(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_own_otp_verified_milestone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_own_adult_eligibility(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_own_required_consents(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_own_private_profile(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_private_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_own_school_membership(uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_school_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_schools_with_activity(text,integer) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_public_account_funnel() TO service_role;
GRANT EXECUTE ON FUNCTION public.request_own_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_public_account_deletion(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_begin_public_account_auth_deletion(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_public_account_auth_deletion_failed(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_finalize_public_account_auth_deletion(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_expired_public_account_deletion_audit(text) TO service_role;

DO $phase10n_postflight$
DECLARE actual_count integer; mismatch text; legacy_count bigint; school_count bigint;
BEGIN
  INSERT INTO phase10n_table_contract(table_name) VALUES
    ('public_account_launch_control'),('public_account_launch_audit'),('public_account_daily_funnel');
  SELECT count(*) INTO actual_count FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relkind='r';
  SELECT string_agg(relation.relname,', ' ORDER BY relation.relname) INTO mismatch
    FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    LEFT JOIN phase10n_table_contract contract ON contract.table_name=relation.relname
    WHERE namespace.nspname='public' AND relation.relkind='r' AND contract.table_name IS NULL;
  SELECT (SELECT count(*) FROM public.profiles)+(SELECT count(*) FROM public.reports)
    +(SELECT count(*) FROM public.traces)+(SELECT count(*) FROM public.search_logs) INTO legacy_count;
  SELECT count(*) INTO school_count FROM public.schools;
  IF (SELECT count(*) FROM phase10n_table_contract)<>71 OR actual_count<>71 OR mismatch IS NOT NULL
    OR legacy_count<>0 OR school_count<>10006
    OR NOT EXISTS(SELECT 1 FROM public.public_account_launch_control
      WHERE control_key='public_account' AND state='closed' AND NOT account_registration_enabled
        AND NOT private_profile_enabled AND NOT school_membership_enabled)
  THEN RAISE EXCEPTION 'PHASE10N_POSTFLIGHT_MISMATCH' USING DETAIL=format(
    'contract=71 actual=%s unexpected=%s legacy=%s schools=%s',actual_count,coalesce(mismatch,'none'),legacy_count,school_count);
  END IF;

  IF has_table_privilege('authenticated','public.consent_records','INSERT')
    OR has_table_privilege('authenticated','public.account_deletion_requests','INSERT')
    OR has_table_privilege('authenticated','public.private_profiles','INSERT')
    OR has_table_privilege('authenticated','public.private_profiles','UPDATE')
    OR has_table_privilege('authenticated','public.private_profiles','DELETE')
    OR has_table_privilege('authenticated','public.profile_school_memberships','INSERT')
    OR has_table_privilege('authenticated','public.profile_school_memberships','UPDATE')
    OR has_table_privilege('authenticated','public.profile_school_memberships','DELETE')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy policy WHERE policy.polrelid IN (
      'public.consent_records'::regclass,'public.account_deletion_requests'::regclass,
      'public.private_profiles'::regclass,'public.profile_school_memberships'::regclass)
      AND policy.polcmd IN ('a','w','d'))
  THEN RAISE EXCEPTION 'PHASE10N_DIRECT_WRITE_PERMISSION_REMAINS'; END IF;
END
$phase10n_postflight$;

COMMENT ON TABLE public.public_account_launch_control IS
  'Service-role controlled public-account soft-launch boundary. The migration default is closed.';
COMMENT ON TABLE public.public_account_daily_funnel IS
  'Privacy-safe KST daily aggregate activity request counts and unique-account first milestones; never stores user, email, IP, query, token, or profile identifiers.';
COMMENT ON FUNCTION public.admin_prepare_public_account_deletion(uuid,text,text) IS
  'Phase one: atomically deletes public account data and blocks the Auth identity before the application calls the Auth Admin deletion API.';
COMMENT ON FUNCTION public.admin_finalize_public_account_auth_deletion(uuid,text,text) IS
  'Phase two: records completion only after the Auth foreign key is cleared by actual Auth identity deletion.';

COMMIT;
