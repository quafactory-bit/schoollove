SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
BEGIN
  IF has_table_privilege('service_role','private.downstream_authorization_transactions','SELECT,INSERT,UPDATE,DELETE')
    OR has_function_privilege('anon','public.fail_upstream_login_leg(uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.claim_upstream_login_callback_by_state(text,bytea,bytea)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.fail_upstream_login_leg(uuid,uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)','EXECUTE')
    OR has_function_privilege('service_role','private.terminalize_bound_downstream_authorization_transaction(uuid,uuid,text,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'PHASE10O_R_PERMISSION_BOUNDARY';
  END IF;
END $$;
SELECT 'PHASE10O_R_PERMISSIONS_OK private_direct_crud=0 service_rpcs=3 private_helpers=0' AS status;
