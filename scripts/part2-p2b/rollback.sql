-- Part 2 P2b rollback (operator-run, only after the app is reverted to the legacy RPCs).
-- Nothing is dropped and no row is changed. Recovery-less ACTIVE accounts keep
-- logging in through the legacy EXISTING_PRIMARY path (it never reads recovery
-- columns). E1/E2 constraints intentionally stay: re-adding the old "active
-- requires recovery" CHECK would block every update of those active rows,
-- including the withdrawal preparation. See the decision doc section 7.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.record_verified_google_identity_recovery_optional(uuid,uuid,text,text,bytea,integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.bind_social_auth_principal_from_attempt_recovery_optional(uuid,uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.activate_social_account_from_attempt_recovery_optional(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.create_and_reserve_account_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.consume_account_recovery_verification(uuid,uuid,bytea) FROM service_role;
-- Report only (no mutation): provisional recovery-less accounts that cannot finish under the legacy flow.
SELECT count(*) AS provisional_recovery_less_accounts
  FROM private.private_accounts
  WHERE status='provisional' AND recovery_email_hmac IS NULL AND recovery_email_verified_at IS NULL;
COMMIT;
