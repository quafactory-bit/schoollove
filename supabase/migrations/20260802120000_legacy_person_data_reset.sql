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
-- The all-zero legacy path is allowed so a fresh database can replay the full
-- migration history. Any partially populated or drifted legacy state fails
-- closed and leaves every row unchanged.

BEGIN;

LOCK TABLE
  public.profiles,
  public.reports,
  public.traces,
  public.search_logs,
  public.schools,
  public.private_profiles,
  public.profile_school_memberships,
  public.adult_eligibility_records,
  public.consent_records,
  public.account_deletion_requests,
  public.connection_match_tokens,
  public.connection_requests,
  public.connections,
  public.connection_messages,
  public.connection_instagram_permissions,
  public.notifications,
  public.user_blocks,
  public.safety_reports,
  public.data_export_jobs,
  public.admin_audit_logs,
  public.beta_programs,
  public.beta_feature_flags,
  public.beta_setup_drafts,
  public.beta_program_setup_snapshots,
  public.beta_program_schools,
  public.beta_readiness_snapshots,
  public.beta_invites,
  public.beta_members,
  public.beta_campaigns,
  public.beta_feedback,
  public.beta_onboarding_progress,
  public.beta_onboarding_stage_events,
  public.beta_operation_tasks,
  public.beta_operator_notes,
  public.beta_growth_daily_metrics,
  public.beta_campaign_aggregates,
  public.beta_audit_logs,
  public.promotion_accounts,
  public.promotion_account_verifications,
  public.promotion_assets,
  public.promotion_audit_logs,
  public.promotion_cancellation_requests,
  public.promotion_clicks,
  public.promotion_commercial_orders,
  public.promotion_impressions,
  public.promotion_notification_outbox,
  public.promotion_order_status_history,
  public.promotion_orders,
  public.promotion_payment_confirmations,
  public.promotion_payment_submissions,
  public.promotion_performance_reports,
  public.promotion_placements,
  public.promotion_products,
  public.promotion_quotes,
  public.promotion_refunds,
  public.promotion_reports,
  public.promotion_requests,
  public.promotion_reviews,
  public.payment_document_requests,
  public.payment_refund_attempts,
  public.payment_transactions,
  public.payment_webhook_events
IN SHARE ROW EXCLUSIVE MODE;

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
  beta_operation_count bigint;
  beta_program_count bigint;
  global_flag_count bigint;
  scoped_flag_count bigint;
  commercial_count bigint;
  empty_legacy boolean;
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

  empty_legacy := profile_count = 0
    AND report_row_count = 0
    AND trace_count = 0
    AND search_log_count = 0;

  IF new_person_count <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_NEW_PERSON_DATA_PRESENT'
      USING DETAIL = format('new_person_rows=%s', new_person_count);
  END IF;
  IF beta_operation_count <> 0 OR scoped_flag_count <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_BETA_OPERATION_DATA_PRESENT'
      USING DETAIL = format('operation_rows=%s scoped_flags=%s', beta_operation_count, scoped_flag_count);
  END IF;
  IF commercial_count <> 0 THEN
    RAISE EXCEPTION 'PHASE10L_COMMERCIAL_DATA_PRESENT'
      USING DETAIL = format('commercial_rows=%s', commercial_count);
  END IF;

  IF NOT empty_legacy AND (
       profile_count <> 25
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
    OR global_flag_count <> 8
  ) THEN
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
  FOREACH preserved_table IN ARRAY ARRAY[
    'schools',
    'private_profiles',
    'profile_school_memberships',
    'adult_eligibility_records',
    'consent_records',
    'account_deletion_requests',
    'connection_match_tokens',
    'connection_requests',
    'connections',
    'connection_messages',
    'connection_instagram_permissions',
    'notifications',
    'user_blocks',
    'safety_reports',
    'data_export_jobs',
    'admin_audit_logs',
    'beta_programs',
    'beta_feature_flags',
    'beta_setup_drafts',
    'beta_program_setup_snapshots',
    'beta_program_schools',
    'beta_readiness_snapshots',
    'beta_invites',
    'beta_members',
    'beta_campaigns',
    'beta_feedback',
    'beta_onboarding_progress',
    'beta_onboarding_stage_events',
    'beta_operation_tasks',
    'beta_operator_notes',
    'beta_growth_daily_metrics',
    'beta_campaign_aggregates',
    'beta_audit_logs',
    'promotion_accounts',
    'promotion_account_verifications',
    'promotion_assets',
    'promotion_audit_logs',
    'promotion_cancellation_requests',
    'promotion_clicks',
    'promotion_commercial_orders',
    'promotion_impressions',
    'promotion_notification_outbox',
    'promotion_order_status_history',
    'promotion_orders',
    'promotion_payment_confirmations',
    'promotion_payment_submissions',
    'promotion_performance_reports',
    'promotion_placements',
    'promotion_products',
    'promotion_quotes',
    'promotion_refunds',
    'promotion_reports',
    'promotion_requests',
    'promotion_reviews',
    'payment_document_requests',
    'payment_refund_attempts',
    'payment_transactions',
    'payment_webhook_events'
  ]
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

COMMIT;
