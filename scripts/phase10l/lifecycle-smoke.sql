\set ON_ERROR_STOP on

DO $$
DECLARE
  legacy_rows bigint;
  new_person_rows bigint;
  beta_operation_rows bigint;
BEGIN
  SELECT
      (SELECT count(*) FROM public.profiles)
    + (SELECT count(*) FROM public.reports)
    + (SELECT count(*) FROM public.traces)
    + (SELECT count(*) FROM public.search_logs)
    INTO legacy_rows;
  IF legacy_rows <> 0 THEN
    RAISE EXCEPTION 'legacy person data remains: %', legacy_rows;
  END IF;

  IF (SELECT count(*) FROM public.schools) <> 10006 THEN
    RAISE EXCEPTION 'school baseline changed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.schools
     WHERE coalesce(current_level, 1) <> 1 OR level_updated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'school growth state not reset';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.school_growth_ranking_v1(
      '1970-01-01 00:00:00+00', clock_timestamp(), 50
    )
  ) THEN
    RAISE EXCEPTION 'legacy ranking still returns rows';
  END IF;
  IF public.get_school_search_count(ARRAY['TEST']) <> 0 THEN
    RAISE EXCEPTION 'legacy search aggregation still returns a value';
  END IF;

  SELECT
      (SELECT count(*) FROM public.private_profiles)
    + (SELECT count(*) FROM public.profile_school_memberships)
    + (SELECT count(*) FROM public.adult_eligibility_records)
    + (SELECT count(*) FROM public.consent_records)
    + (SELECT count(*) FROM public.connection_requests)
    + (SELECT count(*) FROM public.connections)
    + (SELECT count(*) FROM public.connection_messages)
    + (SELECT count(*) FROM public.connection_instagram_permissions)
    INTO new_person_rows;
  IF new_person_rows <> 0 THEN
    RAISE EXCEPTION 'new account/person data changed: %', new_person_rows;
  END IF;

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
    INTO beta_operation_rows;
  IF beta_operation_rows <> 0 THEN
    RAISE EXCEPTION 'beta operation data changed: %', beta_operation_rows;
  END IF;
  IF (SELECT count(*) FROM public.beta_programs) <> 1
    OR (SELECT count(*) FROM public.beta_feature_flags WHERE program_id IS NULL AND user_id IS NULL) <> 8
    OR (SELECT count(*) FROM public.beta_feature_flags WHERE program_id IS NOT NULL OR user_id IS NOT NULL) <> 0
  THEN
    RAISE EXCEPTION 'preserved beta definition baseline changed';
  END IF;
END $$;

-- The post-reset schema must still support the approved private-account model.
-- Exercise it only inside an isolated rollback using the already-verified
-- PHASE 10J lifecycle suite.
SELECT 'PHASE10L_LIFECYCLE_OK' status;
