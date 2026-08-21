BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)') IS NULL
    OR to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.recovery_email_verifications') IS NULL
    OR to_regclass('private.recovery_delivery_attempts') IS NULL
  THEN
    RAISE EXCEPTION 'PHASE10P_RECOVERY_IDEMPOTENCY_BASELINE_MISSING';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(
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
  existing_verification_id uuid;
  existing_delivery_id uuid;
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

  -- Serialize both replay recognition and the rolling address budget on the
  -- exact recovery-HMAC lock domain.
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-i:recovery-delivery:v1:'||requested_hmac_key_version::text||':'||encode(requested_hmac,'hex'),0));

  -- A browser replay after successful transport is idempotent only for the
  -- same live attempt and the same canonical recovery address/key version.
  -- The existing pending verification and its sent ledger row are returned
  -- without mutating either row or consuming another rate-limit slot.
  SELECT v.id,d.id INTO existing_verification_id,existing_delivery_id
    FROM private.recovery_email_verifications v
    JOIN private.recovery_delivery_attempts d
      ON d.verification_id=v.id
     AND d.login_attempt_id=v.login_attempt_id
     AND d.recovery_email_hmac=v.recovery_email_hmac
     AND d.hmac_key_version=v.hmac_key_version
    WHERE v.login_attempt_id=target_attempt_id
      AND v.purpose='login_decision'
      AND v.status='pending'
      AND v.expires_at>issued_at
      AND v.recovery_email_hmac=requested_hmac
      AND v.hmac_key_version=requested_hmac_key_version
      AND d.state='sent'
    ORDER BY v.created_at DESC,d.reserved_at DESC
    LIMIT 1;
  IF existing_verification_id IS NOT NULL AND existing_delivery_id IS NOT NULL THEN
    RETURN QUERY SELECT 'RECOVERY_DELIVERY_ALREADY_SENT'::text,existing_verification_id,existing_delivery_id;
    RETURN;
  END IF;

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
  -- A superseded unsent reservation can never later become sent. Retain sent
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

REVOKE ALL ON FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) TO service_role;

COMMENT ON FUNCTION public.create_and_reserve_login_attempt_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)
  IS 'Atomically replays the same live sent recovery delivery without mutation, otherwise preserves the frozen delivery reservation budgets.';

COMMIT;
