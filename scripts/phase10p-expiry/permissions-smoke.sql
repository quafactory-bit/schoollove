SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  private_tables integer;
  rls_tables integer;
  force_rls_tables integer;
  helper oid:='private.expire_stale_social_identity_attempt(uuid,timestamp with time zone)'::regprocedure;
  public_rpc oid:='public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)'::regprocedure;
  role_name text;
  index_predicate text;
BEGIN
  SELECT count(*),count(*) FILTER(WHERE c.relrowsecurity),count(*) FILTER(WHERE c.relforcerowsecurity)
    INTO private_tables,rls_tables,force_rls_tables
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relkind='r';
  IF private_tables<>9 OR rls_tables<>9 OR force_rls_tables<>9 THEN
    RAISE EXCEPTION 'PHASE10P_EXPIRY_PRIVATE_RLS tables=% rls=% force=%',private_tables,rls_tables,force_rls_tables;
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=helper AND p.prosecdef
      AND EXISTS(
        SELECT 1 FROM unnest(p.proconfig) setting
        WHERE setting IN ('search_path=','search_path=""')
      )
  ) THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_HELPER_SECURITY'; END IF;

  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_function_privilege(role_name,helper,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE10P_EXPIRY_HELPER_GRANT %',role_name;
    END IF;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) privilege
    WHERE p.oid=helper AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_HELPER_PUBLIC_GRANT'; END IF;

  IF NOT has_function_privilege('service_role',public_rpc,'EXECUTE')
    OR has_function_privilege('anon',public_rpc,'EXECUTE')
    OR has_function_privilege('authenticated',public_rpc,'EXECUTE')
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc p
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) privilege
      WHERE p.oid=public_rpc AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
    )
  THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PUBLIC_RPC_GRANT'; END IF;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) roles(role_name)
    WHERE n.nspname='private' AND c.relkind='r'
      AND (has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'SELECT')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'INSERT')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'UPDATE')
        OR has_table_privilege(roles.role_name,format('%I.%I',n.nspname,c.relname),'DELETE'))
  ) THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PRIVATE_DIRECT_CRUD'; END IF;

  SELECT pg_catalog.pg_get_expr(i.indpred,i.indrelid) INTO index_predicate
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relname='oauth_login_attempts_live_subject_unique' AND i.indisunique;
  IF index_predicate IS NULL
    OR index_predicate NOT LIKE '%upstream_verified%'
    OR index_predicate NOT LIKE '%recovery_required%'
    OR index_predicate NOT LIKE '%recovery_pending%'
    OR index_predicate NOT LIKE '%recovery_verified%'
  THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_UNIQUE_INDEX_CONTRACT'; END IF;
END $$;

SELECT 'PHASE10P_STALE_EXPIRY_PERMISSIONS_OK private_tables=9 rls=9 force_rls=9 helper_execute=0 direct_private_crud=0' AS status;
SELECT 'PHASE10P_LIVE_SUBJECT_UNIQUE_INDEX_PRESERVED_OK' AS status;
