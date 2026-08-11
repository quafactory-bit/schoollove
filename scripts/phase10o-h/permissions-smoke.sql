DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT unnest(ARRAY['private.private_accounts','private.social_identity_registry','private.recovery_email_verifications','private.auth_principal_cleanup_jobs','private.oauth_login_attempts']) AS n LOOP
    IF has_table_privilege('anon',t.n,'select,insert,update,delete') OR has_table_privilege('authenticated',t.n,'select,insert,update,delete') OR has_table_privilege('service_role',t.n,'select,insert,update,delete') THEN RAISE EXCEPTION 'PHASE10O_H_DIRECT_PRIVATE_TABLE'; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.create_login_attempt_recovery_verification(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)','execute')
    OR has_function_privilege('authenticated','public.create_login_attempt_recovery_verification(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)','execute')
    OR NOT has_function_privilege('service_role','public.create_login_attempt_recovery_verification(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)','execute')
    OR has_function_privilege('service_role','public.create_login_attempt_recovery_verification(uuid,bytea,integer,bytea,bytea,integer,bytea,integer)','execute') THEN RAISE EXCEPTION 'PHASE10O_H_RPC_PRIVILEGE'; END IF;
END $$;
SELECT 'PHASE10O_H_PERMISSIONS_OK' AS status;
