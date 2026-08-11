DO $$
DECLARE signature text:='public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)';
BEGIN
  IF has_table_privilege('anon','private.recovery_delivery_attempts','select,insert,update,delete')
    OR has_table_privilege('authenticated','private.recovery_delivery_attempts','select,insert,update,delete')
    OR has_table_privilege('service_role','private.recovery_delivery_attempts','select,insert,update,delete') THEN RAISE EXCEPTION 'PHASE10O_I_DIRECT_PRIVATE_TABLE'; END IF;
  IF has_function_privilege('anon',signature,'execute') OR has_function_privilege('authenticated',signature,'execute') OR NOT has_function_privilege('service_role',signature,'execute')
    OR has_function_privilege('anon','public.mark_login_attempt_recovery_delivery_sent(uuid)','execute') OR has_function_privilege('authenticated','public.fail_login_attempt_recovery_delivery(uuid)','execute') THEN RAISE EXCEPTION 'PHASE10O_I_RPC_PRIVILEGE'; END IF;
END $$;
SELECT 'PHASE10O_I_PERMISSIONS_OK' AS status;
