SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE private_tables integer; rls_tables integer; force_rls_tables integer; signature text;
BEGIN
  SELECT count(*),count(*) FILTER(WHERE c.relrowsecurity),count(*) FILTER(WHERE c.relforcerowsecurity)
    INTO private_tables,rls_tables,force_rls_tables
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relkind='r';
  IF private_tables<>9 OR rls_tables<>9 OR force_rls_tables<>9 THEN
    RAISE EXCEPTION 'PHASE10P_PRIVATE_RLS_BOUNDARY tables=% rls=% force=%',private_tables,rls_tables,force_rls_tables;
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.get_social_recovery_http_context(uuid)',
    'public.bind_social_auth_principal_from_attempt(uuid,uuid)'
  ] LOOP
    IF NOT has_function_privilege('service_role',signature,'EXECUTE')
      OR has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR EXISTS(
        SELECT 1
        FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
        ) privilege
        WHERE p.oid=to_regprocedure(signature)
          AND privilege.grantee=0
          AND privilege.privilege_type='EXECUTE'
      ) THEN
      RAISE EXCEPTION 'PHASE10P_RPC_PERMISSION_BOUNDARY %',signature;
    END IF;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) AS roles(role_name)
    WHERE n.nspname='private' AND c.relkind='r'
      AND (has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'SELECT')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'INSERT')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'UPDATE')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'DELETE'))
  ) THEN RAISE EXCEPTION 'PHASE10P_PRIVATE_DIRECT_CRUD_EXPOSED'; END IF;
END $$;

SELECT 'PHASE10P_FIRST_LOGIN_PERMISSIONS_OK' AS status;
SELECT 'PHASE10P_PRIVATE_TABLES_9_RLS_FORCE_RLS_OK' AS status;
