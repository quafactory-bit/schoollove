DO $$
DECLARE attempt_id uuid;
BEGIN
  SELECT id INTO attempt_id FROM private.oauth_login_attempts WHERE safe_attempt_id='att_10p_preapply_stale_01';
  IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=attempt_id AND state='expired' AND coarse_terminal_reason='expired') THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_ONE_TIME_ATTEMPT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE login_attempt_id=attempt_id AND status='expired' AND downstream_nonce IS NULL AND downstream_state IS NULL AND terminal_at IS NOT NULL) THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_ONE_TIME_TX'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE login_attempt_id=attempt_id AND status='expired' AND recovery_email_hmac IS NULL AND hmac_key_version IS NULL AND destination_ciphertext IS NULL AND destination_nonce IS NULL AND encryption_key_version IS NULL AND otp_mac IS NULL AND otp_key_version IS NULL AND reserved_account_id IS NULL) THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_ONE_TIME_RECOVERY'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.recovery_delivery_attempts WHERE login_attempt_id=attempt_id AND state='sent' AND sent_at IS NOT NULL) THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_ONE_TIME_DELIVERY_HISTORY'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE login_attempt_id=attempt_id AND status='verified') THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_ONE_TIME_LEG_HISTORY'; END IF;
END $$;

SELECT 'PHASE10P_STALE_ONE_TIME_TERMINALIZATION_OK' AS status;
