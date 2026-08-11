DO $$
DECLARE signature text;
BEGIN
  IF has_table_privilege('anon','private.recovery_delivery_attempts','select,insert,update,delete')
    OR has_table_privilege('authenticated','private.recovery_delivery_attempts','select,insert,update,delete')
    OR has_table_privilege('service_role','private.recovery_delivery_attempts','select,insert,update,delete') THEN RAISE EXCEPTION 'PHASE10O_I_DIRECT_PRIVATE_TABLE'; END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)',
    'public.mark_login_attempt_recovery_delivery_sent(uuid)',
    'public.fail_login_attempt_recovery_delivery(uuid)',
    'public.consume_recovery_and_decide_social_account(uuid,uuid,bytea)'
  ] LOOP
    IF has_function_privilege('anon',signature,'execute')
      OR has_function_privilege('authenticated',signature,'execute')
      OR NOT has_function_privilege('service_role',signature,'execute') THEN RAISE EXCEPTION 'PHASE10O_I_RPC_PRIVILEGE'; END IF;
  END LOOP;
END $$;
SELECT 'PHASE10O_I_PERMISSIONS_OK' AS status;
