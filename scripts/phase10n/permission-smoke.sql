\set ON_ERROR_STOP on
DO $$
DECLARE table_name text; forbidden integer; procedure_name text; procedure_oid oid;
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
  IF has_table_privilege('authenticated','public.consent_records','INSERT')
    OR has_table_privilege('authenticated','public.account_deletion_requests','INSERT')
    OR has_table_privilege('authenticated','public.private_profiles','INSERT')
    OR has_table_privilege('authenticated','public.private_profiles','UPDATE')
    OR has_table_privilege('authenticated','public.private_profiles','DELETE')
    OR has_table_privilege('authenticated','public.profile_school_memberships','INSERT')
    OR has_table_privilege('authenticated','public.profile_school_memberships','UPDATE')
    OR has_table_privilege('authenticated','public.profile_school_memberships','DELETE')
  THEN RAISE EXCEPTION 'authenticated direct account write remains'; END IF;
  IF NOT has_table_privilege('authenticated','public.adult_eligibility_records','SELECT')
    OR NOT has_table_privilege('authenticated','public.consent_records','SELECT')
    OR NOT has_table_privilege('authenticated','public.private_profiles','SELECT')
    OR NOT has_table_privilege('authenticated','public.profile_school_memberships','SELECT')
    OR NOT has_table_privilege('authenticated','public.account_deletion_requests','SELECT')
    OR has_table_privilege('anon','public.adult_eligibility_records','SELECT')
    OR has_table_privilege('anon','public.consent_records','SELECT')
    OR has_table_privilege('anon','public.private_profiles','SELECT')
    OR has_table_privilege('anon','public.profile_school_memberships','SELECT')
    OR has_table_privilege('anon','public.account_deletion_requests','SELECT')
  THEN RAISE EXCEPTION 'owner select or anon personal-table contract drifted'; END IF;
  IF has_function_privilege('anon','public.admin_set_public_account_launch_state(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_set_public_account_launch_state(text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_record_public_account_readiness(text,text,text,text,integer,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_open_public_account_launch(uuid,text,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_prepare_public_account_deletion(uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_begin_public_account_auth_deletion(uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.record_public_account_activity(text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.increment_public_account_metric(text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'service-only RPC exposed'; END IF;
  IF NOT has_function_privilege('authenticated','public.record_own_required_consents(text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.upsert_own_private_profile(text,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.add_own_school_membership(uuid,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.request_own_account_deletion()','EXECUTE')
    OR NOT has_function_privilege('anon','public.get_public_account_launch_state()','EXECUTE')
    OR NOT has_function_privilege('anon','public.search_schools_with_activity(text,integer)','EXECUTE')
  THEN RAISE EXCEPTION 'safe owner/public RPC unavailable'; END IF;
  IF NOT has_function_privilege('service_role','public.admin_set_public_account_launch_state(text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_record_public_account_readiness(text,text,text,text,integer,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_open_public_account_launch(uuid,text,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_prepare_public_account_deletion(uuid,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_begin_public_account_auth_deletion(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_finalize_public_account_auth_deletion(uuid,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'required service RPC unavailable'; END IF;
  FOREACH procedure_name IN ARRAY ARRAY[
    'public.record_own_required_consents(text)','public.upsert_own_private_profile(text,text,text)',
    'public.delete_own_private_profile()','public.add_own_school_membership(uuid,integer,integer)',
    'public.delete_own_school_membership(uuid)','public.request_own_account_deletion()',
    'public.admin_set_public_account_launch_state(text,text,text)',
    'public.admin_record_public_account_readiness(text,text,text,text,integer,jsonb)',
    'public.admin_open_public_account_launch(uuid,text,text,text,text)',
    'public.admin_prepare_public_account_deletion(uuid,text,text)',
    'public.admin_begin_public_account_auth_deletion(uuid,text)',
    'public.admin_finalize_public_account_auth_deletion(uuid,text,text)'
  ] LOOP
    procedure_oid:=to_regprocedure(procedure_name);
    IF procedure_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc function
      JOIN pg_roles owner ON owner.oid=function.proowner
      WHERE function.oid=procedure_oid AND function.prosecdef AND owner.rolname='postgres'
        AND function.proconfig @> ARRAY['search_path=""'])
    THEN RAISE EXCEPTION 'SECURITY DEFINER owner/search_path drift: %',procedure_name; END IF;
  END LOOP;
  IF to_regprocedure('public.request_own_account_deletion(text)') IS NOT NULL
    THEN RAISE EXCEPTION 'legacy free-text deletion RPC remains'; END IF;
  IF EXISTS(SELECT 1 FROM pg_policy policy WHERE policy.polrelid IN (
      'public.consent_records'::regclass,'public.account_deletion_requests'::regclass,
      'public.private_profiles'::regclass,'public.profile_school_memberships'::regclass)
      AND policy.polcmd IN ('a','w','d'))
    THEN RAISE EXCEPTION 'direct owner mutation policy remains'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='phase10n_account_school_scope' AND NOT tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='phase10j_beta_school_scope' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'membership trigger drift'; END IF;
END $$;
SELECT 'PHASE10N_PERMISSION_OK' status;
