\set ON_ERROR_STOP on
DO $$
DECLARE table_name text; function_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['beta_programs','beta_invites','beta_members','beta_feature_flags','beta_audit_logs','operational_job_runs','data_export_jobs','retention_policy_versions','operational_event_counters','operational_incidents']
  LOOP
    IF has_table_privilege('anon','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'anon privilege leak on %',table_name; END IF;
    IF has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'authenticated mutation leak on %',table_name; END IF;
    IF NOT has_table_privilege('service_role','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'service role missing on %',table_name; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.has_beta_feature_access(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'anon beta function leak'; END IF;
  IF NOT has_function_privilege('authenticated','public.has_beta_feature_access(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'authenticated beta check missing'; END IF;
  FOREACH function_name IN ARRAY ARRAY['redeem_beta_invite','admin_issue_beta_invite','admin_review_beta_member','admin_set_beta_feature','admin_set_beta_emergency','request_own_data_export','record_operational_event','run_phase10f_maintenance']
  LOOP
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=function_name AND has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'authenticated privileged RPC leak on %',function_name; END IF;
  END LOOP;
END $$;
SELECT 'PHASE10F_PERMISSIONS_OK' AS status;
