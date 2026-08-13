SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE role_name text; bad boolean:=false;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'private.downstream_authorization_transactions','SELECT,INSERT,UPDATE,DELETE') THEN bad:=true; END IF;
  END LOOP;
  IF bad OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='private.downstream_authorization_transactions'::regclass) THEN RAISE EXCEPTION 'PHASE10O_O_TABLE_PERMISSION'; END IF;
  IF NOT has_function_privilege('service_role','public.create_downstream_authorization_transaction(uuid,uuid,bytea,text,text,text,text,text,text,text,text,timestamptz)','EXECUTE') OR NOT has_function_privilege('service_role','public.claim_downstream_authorization_transaction_by_handle(bytea)','EXECUTE') OR NOT has_function_privilege('service_role','public.bind_downstream_authorization_transaction_upstream_leg(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_O_SERVICE_RPC'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.create_downstream_authorization_transaction(uuid,uuid,bytea,text,text,text,text,text,text,text,text,timestamptz)','EXECUTE') OR has_function_privilege(role_name,'public.claim_downstream_authorization_transaction_by_handle(bytea)','EXECUTE') OR has_function_privilege(role_name,'public.bind_downstream_authorization_transaction_upstream_leg(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10O_O_PUBLIC_RPC'; END IF;
  END LOOP;
END $$;
SELECT 'PHASE10O_O_PERMISSIONS_OK' AS status;
