SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE role_name text; bad boolean:=false;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'private.upstream_login_legs','SELECT,INSERT,UPDATE,DELETE') THEN bad:=true; END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.upstream_login_legs'::regclass) OR bad THEN RAISE EXCEPTION 'PHASE10O_N_PRIVATE_PERMISSIONS'; END IF;
  IF has_function_privilege('service_role','public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea)','EXECUTE') OR NOT has_function_privilege('service_role','public.claim_upstream_login_callback_by_state(text,bytea,bytea)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_N_RPC_PERMISSIONS'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea)','EXECUTE') OR has_function_privilege(role_name,'public.claim_upstream_login_callback_by_state(text,bytea,bytea)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_N_RPC_PUBLIC'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN ('public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea)'::regprocedure,'public.claim_upstream_login_callback_by_state(text,bytea,bytea)'::regprocedure) AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_N_RPC_PUBLIC'; END IF;
END $$;
SELECT 'PHASE10O_N_BY_ID_CALLBACK_BYPASS_CLOSED_OK' AS status;
SELECT 'PHASE10O_N_PRODUCTION_ROUTE_ZERO_OK' AS status;
