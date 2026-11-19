-- Part 2 P2b — read-only pre-apply check (run in SQL Editor before the migration).
-- Expect: e1_target=1, e2_target=1, collisions=0. Anything else: stop, do not apply.
SELECT
  (SELECT count(*) FROM pg_constraint c WHERE c.conrelid='private.private_accounts'::regclass AND c.contype='c'
     AND pg_get_constraintdef(c.oid) LIKE '%status <> ''active''::text%'
     AND pg_get_constraintdef(c.oid) LIKE '%recovery_email_verified_at IS NOT NULL%'
     AND pg_get_constraintdef(c.oid) LIKE '%activated_at IS NOT NULL%') AS e1_target,
  (SELECT count(*) FROM pg_constraint WHERE conrelid='private.recovery_delivery_attempts'::regclass
     AND conname='recovery_delivery_reserved_requires_owner') AS e2_target,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname IN ('public','private') AND p.proname IN (
       'record_verified_google_identity_recovery_optional','bind_social_auth_principal_from_attempt_recovery_optional',
       'activate_social_account_from_attempt_recovery_optional','create_and_reserve_account_recovery_delivery',
       'consume_account_recovery_verification','p2b_recovery_absent','p2b_recovery_complete'))
   + (SELECT count(*) FROM information_schema.columns WHERE table_schema='private' AND table_name='recovery_delivery_attempts' AND column_name='account_id') AS collisions,
  (SELECT count(*) FROM private.private_accounts) AS accounts_before,
  (SELECT count(*) FROM private.private_accounts WHERE status='active') AS active_before;
