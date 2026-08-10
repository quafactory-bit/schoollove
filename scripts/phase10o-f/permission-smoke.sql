\set ON_ERROR_STOP on
DO $$
DECLARE t text; fn text; p oid;
BEGIN
  FOREACH t IN ARRAY ARRAY['private_accounts','social_identity_registry','recovery_email_verifications','auth_principal_cleanup_jobs'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname=t AND c.relrowsecurity AND c.relforcerowsecurity) THEN RAISE EXCEPTION 'RLS FORCE missing %',t; END IF;
    IF has_table_privilege('anon','private.'||t,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','private.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'private table grant leak %',t; END IF;
    IF NOT has_table_privilege('service_role','private.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'service role table access missing %',t; END IF;
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['create_provisional_social_account(text,text,bytea,integer)','bind_social_auth_principal(uuid,uuid)','create_recovery_email_verification(uuid,text,bytea,integer,bytea,bytea,integer,bytea,integer)','consume_recovery_email_verification(uuid,bytea)','activate_social_account(uuid)','revoke_social_identity_for_deletion(uuid)','enqueue_auth_principal_cleanup(uuid,uuid)'] LOOP
    p:=to_regprocedure('public.'||fn);
    IF p IS NULL OR has_function_privilege('anon',p,'EXECUTE') OR has_function_privilege('authenticated',p,'EXECUTE') OR NOT has_function_privilege('service_role',p,'EXECUTE') THEN RAISE EXCEPTION 'service RPC grant mismatch %',fn; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_roles r ON r.oid=f.proowner WHERE f.oid=p AND f.prosecdef AND r.rolname='postgres' AND f.proconfig @> ARRAY['search_path=""']) THEN RAISE EXCEPTION 'SECURITY DEFINER/search path mismatch %',fn; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.get_social_account_state_for_owner()','EXECUTE') OR NOT has_function_privilege('authenticated','public.get_social_account_state_for_owner()','EXECUTE') THEN RAISE EXCEPTION 'safe owner RPC grant mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='private' AND table_name IN ('private_accounts','recovery_email_verifications') AND column_name IN ('email','raw_email','otp','raw_otp')) THEN RAISE EXCEPTION 'raw secret column leaked'; END IF;
END $$;
SELECT 'PHASE10O_F_PERMISSIONS_OK' status;
