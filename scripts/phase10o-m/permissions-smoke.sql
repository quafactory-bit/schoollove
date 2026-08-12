-- PHASE 10O-M permission assertions; no direct private table access is granted.
DO $$
DECLARE role_name text; bad boolean:=false;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'private.upstream_login_legs','SELECT,INSERT,UPDATE,DELETE') THEN bad:=true; END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.upstream_login_legs'::regclass) OR bad THEN RAISE EXCEPTION 'PHASE10O_M_PRIVATE_PERMISSIONS'; END IF;
  IF has_function_privilege('service_role','public.record_verified_social_identity(uuid,text,text,bytea,integer)','EXECUTE') OR NOT has_function_privilege('service_role','public.create_upstream_login_leg(uuid,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer)','EXECUTE') OR NOT has_function_privilege('service_role','public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea)','EXECUTE') OR NOT has_function_privilege('service_role','public.fail_upstream_login_leg(uuid,uuid,text)','EXECUTE') OR NOT has_function_privilege('service_role','public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_M_RPC_PERMISSIONS'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.record_verified_social_identity(uuid,text,text,bytea,integer)','EXECUTE') OR has_function_privilege(role_name,'public.create_upstream_login_leg(uuid,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer)','EXECUTE') OR has_function_privilege(role_name,'public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea)','EXECUTE') OR has_function_privilege(role_name,'public.fail_upstream_login_leg(uuid,uuid,text)','EXECUTE') OR has_function_privilege(role_name,'public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)','EXECUTE') OR has_function_privilege(role_name,'private.scrub_upstream_login_leg(uuid,text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_M_RPC_PUBLIC'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN ('public.record_verified_social_identity(uuid,text,text,bytea,integer)'::regprocedure,'public.create_upstream_login_leg(uuid,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer)'::regprocedure,'public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea)'::regprocedure,'public.fail_upstream_login_leg(uuid,uuid,text)'::regprocedure,'public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)'::regprocedure,'private.scrub_upstream_login_leg(uuid,text,timestamptz)'::regprocedure) AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_M_RPC_PUBLIC'; END IF;
END $$;
SELECT 'PHASE10O_M_LEG_BYPASS_RPC_CLOSED_OK' AS status;
SELECT 'PHASE10O_M_RPC_PERMISSION_MATRIX_OK' AS status;
