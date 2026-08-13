SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE f oid; public_rpcs oid[]:=ARRAY[
  'public.fail_upstream_login_leg(uuid,uuid,text)'::regprocedure,
  'public.claim_upstream_login_callback_by_state(text,bytea,bytea)'::regprocedure,
  'public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)'::regprocedure
]; private_helpers oid[]:=ARRAY[
  'private.lock_downstream_authorization_transaction_for_attempt(uuid)'::regprocedure,
  'private.terminalize_bound_downstream_authorization_transaction(uuid,uuid,text,timestamptz)'::regprocedure
];
BEGIN
  IF has_table_privilege('service_role','private.downstream_authorization_transactions','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'PHASE10O_R_PRIVATE_TABLE_PERMISSION'; END IF;
  FOREACH f IN ARRAY public_rpcs LOOP
    IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE')
      OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_R_PUBLIC_RPC_PERMISSION'; END IF;
  END LOOP;
  FOREACH f IN ARRAY private_helpers LOOP
    IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE')
      OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_R_PRIVATE_HELPER_PERMISSION'; END IF;
  END LOOP;
END $$;
SELECT 'PHASE10O_R_PERMISSIONS_OK public_rpcs_service_role_only=3 private_helpers_execute_denied=2 private_direct_crud=0' AS status;
