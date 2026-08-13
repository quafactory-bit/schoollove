SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'private.broker_authorization_codes','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(role_name,'private.downstream_authorization_transactions','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'PHASE10O_P_DIRECT_TABLE'; END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.broker_authorization_codes'::regclass)
    OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.downstream_authorization_transactions'::regclass) THEN RAISE EXCEPTION 'PHASE10O_P_RLS'; END IF;
  IF has_function_privilege('service_role','public.create_broker_authorization_code(uuid,uuid,bytea,text,text,text,bigint,bytea,bytea,bytea,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.get_transaction_bound_broker_code_issuance_context(uuid)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_P_SERVICE_RPC'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer)','EXECUTE')
      OR has_function_privilege(role_name,'public.get_transaction_bound_broker_code_issuance_context(uuid)','EXECUTE')
      OR has_function_privilege(role_name,'public.create_broker_authorization_code(uuid,uuid,bytea,text,text,text,bigint,bytea,bytea,bytea,integer)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_P_PUBLIC_RPC'; END IF;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid='public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer)'::regprocedure
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) OR EXISTS(
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid='public.create_broker_authorization_code(uuid,uuid,bytea,text,text,text,bigint,bytea,bytea,bytea,integer)'::regprocedure
      AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'PHASE10O_P_PUBLIC_RPC'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    WHERE p.oid='public.get_transaction_bound_broker_code_issuance_context(uuid)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'PHASE10O_P_PUBLIC_RPC'; END IF;
END $$;
SELECT 'PHASE10O_P_PERMISSIONS_AND_LEGACY_BYPASS_CLOSED_OK' AS status;
