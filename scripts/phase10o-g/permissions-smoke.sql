DO $$
DECLARE t record;
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)<>5 THEN RAISE EXCEPTION 'PHASE10O_G_RLS'; END IF;
  FOR t IN SELECT unnest(ARRAY['private.private_accounts','private.social_identity_registry','private.recovery_email_verifications','private.auth_principal_cleanup_jobs','private.oauth_login_attempts']) AS n LOOP
    IF has_table_privilege('anon',t.n,'select,insert,update,delete') OR has_table_privilege('authenticated',t.n,'select,insert,update,delete') OR has_table_privilege('service_role',t.n,'select,insert,update,delete') THEN RAISE EXCEPTION 'PHASE10O_G_DIRECT_TABLE'; END IF;
  END LOOP;
  IF has_schema_privilege('anon','private','usage') OR has_schema_privilege('authenticated','private','usage') OR has_schema_privilege('service_role','private','usage') OR has_function_privilege('service_role','public.create_provisional_social_account(text,text,bytea,integer)','execute') THEN RAISE EXCEPTION 'PHASE10O_G_PRIVILEGE'; END IF;
END $$;
SELECT 'PHASE10O_G_DIRECT_ACCOUNT_CREATE_RETIRED_OK' AS status;
SELECT 'PHASE10O_G_PERMISSIONS_OK' AS status;
