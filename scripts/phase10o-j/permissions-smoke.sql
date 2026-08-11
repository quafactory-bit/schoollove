DO $$
DECLARE signature text; target text:='private.broker_authorization_codes';
BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid=target::regclass) THEN
    RAISE EXCEPTION 'PHASE10O_J_RLS_FORCE_MISSING';
  END IF;
  IF has_table_privilege('anon',target,'select,insert,update,delete')
    OR has_table_privilege('authenticated',target,'select,insert,update,delete')
    OR has_table_privilege('service_role',target,'select,insert,update,delete') THEN
    RAISE EXCEPTION 'PHASE10O_J_DIRECT_PRIVATE_TABLE';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.create_broker_authorization_code(uuid,uuid,bytea,text,text,text,bigint,bytea,bytea,bytea,integer)',
    'public.consume_broker_authorization_code(bytea,text,text,text)'
  ] LOOP
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl WHERE p.oid=signature::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
      OR has_function_privilege('anon',signature,'execute')
      OR has_function_privilege('authenticated',signature,'execute')
      OR NOT has_function_privilege('service_role',signature,'execute') THEN
      RAISE EXCEPTION 'PHASE10O_J_RPC_PRIVILEGE';
    END IF;
  END LOOP;
END $$;
SELECT 'PHASE10O_J_PERMISSIONS_OK' AS status;
