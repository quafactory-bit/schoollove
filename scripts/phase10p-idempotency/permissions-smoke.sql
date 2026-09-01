SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  target_rpc oid:='public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)'::regprocedure;
  private_tables integer;
  rls_tables integer;
  force_rls_tables integer;
BEGIN
  SELECT count(*),count(*) FILTER(WHERE c.relrowsecurity),count(*) FILTER(WHERE c.relforcerowsecurity)
    INTO private_tables,rls_tables,force_rls_tables
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relkind='r';
  IF private_tables<>9 OR rls_tables<>9 OR force_rls_tables<>9 THEN
    RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_PRIVATE_RLS tables=% rls=% force=%',private_tables,rls_tables,force_rls_tables;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=target_rpc AND p.prosecdef
      AND EXISTS(SELECT 1 FROM unnest(p.proconfig) setting WHERE setting IN ('search_path=','search_path=""'))
  ) THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_RPC_SECURITY'; END IF;
  IF NOT has_function_privilege('service_role',target_rpc,'EXECUTE')
    OR has_function_privilege('anon',target_rpc,'EXECUTE')
    OR has_function_privilege('authenticated',target_rpc,'EXECUTE')
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) privilege
      WHERE p.oid=target_rpc AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
    )
  THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_RPC_GRANT'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) roles(role_name)
    WHERE n.nspname='private' AND c.relkind='r'
      AND (has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'SELECT')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'INSERT')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'UPDATE')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'DELETE'))
  ) THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_PRIVATE_DIRECT_CRUD'; END IF;
END $$;

SELECT 'PHASE10P_RECOVERY_DELIVERY_IDEMPOTENCY_PERMISSIONS_OK private_tables=9 rls=9 force_rls=9 direct_private_crud=0' AS status;
