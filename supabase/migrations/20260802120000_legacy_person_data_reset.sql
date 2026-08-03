-- PHASE 10L: remove the pre-account legacy person dataset without widening
-- access or modifying schools, controlled-beta contracts, security objects, or
-- migration history.
--
-- Read-only Production audit on 2026-08-02 established the guarded baseline:
--   profiles=25 (owned=0, hidden=0, reported=0, schools=13)
--   reports=1, traces=8, search_logs=670, schools=10006
--   new private/account/connection data=0, real beta operation data=0
--   legacy beta programs=1, global beta feature flags=8
--   promotion/order/payment data=0
--
-- This is a one-time Production reset. It accepts only the exact audited
-- baseline. An empty or partially populated replay fails closed so a raw SQL
-- rerun cannot be mistaken for a new successful reset.

BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('phase10l-legacy-person-data-reset', 0)
);

CREATE TEMP TABLE phase10l_table_contract (
  table_name text PRIMARY KEY,
  disposition text NOT NULL CHECK (disposition IN ('delete', 'preserve'))
) ON COMMIT DROP;

INSERT INTO phase10l_table_contract(table_name, disposition)
VALUES
  ('reports', 'delete'),
  ('search_logs', 'delete'),
  ('traces', 'delete'),
  ('profiles', 'delete'),
  ('account_deletion_requests', 'preserve'),
  ('admin_audit_logs', 'preserve'),
  ('adult_eligibility_records', 'preserve'),
  ('beta_audit_logs', 'preserve'),
  ('beta_campaign_aggregates', 'preserve'),
  ('beta_campaigns', 'preserve'),
  ('beta_feature_flags', 'preserve'),
  ('beta_feedback', 'preserve'),
  ('beta_growth_daily_metrics', 'preserve'),
  ('beta_invites', 'preserve'),
  ('beta_members', 'preserve'),
  ('beta_onboarding_progress', 'preserve'),
  ('beta_onboarding_stage_events', 'preserve'),
  ('beta_operation_tasks', 'preserve'),
  ('beta_operator_notes', 'preserve'),
  ('beta_program_schools', 'preserve'),
  ('beta_program_setup_snapshots', 'preserve'),
  ('beta_programs', 'preserve'),
  ('beta_readiness_snapshots', 'preserve'),
  ('beta_setup_drafts', 'preserve'),
  ('connection_instagram_permissions', 'preserve'),
  ('connection_match_tokens', 'preserve'),
  ('connection_messages', 'preserve'),
  ('connection_requests', 'preserve'),
  ('connections', 'preserve'),
  ('consent_records', 'preserve'),
  ('data_export_jobs', 'preserve'),
  ('editorial_features', 'preserve'),
  ('notifications', 'preserve'),
  ('operational_event_counters', 'preserve'),
  ('operational_incidents', 'preserve'),
  ('operational_job_runs', 'preserve'),
  ('payment_document_requests', 'preserve'),
  ('payment_refund_attempts', 'preserve'),
  ('payment_transactions', 'preserve'),
  ('payment_webhook_events', 'preserve'),
  ('private_profiles', 'preserve'),
  ('profile_school_memberships', 'preserve'),
  ('promotion_account_verifications', 'preserve'),
  ('promotion_accounts', 'preserve'),
  ('promotion_assets', 'preserve'),
  ('promotion_audit_logs', 'preserve'),
  ('promotion_cancellation_requests', 'preserve'),
  ('promotion_clicks', 'preserve'),
  ('promotion_commercial_orders', 'preserve'),
  ('promotion_impressions', 'preserve'),
  ('promotion_notification_outbox', 'preserve'),
  ('promotion_order_status_history', 'preserve'),
  ('promotion_orders', 'preserve'),
  ('promotion_payment_confirmations', 'preserve'),
  ('promotion_payment_submissions', 'preserve'),
  ('promotion_performance_reports', 'preserve'),
  ('promotion_placements', 'preserve'),
  ('promotion_products', 'preserve'),
  ('promotion_quotes', 'preserve'),
  ('promotion_refunds', 'preserve'),
  ('promotion_reports', 'preserve'),
  ('promotion_requests', 'preserve'),
  ('promotion_reviews', 'preserve'),
  ('retention_policy_versions', 'preserve'),
  ('safety_account_restrictions', 'preserve'),
  ('safety_reports', 'preserve'),
  ('schools', 'preserve'),
  ('user_blocks', 'preserve');

DO $phase10l_table_classification$
DECLARE
  contract_count integer;
  delete_count integer;
  preserve_count integer;
  actual_count integer;
  mismatch text;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE disposition = 'delete'),
         count(*) FILTER (WHERE disposition = 'preserve')
    INTO contract_count, delete_count, preserve_count
    FROM phase10l_table_contract;

  SELECT count(*) INTO actual_count
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname = 'public' AND relation.relkind = 'r';

  SELECT string_agg(format('%s:%s', side, table_name), ', ' ORDER BY side, table_name)
    INTO mismatch
    FROM (
      SELECT 'unclassified' AS side, relation.relname AS table_name
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        LEFT JOIN phase10l_table_contract AS contract ON contract.table_name = relation.relname
       WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
         AND contract.table_name IS NULL
      UNION ALL
      SELECT 'missing' AS side, contract.table_name
        FROM phase10l_table_contract AS contract
        LEFT JOIN pg_catalog.pg_class AS relation
          ON relation.relname = contract.table_name
         AND relation.relnamespace = 'public'::regnamespace
         AND relation.relkind = 'r'
       WHERE relation.oid IS NULL
    ) AS differences;

  IF contract_count <> 68 OR delete_count <> 4 OR preserve_count <> 64
     OR actual_count <> 68 OR mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10L_PUBLIC_TABLE_CLASSIFICATION_MISMATCH'
      USING DETAIL = format(
        'contract=%s delete=%s preserve=%s actual=%s mismatch=%s',
        contract_count, delete_count, preserve_count, actual_count, coalesce(mismatch, 'none')
      );
  END IF;
END
$phase10l_table_classification$;

-- Lock all 68 classified relations in one deterministic alphabetical order.
DO $phase10l_lock_all$
DECLARE
  lock_targets text;
BEGIN
  SELECT string_agg(format('public.%I', table_name), ', ' ORDER BY table_name)
    INTO lock_targets
    FROM phase10l_table_contract;
  EXECUTE 'LOCK TABLE ' || lock_targets || ' IN SHARE ROW EXCLUSIVE MODE';
END
$phase10l_lock_all$;

-- Permanently close every legacy public write path. REVOKE ALL handles table
-- grants; explicit column revokes close historical column-only grants.
REVOKE ALL ON TABLE public.profiles, public.reports, public.traces, public.search_logs
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT (
  school_id, graduation_year, grade, class_number, department,
  student_year, nickname, instagram_id, description, is_self, message
) ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (profile_id, type, reason, requested_instagram_id, is_self_claimed)
  ON public.reports FROM PUBLIC, anon, authenticated;
REVOKE INSERT (school_id, graduation_year, grade, class_number, message)
  ON public.traces FROM PUBLIC, anon, authenticated;
REVOKE INSERT (query, result_count, clicked_school_id)
  ON public.search_logs FROM PUBLIC, anon, authenticated;
DO $phase10l_search_log_sequence$
BEGIN
  IF to_regclass('public.search_logs_id_seq') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON SEQUENCE public.search_logs_id_seq FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END
$phase10l_search_log_sequence$;
REVOKE ALL ON TABLE public.search_logs FROM service_role;

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_anon" ON public.profiles;
DROP POLICY IF EXISTS "reports_insert" ON public.reports;
DROP POLICY IF EXISTS "traces_insert_public" ON public.traces;
DROP POLICY IF EXISTS "Allow anon insert" ON public.search_logs;
DROP POLICY IF EXISTS "search_logs_insert" ON public.search_logs;

DO $phase10l_drop_legacy_insert_policies$
DECLARE
  legacy_policy record;
BEGIN
  FOR legacy_policy IN
    SELECT relation.relname AS table_name, policy.polname AS policy_name
      FROM pg_catalog.pg_policy AS policy
      JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
     WHERE policy.polrelid IN (
       'public.profiles'::regclass,
       'public.reports'::regclass,
       'public.traces'::regclass,
       'public.search_logs'::regclass
     )
       AND policy.polcmd = 'a'
     ORDER BY relation.relname, policy.polname
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', legacy_policy.policy_name, legacy_policy.table_name);
  END LOOP;
END
$phase10l_drop_legacy_insert_policies$;

-- Freeze the complete UUID person-link column catalog audited on 2026-08-03.
-- A new or removed account/user/profile/member/invite link must be reviewed in
-- a separate forward migration rather than being silently ignored or deleted.
CREATE TEMP TABLE phase10l_person_link_contract (
  table_name text NOT NULL,
  column_name text NOT NULL,
  PRIMARY KEY(table_name, column_name)
) ON COMMIT DROP;

INSERT INTO phase10l_person_link_contract(table_name, column_name)
VALUES
  ('account_deletion_requests', 'user_id'),
  ('adult_eligibility_records', 'user_id'),
  ('beta_campaigns', 'invite_id'),
  ('beta_feature_flags', 'user_id'),
  ('beta_feedback', 'owner_user_id'),
  ('beta_members', 'invite_id'),
  ('beta_members', 'user_id'),
  ('beta_onboarding_progress', 'user_id'),
  ('connection_instagram_permissions', 'grantee_user_id'),
  ('connection_instagram_permissions', 'grantor_user_id'),
  ('connection_match_tokens', 'receiver_user_id'),
  ('connection_match_tokens', 'requester_user_id'),
  ('connection_messages', 'sender_user_id'),
  ('connection_requests', 'receiver_user_id'),
  ('connection_requests', 'sender_user_id'),
  ('connections', 'disconnected_by_user_id'),
  ('consent_records', 'user_id'),
  ('data_export_jobs', 'owner_user_id'),
  ('editorial_features', 'account_id'),
  ('notifications', 'user_id'),
  ('payment_document_requests', 'owner_user_id'),
  ('payment_transactions', 'owner_user_id'),
  ('private_profiles', 'owner_user_id'),
  ('profile_school_memberships', 'owner_user_id'),
  ('profile_school_memberships', 'profile_id'),
  ('profiles', 'owner_user_id'),
  ('promotion_account_verifications', 'account_id'),
  ('promotion_accounts', 'owner_user_id'),
  ('promotion_cancellation_requests', 'owner_user_id'),
  ('promotion_commercial_orders', 'owner_user_id'),
  ('promotion_notification_outbox', 'owner_user_id'),
  ('promotion_payment_submissions', 'owner_user_id'),
  ('promotion_performance_reports', 'owner_user_id'),
  ('promotion_quotes', 'owner_user_id'),
  ('promotion_reports', 'reporter_user_id'),
  ('promotion_requests', 'account_id'),
  ('promotion_requests', 'owner_user_id'),
  ('reports', 'profile_id'),
  ('safety_account_restrictions', 'user_id'),
  ('safety_reports', 'reported_user_id'),
  ('safety_reports', 'reporter_user_id'),
  ('user_blocks', 'blocked_user_id'),
  ('user_blocks', 'blocker_user_id');

DO $phase10l_person_link_classification$
DECLARE
  mismatch text;
BEGIN
  SELECT string_agg(format('%s:%s.%s', side, table_name, column_name), ', '
                    ORDER BY side, table_name, column_name)
    INTO mismatch
    FROM (
      SELECT 'unexpected' AS side, column_info.table_name, column_info.column_name
        FROM information_schema.columns AS column_info
        LEFT JOIN phase10l_person_link_contract AS contract
          ON contract.table_name = column_info.table_name
         AND contract.column_name = column_info.column_name
       WHERE column_info.table_schema = 'public'
         AND column_info.data_type = 'uuid'
         AND column_info.column_name ~ '(^|_)(user|profile|account|member|invite)_id$'
         AND contract.table_name IS NULL
      UNION ALL
      SELECT 'missing' AS side, contract.table_name, contract.column_name
        FROM phase10l_person_link_contract AS contract
        LEFT JOIN information_schema.columns AS column_info
          ON column_info.table_schema = 'public'
         AND column_info.table_name = contract.table_name
         AND column_info.column_name = contract.column_name
         AND column_info.data_type = 'uuid'
       WHERE column_info.column_name IS NULL
    ) AS differences;

  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10L_PERSON_LINK_COLUMN_CLASSIFICATION_MISMATCH'
      USING DETAIL = mismatch;
  END IF;
END
$phase10l_person_link_classification$;

CREATE TEMP TABLE phase10l_affected_schools ON COMMIT DROP AS
SELECT DISTINCT school_id
FROM public.profiles;

DO $phase10l_preflight$
DECLARE
  profile_count bigint;
  owned_profile_count bigint;
  hidden_profile_count bigint;
  reported_profile_count bigint;
  profile_school_count bigint;
  report_row_count bigint;
  trace_count bigint;
  search_log_count bigint;
  school_count bigint;
  school_growth_drift_count bigint;
  new_person_count bigint;
  safety_restriction_count bigint;
  editorial_account_count bigint;
  beta_operation_count bigint;
  beta_program_count bigint;
  global_flag_count bigint;
  scoped_flag_count bigint;
  commercial_count bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE legacy_profile.owner_user_id IS NOT NULL),
         count(*) FILTER (WHERE coalesce(legacy_profile.is_hidden, false)),
         count(*) FILTER (WHERE coalesce(legacy_profile.report_count, 0) > 0),
         count(DISTINCT legacy_profile.school_id)
    INTO profile_count, owned_profile_count, hidden_profile_count,
         reported_profile_count, profile_school_count
    FROM public.profiles AS legacy_profile;

  SELECT count(*) INTO report_row_count FROM public.reports;
  SELECT count(*) INTO trace_count FROM public.traces;
  SELECT count(*) INTO search_log_count FROM public.search_logs;
  SELECT count(*) INTO school_count FROM public.schools;
  SELECT count(*) INTO school_growth_drift_count
    FROM public.schools
     WHERE coalesce(current_level, 1) <> 1 OR level_updated_at IS NOT NULL;

  SELECT count(*) INTO safety_restriction_count
    FROM public.safety_account_restrictions;
  SELECT count(*) INTO editorial_account_count
    FROM public.editorial_features
   WHERE account_id IS NOT NULL;

  SELECT
      (SELECT count(*) FROM public.private_profiles)
    + (SELECT count(*) FROM public.profile_school_memberships)
    + (SELECT count(*) FROM public.adult_eligibility_records)
    + (SELECT count(*) FROM public.consent_records)
    + (SELECT count(*) FROM public.account_deletion_requests)
    + (SELECT count(*) FROM public.connection_match_tokens)
    + (SELECT count(*) FROM public.connection_requests)
    + (SELECT count(*) FROM public.connections)
    + (SELECT count(*) FROM public.connection_messages)
    + (SELECT count(*) FROM public.connection_instagram_permissions)
    + (SELECT count(*) FROM public.notifications)
    + (SELECT count(*) FROM public.user_blocks)
    + (SELECT count(*) FROM public.safety_reports)
    + (SELECT count(*) FROM public.data_export_jobs)
    + safety_restriction_count
    INTO new_person_count;

  SELECT
      (SELECT count(*) FROM public.beta_setup_drafts)
    + (SELECT count(*) FROM public.beta_program_setup_snapshots)
    + (SELECT count(*) FROM public.beta_program_schools)
    + (SELECT count(*) FROM public.beta_readiness_snapshots)
    + (SELECT count(*) FROM public.beta_invites)
    + (SELECT count(*) FROM public.beta_members)
    + (SELECT count(*) FROM public.beta_campaigns)
    + (SELECT count(*) FROM public.beta_feedback)
    + (SELECT count(*) FROM public.beta_onboarding_progress)
    + (SELECT count(*) FROM public.beta_onboarding_stage_events)
    + (SELECT count(*) FROM public.beta_operation_tasks)
    + (SELECT count(*) FROM public.beta_operator_notes)
    + (SELECT count(*) FROM public.beta_growth_daily_metrics)
    + (SELECT count(*) FROM public.beta_campaign_aggregates)
    + (SELECT count(*) FROM public.beta_audit_logs)
    INTO beta_operation_count;

  SELECT count(*) INTO beta_program_count FROM public.beta_programs;
  SELECT count(*) FILTER (WHERE program_id IS NULL AND user_id IS NULL),
         count(*) FILTER (WHERE program_id IS NOT NULL OR user_id IS NOT NULL)
    INTO global_flag_count, scoped_flag_count
    FROM public.beta_feature_flags;

  SELECT
      (SELECT count(*) FROM public.promotion_accounts)
    + (SELECT count(*) FROM public.promotion_account_verifications)
    + (SELECT count(*) FROM public.promotion_assets)
    + (SELECT count(*) FROM public.promotion_audit_logs)
    + (SELECT count(*) FROM public.promotion_cancellation_requests)
    + (SELECT count(*) FROM public.promotion_clicks)
    + (SELECT count(*) FROM public.promotion_commercial_orders)
    + (SELECT count(*) FROM public.promotion_impressions)
    + (SELECT count(*) FROM public.promotion_notification_outbox)
    + (SELECT count(*) FROM public.promotion_order_status_history)
    + (SELECT count(*) FROM public.promotion_orders)
    + (SELECT count(*) FROM public.promotion_payment_confirmations)
    + (SELECT count(*) FROM public.promotion_payment_submissions)
    + (SELECT count(*) FROM public.promotion_performance_reports)
    + (SELECT count(*) FROM public.promotion_placements)
    + (SELECT count(*) FROM public.promotion_products)
    + (SELECT count(*) FROM public.promotion_quotes)
    + (SELECT count(*) FROM public.promotion_refunds)
    + (SELECT count(*) FROM public.promotion_reports)
    + (SELECT count(*) FROM public.promotion_requests)
    + (SELECT count(*) FROM public.promotion_reviews)
    + (SELECT count(*) FROM public.payment_document_requests)
    + (SELECT count(*) FROM public.payment_refund_attempts)
    + (SELECT count(*) FROM public.payment_transactions)
    + (SELECT count(*) FROM public.payment_webhook_events)
    INTO commercial_count;

  IF new_person_count <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_NEW_PERSON_DATA_PRESENT'
      USING DETAIL = format('new_person_rows=%s', new_person_count);
  END IF;
  IF editorial_account_count <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_EDITORIAL_ACCOUNT_DATA_PRESENT'
      USING DETAIL = format('editorial_account_rows=%s', editorial_account_count);
  END IF;
  IF beta_operation_count <> 0 OR scoped_flag_count <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_BETA_OPERATION_DATA_PRESENT'
      USING DETAIL = format('operation_rows=%s scoped_flags=%s', beta_operation_count, scoped_flag_count);
  END IF;
  IF commercial_count <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_COMMERCIAL_DATA_PRESENT'
      USING DETAIL = format('commercial_rows=%s', commercial_count);
  END IF;

  IF profile_count <> 25
    OR owned_profile_count <> 0
    OR hidden_profile_count <> 0
    OR reported_profile_count <> 0
    OR profile_school_count <> 13
    OR report_row_count <> 1
    OR trace_count <> 8
    OR search_log_count <> 670
    OR school_count <> 10006
    OR school_growth_drift_count <> 0
    OR beta_program_count <> 1
    OR global_flag_count <> 8 THEN
    RAISE EXCEPTION 'PHASE10L_PRODUCTION_BASELINE_MISMATCH'
      USING DETAIL = format(
        'profiles=%s owned=%s hidden=%s reported=%s profile_schools=%s reports=%s traces=%s search_logs=%s schools=%s school_growth_drift=%s beta_programs=%s global_flags=%s',
        profile_count, owned_profile_count, hidden_profile_count,
        reported_profile_count, profile_school_count, report_row_count,
        trace_count, search_log_count, school_count,
        school_growth_drift_count, beta_program_count, global_flag_count
      );
  END IF;
END
$phase10l_preflight$;

-- Record table-by-table counts for every preserved domain while the write
-- locks are held. Postflight recomputes each value before commit.
CREATE TEMP TABLE phase10l_preserved_counts (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL
) ON COMMIT DROP;

DO $phase10l_capture_preserved$
DECLARE
  preserved_table text;
  preserved_count bigint;
BEGIN
  FOR preserved_table IN
    SELECT table_name
      FROM phase10l_table_contract
     WHERE disposition = 'preserve'
     ORDER BY table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', preserved_table)
      INTO preserved_count;
    INSERT INTO phase10l_preserved_counts(table_name, row_count)
    VALUES (preserved_table, preserved_count);
  END LOOP;
END
$phase10l_capture_preserved$;

-- Delete explicit dependents and standalone legacy person/search content before
-- deleting the legacy profile rows. No auth user or private account row is used
-- as a replacement owner.
DELETE FROM public.reports;
DELETE FROM public.traces;
DELETE FROM public.search_logs;

UPDATE public.schools AS school
   SET current_level = 1,
       level_updated_at = NULL
  FROM phase10l_affected_schools AS affected
 WHERE school.id = affected.school_id
   AND (coalesce(school.current_level, 1) <> 1 OR school.level_updated_at IS NOT NULL);

DELETE FROM public.profiles;

DO $phase10l_postflight$
DECLARE
  remaining_legacy bigint;
  invalid_affected_school_levels bigint;
BEGIN
  SELECT
      (SELECT count(*) FROM public.profiles)
    + (SELECT count(*) FROM public.reports)
    + (SELECT count(*) FROM public.traces)
    + (SELECT count(*) FROM public.search_logs)
    INTO remaining_legacy;

  IF remaining_legacy <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_RESET_INCOMPLETE'
      USING DETAIL = format('remaining_legacy_rows=%s', remaining_legacy);
  END IF;

  SELECT count(*) INTO invalid_affected_school_levels
    FROM public.schools AS school
    JOIN phase10l_affected_schools AS affected ON affected.school_id = school.id
   WHERE coalesce(school.current_level, 1) <> 1 OR school.level_updated_at IS NOT NULL;

  IF invalid_affected_school_levels <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_SCHOOL_GROWTH_RESET_INCOMPLETE'
      USING DETAIL = format('invalid_school_rows=%s', invalid_affected_school_levels);
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.school_growth_ranking_v1('1970-01-01 00:00:00+00', clock_timestamp(), 50)
  ) THEN
    RAISE EXCEPTION 'PHASE10L_RANKING_NOT_EMPTY';
  END IF;
END
$phase10l_postflight$;

DO $phase10l_verify_preserved$
DECLARE
  preserved_record record;
  current_count bigint;
BEGIN
  FOR preserved_record IN
    SELECT table_name, row_count FROM phase10l_preserved_counts ORDER BY table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', preserved_record.table_name)
      INTO current_count;
    IF current_count <> preserved_record.row_count THEN
      RAISE EXCEPTION 'PHASE10L_PRESERVED_TABLE_CHANGED'
        USING DETAIL = format(
          'table=%s before=%s after=%s',
          preserved_record.table_name,
          preserved_record.row_count,
          current_count
        );
    END IF;
  END LOOP;
END
$phase10l_verify_preserved$;

DO $phase10l_verify_legacy_writes_closed$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF has_table_privilege(role_name, 'public.profiles', 'INSERT')
       OR has_table_privilege(role_name, 'public.reports', 'INSERT')
       OR has_table_privilege(role_name, 'public.traces', 'INSERT')
       OR has_table_privilege(role_name, 'public.search_logs', 'INSERT')
       OR has_any_column_privilege(role_name, 'public.profiles', 'INSERT')
       OR has_any_column_privilege(role_name, 'public.reports', 'INSERT')
       OR has_any_column_privilege(role_name, 'public.traces', 'INSERT')
       OR has_any_column_privilege(role_name, 'public.search_logs', 'INSERT') THEN
      RAISE EXCEPTION 'PHASE10L_LEGACY_PUBLIC_INSERT_PRIVILEGE_REMAINS'
        USING DETAIL = format('role=%s', role_name);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM information_schema.table_privileges AS privilege
     WHERE privilege.table_schema = 'public'
       AND privilege.table_name IN ('profiles','reports','traces','search_logs')
       AND privilege.grantee = 'PUBLIC' AND privilege.privilege_type = 'INSERT'
  ) OR EXISTS (
    SELECT 1
      FROM information_schema.column_privileges AS privilege
     WHERE privilege.table_schema = 'public'
       AND privilege.table_name IN ('profiles','reports','traces','search_logs')
       AND privilege.grantee = 'PUBLIC' AND privilege.privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'PHASE10L_LEGACY_PUBLIC_INSERT_PRIVILEGE_REMAINS'
      USING DETAIL = 'role=PUBLIC';
  END IF;

  IF has_table_privilege('service_role', 'public.search_logs', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_any_column_privilege('service_role', 'public.search_logs', 'INSERT') THEN
    RAISE EXCEPTION 'PHASE10L_SEARCH_LOG_SERVICE_ROLE_PRIVILEGE_REMAINS';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policy AS policy
     WHERE policy.polrelid IN (
       'public.profiles'::regclass,
       'public.reports'::regclass,
       'public.traces'::regclass,
       'public.search_logs'::regclass
     )
       AND policy.polcmd = 'a'
       AND (
         policy.polroles = ARRAY[0::oid]
         OR policy.polroles && ARRAY[
           (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'anon'),
           (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
         ]
       )
  ) THEN
    RAISE EXCEPTION 'PHASE10L_LEGACY_PUBLIC_INSERT_POLICY_REMAINS';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc AS routine
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
     WHERE namespace.nspname = 'public'
       AND routine.prokind IN ('f', 'p')
       AND routine.prosrc ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(public\\.)?(profiles|reports|traces|search_logs)'
       AND (
         has_function_privilege('anon', routine.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', routine.oid, 'EXECUTE')
       )
  ) THEN
    RAISE EXCEPTION 'PHASE10L_LEGACY_PUBLIC_WRITE_RPC_REMAINS';
  END IF;
END
$phase10l_verify_legacy_writes_closed$;

COMMIT;
