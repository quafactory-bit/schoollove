-- PHASE 10O-I: atomic recovery-delivery reservation and sent-gated consume.
-- Forward-only. This migration stores no raw destination, OTP, provider response,
-- or message body, and exposes no public route.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.recovery_email_verifications') IS NULL
    OR to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regprocedure('public.create_login_attempt_recovery_verification(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)') IS NULL
    OR to_regprocedure('public.consume_recovery_and_decide_social_account(uuid,uuid,bytea)') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_I_BASELINE_MISSING';
  END IF;
  IF to_regclass('private.recovery_delivery_attempts') IS NOT NULL
    OR to_regprocedure('public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.mark_login_attempt_recovery_delivery_sent(uuid)') IS NOT NULL
    OR to_regprocedure('public.fail_login_attempt_recovery_delivery(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10O_I_OBJECT_COLLISION';
  END IF;
END $$;

CREATE TABLE private.recovery_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL UNIQUE REFERENCES private.recovery_email_verifications(id) ON DELETE CASCADE,
  login_attempt_id uuid NOT NULL REFERENCES private.oauth_login_attempts(id) ON DELETE CASCADE,
  recovery_email_hmac bytea NOT NULL CHECK (octet_length(recovery_email_hmac)=32),
  hmac_key_version smallint NOT NULL CHECK (hmac_key_version BETWEEN 1 AND 32767),
  state text NOT NULL CHECK (state IN ('reserved','sent','failed')),
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sent_at timestamptz NULL,
  failed_at timestamptz NULL,
  CHECK ((state='reserved') = (sent_at IS NULL AND failed_at IS NULL)),
  CHECK ((state='sent') = (sent_at IS NOT NULL AND failed_at IS NULL)),
  CHECK ((state='failed') = (sent_at IS NULL AND failed_at IS NOT NULL))
);
ALTER TABLE private.recovery_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.recovery_delivery_attempts FORCE ROW LEVEL SECURITY;
CREATE INDEX recovery_delivery_attempts_attempt_reserved_idx ON private.recovery_delivery_attempts(login_attempt_id,reserved_at DESC);
CREATE INDEX recovery_delivery_attempts_hmac_window_idx ON private.recovery_delivery_attempts(recovery_email_hmac,hmac_key_version,reserved_at DESC);

-- The pre-10O-I standalone create RPC is deliberately retired. Only the
-- transaction below is allowed to replace a pending login_decision challenge.
REVOKE ALL ON FUNCTION public.create_login_attempt_recovery_verification(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(
  target_attempt_id uuid,
  requested_verification_id uuid,
  requested_reserved_account_id uuid,
  requested_hmac bytea,
  requested_hmac_key_version integer,
  requested_ciphertext bytea,
  requested_nonce bytea,
  requested_encryption_key_version integer,
  requested_otp_mac bytea,
  requested_otp_key_version integer
) RETURNS TABLE(outcome text,verification_id uuid,delivery_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  attempt private.oauth_login_attempts%ROWTYPE;
  issued_at timestamptz:=clock_timestamp();
  latest_reserved_at timestamptz;
  attempt_reservation_count integer;
  email_reservation_count integer;
  inserted_delivery_id uuid;
  violation_constraint text;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  IF requested_verification_id IS NULL OR requested_reserved_account_id IS NULL
    OR requested_hmac IS NULL OR requested_hmac_key_version IS NULL
    OR requested_ciphertext IS NULL OR requested_nonce IS NULL OR requested_encryption_key_version IS NULL
    OR requested_otp_mac IS NULL OR requested_otp_key_version IS NULL
    OR attempt.id IS NULL OR attempt.state NOT IN ('upstream_verified','recovery_required','recovery_pending')
    OR attempt.account_id IS NOT NULL OR attempt.expires_at<=issued_at OR attempt.recovery_failed_attempts>=5
    OR octet_length(requested_hmac)<>32 OR octet_length(requested_ciphertext)<=16 OR octet_length(requested_nonce)<>12 OR octet_length(requested_otp_mac)<>32
    OR requested_hmac_key_version NOT BETWEEN 1 AND 32767 OR requested_encryption_key_version NOT BETWEEN 1 AND 32767 OR requested_otp_key_version NOT BETWEEN 1 AND 32767
  THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_RECOVERY_CREATE_REJECTED'; END IF;
  -- Serialize the rolling address budget across otherwise independent attempts.
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-i:recovery-delivery:v1:'||requested_hmac_key_version::text||':'||encode(requested_hmac,'hex'),0));
  SELECT max(reserved_at) INTO latest_reserved_at FROM private.recovery_delivery_attempts WHERE login_attempt_id=target_attempt_id;
  SELECT count(*) INTO attempt_reservation_count FROM private.recovery_delivery_attempts WHERE login_attempt_id=target_attempt_id;
  SELECT count(*) INTO email_reservation_count FROM private.recovery_delivery_attempts
    WHERE recovery_email_hmac=requested_hmac AND hmac_key_version=requested_hmac_key_version AND reserved_at>issued_at-interval '24 hours';
  -- No state changes precede these frozen-budget checks.
  IF (latest_reserved_at IS NOT NULL AND latest_reserved_at>issued_at-interval '60 seconds')
    OR attempt_reservation_count>=3 OR email_reservation_count>=5 THEN
    RETURN QUERY SELECT 'RECOVERY_DELIVERY_LIMITED'::text,NULL::uuid,NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM private.recovery_email_verifications WHERE id=requested_verification_id)
    OR EXISTS (SELECT 1 FROM private.private_accounts WHERE id=requested_reserved_account_id)
    OR EXISTS (SELECT 1 FROM private.recovery_email_verifications WHERE reserved_account_id=requested_reserved_account_id AND status='pending') THEN
    RAISE EXCEPTION 'SOCIAL_ATTEMPT_RECOVERY_ID_RESERVATION_REJECTED';
  END IF;
  -- A superseded unsent reservation can never later become sent.  Retain sent
  -- and already-failed ledger history for the abuse budget and audit boundary.
  UPDATE private.recovery_delivery_attempts d SET state='failed',failed_at=issued_at
    FROM private.recovery_email_verifications v
    WHERE d.verification_id=v.id AND v.login_attempt_id=target_attempt_id
      AND v.purpose='login_decision' AND v.status='pending' AND d.state='reserved';
  UPDATE private.recovery_email_verifications SET status='revoked',revoked_at=issued_at
    WHERE login_attempt_id=target_attempt_id AND purpose='login_decision' AND status='pending';
  BEGIN
    INSERT INTO private.recovery_email_verifications(
      id,login_attempt_id,purpose,reserved_account_id,recovery_email_hmac,hmac_key_version,destination_ciphertext,destination_nonce,encryption_key_version,otp_mac,otp_key_version,created_at,expires_at
    ) VALUES(
      requested_verification_id,target_attempt_id,'login_decision',requested_reserved_account_id,requested_hmac,requested_hmac_key_version,requested_ciphertext,requested_nonce,requested_encryption_key_version,requested_otp_mac,requested_otp_key_version,issued_at,LEAST(attempt.expires_at,issued_at+interval '10 minutes')
    );
    INSERT INTO private.recovery_delivery_attempts(verification_id,login_attempt_id,recovery_email_hmac,hmac_key_version,state,reserved_at)
      VALUES(requested_verification_id,target_attempt_id,requested_hmac,requested_hmac_key_version,'reserved',issued_at) RETURNING id INTO inserted_delivery_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
    IF violation_constraint IN ('recovery_email_verifications_pkey','recovery_email_verifications_pending_reserved_account_unique','recovery_delivery_attempts_verification_id_key') THEN
      RAISE EXCEPTION 'SOCIAL_ATTEMPT_RECOVERY_ID_RESERVATION_REJECTED';
    END IF;
    RAISE;
  END;
  UPDATE private.oauth_login_attempts SET state='recovery_pending',updated_at=issued_at,version=version+1 WHERE id=target_attempt_id;
  RETURN QUERY SELECT 'RECOVERY_DELIVERY_RESERVED'::text,requested_verification_id,inserted_delivery_id;
END $$;

CREATE FUNCTION public.mark_login_attempt_recovery_delivery_sent(target_delivery_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE delivery private.recovery_delivery_attempts%ROWTYPE; verification private.recovery_email_verifications%ROWTYPE;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO delivery FROM private.recovery_delivery_attempts WHERE id=target_delivery_id FOR UPDATE;
  SELECT * INTO verification FROM private.recovery_email_verifications WHERE id=delivery.verification_id FOR UPDATE;
  IF delivery.id IS NULL OR verification.id IS NULL OR verification.status<>'pending' OR verification.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'RECOVERY_DELIVERY_CONFIRMATION_REJECTED'; END IF;
  IF delivery.state='sent' THEN RETURN 'RECOVERY_DELIVERY_SENT'; END IF;
  IF delivery.state<>'reserved' THEN RAISE EXCEPTION 'RECOVERY_DELIVERY_CONFIRMATION_REJECTED'; END IF;
  UPDATE private.recovery_delivery_attempts SET state='sent',sent_at=clock_timestamp() WHERE id=delivery.id;
  RETURN 'RECOVERY_DELIVERY_SENT';
END $$;

CREATE FUNCTION public.fail_login_attempt_recovery_delivery(target_delivery_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE delivery private.recovery_delivery_attempts%ROWTYPE; verification private.recovery_email_verifications%ROWTYPE;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO delivery FROM private.recovery_delivery_attempts WHERE id=target_delivery_id FOR UPDATE;
  SELECT * INTO verification FROM private.recovery_email_verifications WHERE id=delivery.verification_id FOR UPDATE;
  IF delivery.id IS NULL OR verification.id IS NULL OR delivery.state<>'reserved' OR verification.status<>'pending' THEN RAISE EXCEPTION 'RECOVERY_DELIVERY_FAILURE_REJECTED'; END IF;
  UPDATE private.recovery_delivery_attempts SET state='failed',failed_at=clock_timestamp() WHERE id=delivery.id;
  UPDATE private.recovery_email_verifications SET status='revoked',revoked_at=clock_timestamp() WHERE id=verification.id;
  RETURN 'RECOVERY_DELIVERY_FAILED';
END $$;

-- Replace the H consume function only to add the exact sent-delivery gate.
CREATE OR REPLACE FUNCTION public.consume_recovery_and_decide_social_account(target_attempt_id uuid,target_verification_id uuid,submitted_otp_mac bytea)
RETURNS TABLE(outcome text,primary_provider text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; verification private.recovery_email_verifications%ROWTYPE; delivery private.recovery_delivery_attempts%ROWTYPE; matched private.private_accounts%ROWTYPE; identity private.social_identity_registry%ROWTYPE; new_account_id uuid;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF submitted_otp_mac IS NULL OR octet_length(submitted_otp_mac)<>32 THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_OTP_INVALID'; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO verification FROM private.recovery_email_verifications WHERE id=target_verification_id FOR UPDATE;
  SELECT * INTO delivery FROM private.recovery_delivery_attempts WHERE verification_id=target_verification_id FOR UPDATE;
  IF attempt.id IS NULL OR verification.id IS NULL OR delivery.id IS NULL OR verification.login_attempt_id<>attempt.id OR attempt.state NOT IN ('recovery_pending','recovery_required') OR verification.status<>'pending' OR verification.reserved_account_id IS NULL OR verification.otp_mac IS NULL OR delivery.state<>'sent' THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_DECISION_REJECTED'; END IF;
  IF attempt.expires_at<=clock_timestamp() OR verification.expires_at<=clock_timestamp() THEN UPDATE private.recovery_email_verifications SET status='expired' WHERE id=verification.id; UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'EXPIRED'::text,NULL::text; RETURN; END IF;
  IF verification.otp_mac<>submitted_otp_mac THEN
    UPDATE private.oauth_login_attempts SET recovery_failed_attempts=recovery_failed_attempts+1,updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id RETURNING recovery_failed_attempts INTO attempt.recovery_failed_attempts;
    UPDATE private.recovery_email_verifications SET failed_attempts=failed_attempts+1,status=CASE WHEN attempt.recovery_failed_attempts>=5 THEN 'locked' ELSE 'pending' END WHERE id=verification.id;
    RETURN QUERY SELECT CASE WHEN attempt.recovery_failed_attempts>=5 THEN 'LOCKED' ELSE 'OTP_REJECTED' END,NULL::text; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:recovery-decision:v1:'||verification.hmac_key_version::text||':'||encode(verification.recovery_email_hmac,'hex'),0));
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:broker-decision:v1:'||attempt.provider||':'||attempt.subject_key_version::text||':'||encode(attempt.subject_digest,'hex'),0));
  SELECT * INTO identity FROM private.social_identity_registry WHERE broker_subject=attempt.broker_subject FOR UPDATE;
  IF identity.broker_subject IS NOT NULL THEN
    SELECT * INTO matched FROM private.private_accounts WHERE id=identity.account_id FOR UPDATE;
    UPDATE private.recovery_email_verifications SET status='consumed',consumed_at=clock_timestamp() WHERE id=verification.id;
    IF identity.status='active' AND matched.status='active' AND matched.primary_provider=attempt.provider AND matched.primary_broker_subject=attempt.broker_subject THEN UPDATE private.oauth_login_attempts SET state='existing_primary',account_id=matched.id,updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'EXISTING_PRIMARY'::text,matched.primary_provider; RETURN;
    ELSIF identity.status='provisional' AND matched.status='provisional' THEN UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'IDENTITY_DECISION_IN_PROGRESS'::text,NULL::text; RETURN;
    ELSE UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'ACCOUNT_UNAVAILABLE'::text,NULL::text; RETURN; END IF;
  END IF;
  SELECT * INTO matched FROM private.private_accounts WHERE recovery_email_hmac=verification.recovery_email_hmac AND recovery_email_hmac_key_version=verification.hmac_key_version AND recovery_email_verified_at IS NOT NULL AND status IN ('provisional','active','deletion_pending','cleanup_failed_safe') FOR UPDATE;
  UPDATE private.recovery_email_verifications SET status='consumed',consumed_at=clock_timestamp() WHERE id=verification.id;
  IF matched.id IS NOT NULL THEN
    IF matched.status='active' THEN UPDATE private.oauth_login_attempts SET state='existing_account_match',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'USE_PRIMARY_PROVIDER'::text,matched.primary_provider; RETURN;
    ELSIF matched.status='provisional' THEN UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'ACCOUNT_DECISION_IN_PROGRESS'::text,NULL::text; RETURN;
    ELSE UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'ACCOUNT_UNAVAILABLE'::text,NULL::text; RETURN; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM private.private_accounts WHERE id=verification.reserved_account_id) THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_RESERVED_ACCOUNT_COLLISION'; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  INSERT INTO private.private_accounts(id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at)
  VALUES(verification.reserved_account_id,'provisional',attempt.provider,attempt.broker_subject,verification.recovery_email_hmac,verification.hmac_key_version,verification.destination_ciphertext,verification.destination_nonce,verification.encryption_key_version,clock_timestamp()) RETURNING id INTO new_account_id;
  IF new_account_id IS DISTINCT FROM verification.reserved_account_id THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_RESERVED_ACCOUNT_MISMATCH'; END IF;
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,status) VALUES(attempt.broker_subject,attempt.provider,attempt.subject_digest,attempt.subject_key_version,new_account_id,'provisional');
  UPDATE private.oauth_login_attempts SET state='account_decided',account_id=new_account_id,updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT 'ACCOUNT_DECIDED'::text,attempt.provider;
END $$;

REVOKE ALL ON TABLE private.recovery_delivery_attempts FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mark_login_attempt_recovery_delivery_sent(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fail_login_attempt_recovery_delivery(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.consume_recovery_and_decide_social_account(uuid,uuid,bytea) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_login_attempt_recovery_delivery_sent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_login_attempt_recovery_delivery(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_recovery_and_decide_social_account(uuid,uuid,bytea) TO service_role;
COMMENT ON TABLE private.recovery_delivery_attempts IS 'PHASE 10O-I delivery reservation ledger. HMAC/version remains only for frozen 24-hour abuse budget; raw email and OTP are never stored.';
COMMIT;
