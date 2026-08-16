SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE f oid; public_rpcs oid[]:=ARRAY[
  'public.resolve_durable_continuation_by_digest(bytea)'::regprocedure,
  'public.create_or_resume_durable_upstream_continuation(bytea,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer,bytea,bytea,integer)'::regprocedure,
  'public.expire_abandoned_downstream_authorization_transaction(uuid)'::regprocedure
]; private_helpers oid[]:=ARRAY[
  'private.scrub_upstream_login_leg(uuid,text,timestamp with time zone)'::regprocedure,
  'private.terminalize_bound_downstream_authorization_transaction(uuid,uuid,text,timestamp with time zone)'::regprocedure
]; role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'private.downstream_authorization_transactions','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege(role_name,'private.upstream_login_legs','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'PHASE10O_S_PRIVATE_DIRECT_CRUD'; END IF;
  END LOOP;
  FOREACH f IN ARRAY public_rpcs LOOP
    IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_S_PUBLIC_RPC_GRANT'; END IF;
  END LOOP;
  FOREACH f IN ARRAY private_helpers LOOP
    IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_S_PRIVATE_HELPER_GRANT'; END IF;
  END LOOP;
END $$;
SELECT 'PHASE10O_S_PERMISSIONS_OK public_service_only=3 private_helpers_execute_denied=2 private_direct_crud=0' AS status;
