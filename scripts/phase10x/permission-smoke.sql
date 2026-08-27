\set ON_ERROR_STOP on
DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text)',
    'public.admin_activate_beta_setup(uuid,text)',
    'public.admin_configure_controlled_beta_features(uuid,text[],text)',
    'public.admin_start_controlled_beta_program(uuid,text,text)',
    'public.admin_reactivate_controlled_beta_program(uuid,text,text,text)'
  ] LOOP
    IF has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR NOT has_function_privilege('service_role',signature,'EXECUTE')
      THEN RAISE EXCEPTION 'PHASE10X admin RPC privilege invalid: %',signature; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.has_beta_feature_access(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.has_beta_feature_access(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.has_beta_feature_access(uuid,text)','EXECUTE')
    THEN RAISE EXCEPTION 'PHASE10X feature-access privilege invalid'; END IF;
  IF has_table_privilege('anon','public.beta_program_schools','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.beta_program_schools','SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'PHASE10X allowlist table privilege leaked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.beta_program_schools'::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'PHASE10X allowlist RLS/FORCE missing'; END IF;
END $$;
SELECT 'PHASE10X_PERMISSIONS_OK admin_service_only=true access_auth_service=true rls_force_unchanged=true' status;
