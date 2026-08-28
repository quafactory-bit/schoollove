SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  diagnostic_rpc regprocedure:='public.fail_upstream_login_leg_with_diagnostic(uuid,uuid,text,text,integer)'::regprocedure;
  diagnostic_trigger regprocedure:='private.enforce_upstream_login_leg_diagnostic_immutability()'::regprocedure;
BEGIN
  IF has_function_privilege('anon',diagnostic_rpc,'EXECUTE')
    OR has_function_privilege('authenticated',diagnostic_rpc,'EXECUTE')
    OR NOT has_function_privilege('service_role',diagnostic_rpc,'EXECUTE')
    OR EXISTS(
      SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      WHERE p.oid=diagnostic_rpc AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    ) THEN RAISE EXCEPTION 'DIAGNOSTIC_RPC_PERMISSION_FAILURE'; END IF;

  IF has_function_privilege('anon',diagnostic_trigger,'EXECUTE')
    OR has_function_privilege('authenticated',diagnostic_trigger,'EXECUTE')
    OR has_function_privilege('service_role',diagnostic_trigger,'EXECUTE') THEN
    RAISE EXCEPTION 'DIAGNOSTIC_TRIGGER_PERMISSION_FAILURE';
  END IF;

  IF has_table_privilege('anon','private.upstream_login_legs','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','private.upstream_login_legs','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('service_role','private.upstream_login_legs','SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'DIAGNOSTIC_PRIVATE_TABLE_PERMISSION_FAILURE';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relname='upstream_login_legs'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'DIAGNOSTIC_RLS_FAILURE'; END IF;
END $$;

SELECT 'GOOGLE_DIAGNOSTIC_PERMISSIONS_OK service_rpc=1 browser_rpc=0 direct_private_crud=0 rls_forced=true' AS status;
