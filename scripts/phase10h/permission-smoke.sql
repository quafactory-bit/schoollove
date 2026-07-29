\set ON_ERROR_STOP on
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['beta_onboarding_progress','beta_onboarding_stage_events','beta_growth_daily_metrics'] LOOP
    IF has_table_privilege('anon','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'anon privilege leak on %',table_name; END IF;
    IF has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'authenticated mutation leak on %',table_name; END IF;
    IF NOT has_table_privilege('service_role','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'service role missing on %',table_name; END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated','public.beta_onboarding_progress','SELECT') THEN RAISE EXCEPTION 'owner progress select missing'; END IF;
  IF has_table_privilege('authenticated','public.beta_onboarding_stage_events','SELECT') OR has_table_privilege('authenticated','public.beta_growth_daily_metrics','SELECT')
    THEN RAISE EXCEPTION 'aggregate internals exposed'; END IF;
  IF has_function_privilege('anon','public.sync_own_beta_onboarding_state(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'anon sync access leak'; END IF;
  IF NOT has_function_privilege('authenticated','public.sync_own_beta_onboarding_state(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'owner sync access missing'; END IF;
  IF has_function_privilege('authenticated','public.admin_get_limited_launch_funnel(date,date)','EXECUTE') OR has_function_privilege('authenticated','public.run_phase10h_maintenance(text,timestamptz)','EXECUTE')
    THEN RAISE EXCEPTION 'privileged onboarding RPC exposed'; END IF;
  IF NOT has_function_privilege('service_role','public.admin_get_limited_launch_funnel(date,date)','EXECUTE') OR NOT has_function_privilege('service_role','public.run_phase10h_maintenance(text,timestamptz)','EXECUTE')
    THEN RAISE EXCEPTION 'service onboarding RPC missing'; END IF;
END $$;
SELECT 'PHASE10H_PERMISSIONS_OK' AS status;
