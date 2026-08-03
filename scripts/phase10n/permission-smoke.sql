\set ON_ERROR_STOP on
DO $$
DECLARE table_name text; forbidden integer;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['public_account_launch_control','public_account_launch_audit','public_account_daily_funnel'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=table_name AND c.relrowsecurity AND c.relforcerowsecurity)
    THEN RAISE EXCEPTION 'RLS/FORCE missing: %',table_name; END IF;
  END LOOP;
  SELECT count(*) INTO forbidden FROM information_schema.role_table_grants grants
  WHERE grants.table_schema='public' AND grants.table_name IN ('public_account_launch_control','public_account_launch_audit','public_account_daily_funnel')
    AND grants.grantee IN ('PUBLIC','anon','authenticated');
  IF forbidden<>0 THEN RAISE EXCEPTION 'direct public launch table grant found'; END IF;
  IF has_function_privilege('anon','public.admin_set_public_account_launch_state(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_set_public_account_launch_state(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_complete_public_account_deletion(uuid,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'admin RPC exposed'; END IF;
  IF NOT has_function_privilege('anon','public.get_public_account_launch_state()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_public_account_launch_state()','EXECUTE')
  THEN RAISE EXCEPTION 'safe launch state RPC unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='phase10n_account_school_scope' AND NOT tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='phase10j_beta_school_scope' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'membership trigger drift'; END IF;
END $$;
SELECT 'PHASE10N_PERMISSION_OK' status;
