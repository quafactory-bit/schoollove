-- Part 2 P2b — read-only post-apply check. Expect every *_ok column = true.
SELECT
  EXISTS(SELECT 1 FROM pg_constraint WHERE conname='private_accounts_active_principal_recovery_atomic') AS e1_ok,
  EXISTS(SELECT 1 FROM pg_constraint WHERE conname='recovery_delivery_reserved_requires_single_owner')
    AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='recovery_delivery_reserved_requires_owner')
    AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='private' AND table_name='recovery_delivery_attempts' AND column_name='login_attempt_id' AND is_nullable='YES') AS e2_ok,
  (SELECT bool_and(has_function_privilege('service_role',f,'EXECUTE') AND NOT has_function_privilege('anon',f,'EXECUTE') AND NOT has_function_privilege('authenticated',f,'EXECUTE'))
     FROM unnest(ARRAY[
       'public.record_verified_google_identity_recovery_optional(uuid,uuid,text,text,bytea,integer)',
       'public.bind_social_auth_principal_from_attempt_recovery_optional(uuid,uuid)',
       'public.activate_social_account_from_attempt_recovery_optional(uuid)',
       'public.create_and_reserve_account_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)',
       'public.consume_account_recovery_verification(uuid,uuid,bytea)']) f) AS grants_ok,
  (SELECT count(*) FROM private.private_accounts) AS accounts_after,
  (SELECT count(*) FROM private.private_accounts WHERE status='active') AS active_after;
