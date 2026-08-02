\set ON_ERROR_STOP on
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.beta_program_schools'::regclass AND relrowsecurity AND relforcerowsecurity)
    THEN RAISE EXCEPTION 'beta_program_schools RLS/FORCE missing'; END IF;
  IF has_table_privilege('anon','public.beta_program_schools','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','public.beta_program_schools','SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'direct school allowlist privilege leaked'; END IF;
  IF NOT has_table_privilege('service_role','public.beta_program_schools','SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'service role allowlist privilege missing'; END IF;
  IF has_function_privilege('anon','public.admin_start_controlled_beta_program(uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.admin_start_controlled_beta_program(uuid,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_start_controlled_beta_program(uuid,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'start RPC privilege boundary invalid'; END IF;
  IF has_function_privilege('authenticated','public.admin_reactivate_controlled_beta_program(uuid,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_reactivate_controlled_beta_program(uuid,text,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'reactivation RPC privilege boundary invalid'; END IF;
  IF has_function_privilege('authenticated','public.admin_configure_controlled_beta_features(uuid,text[],text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_configure_controlled_beta_features(uuid,text[],text)','EXECUTE')
    THEN RAISE EXCEPTION 'feature RPC privilege boundary invalid'; END IF;
  IF has_function_privilege('authenticated','public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'setup RPC privilege boundary invalid'; END IF;
END $$;
SET ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.admin_start_controlled_beta_program('49999999-0000-4000-8000-000000000099','OPERATOR_APPROVED_START','test:service-role');
    RAISE EXCEPTION 'missing program unexpectedly started';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'PROGRAM_NOT_FOUND' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT 'PHASE10J_PERMISSIONS_OK' status;
