-- PHASE 10P: release expired broker-subject ownership before a new verified
-- upstream identity decision. Forward-only; no provider or Auth side effects.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regclass('private.recovery_email_verifications') IS NULL
    OR to_regclass('private.recovery_delivery_attempts') IS NULL
    OR to_regclass('private.oauth_login_attempts_live_subject_unique') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL
    OR to_regprocedure('private.lock_downstream_authorization_transaction_for_attempt(uuid)') IS NULL
    OR to_regprocedure('private.clear_terminal_recovery_challenge_material()') IS NULL
    OR to_regprocedure('public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)') IS NULL
  THEN
    RAISE EXCEPTION 'PHASE10P_STALE_IDENTITY_BASELINE_MISSING';
  END IF;
  IF to_regprocedure('private.expire_stale_social_identity_attempt(uuid,timestamp with time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10P_STALE_IDENTITY_OBJECT_COLLISION';
  END IF;
END $$;

-- The caller and the recovery decision path both take row locks before the
-- advisory locks. If a pending challenge exists, this helper preserves the
-- frozen recovery-lock -> broker-lock ordering. The broker lock remains held
-- until transaction end, so the replacement identity decision is serialized.
CREATE FUNCTION private.expire_stale_social_identity_attempt(
  target_attempt_id uuid,
  at_time timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  attempt private.oauth_login_attempts%ROWTYPE;
  verification private.recovery_email_verifications%ROWTYPE;
BEGIN
  IF target_attempt_id IS NULL OR at_time IS NULL THEN RETURN false; END IF;

  -- Match the downstream terminalization lock order: transaction, attempt,
  -- pending verification/delivery, recovery advisory lock, broker advisory lock.
  PERFORM private.lock_downstream_authorization_transaction_for_attempt(target_attempt_id);
  SELECT * INTO attempt
    FROM private.oauth_login_attempts
    WHERE id=target_attempt_id
    FOR UPDATE;
  IF attempt.id IS NULL
    OR attempt.state NOT IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')
    OR attempt.expires_at>at_time
    OR attempt.broker_subject IS NULL
    OR attempt.subject_digest IS NULL
    OR attempt.subject_key_version IS NULL
  THEN RETURN false; END IF;

  SELECT * INTO verification
    FROM private.recovery_email_verifications
    WHERE login_attempt_id=attempt.id AND purpose='login_decision' AND status='pending'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  IF verification.id IS NOT NULL THEN
    PERFORM 1 FROM private.recovery_delivery_attempts
      WHERE verification_id=verification.id
      FOR UPDATE;
    IF verification.recovery_email_hmac IS NULL OR verification.hmac_key_version IS NULL THEN
      RAISE EXCEPTION 'PHASE10P_STALE_RECOVERY_LOCK_MATERIAL_MISSING';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'schoollove:10o-g:recovery-decision:v1:'||verification.hmac_key_version::text||':'||encode(verification.recovery_email_hmac,'hex'),0
    ));
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'schoollove:10o-g:broker-decision:v1:'||attempt.provider||':'||attempt.subject_key_version::text||':'||encode(attempt.subject_digest,'hex'),0
  ));

  -- Revalidate under both the row locks and broker-subject lock.
  IF attempt.state NOT IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')
    OR attempt.expires_at>at_time THEN RETURN false; END IF;

  -- Reserved-but-unsent work cannot later be sent. Sent/failed delivery rows
  -- remain unchanged as durable abuse-budget and audit history.
  UPDATE private.recovery_delivery_attempts delivery
    SET state='failed',failed_at=at_time
    FROM private.recovery_email_verifications challenge
    WHERE challenge.login_attempt_id=attempt.id
      AND challenge.purpose='login_decision'
      AND challenge.status='pending'
      AND delivery.verification_id=challenge.id
      AND delivery.state='reserved';

  -- The existing trigger clears HMAC, ciphertext, nonce, OTP material, key
  -- versions, and reserved account ID on this terminal transition.
  UPDATE private.recovery_email_verifications
    SET status='expired'
    WHERE login_attempt_id=attempt.id
      AND purpose='login_decision'
      AND status='pending';

  UPDATE private.downstream_authorization_transactions
    SET status='expired',broker_handle_digest=NULL,downstream_nonce=NULL,downstream_state=NULL,
      terminal_at=at_time,version=version+1
    WHERE login_attempt_id=attempt.id
      AND status IN ('pending','claimed','upstream_bound');

  UPDATE private.oauth_login_attempts
    SET state='expired',coarse_terminal_reason='expired',updated_at=at_time,version=version+1
    WHERE id=attempt.id
      AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')
      AND expires_at<=at_time;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.record_verified_social_identity_from_upstream_leg(
  target_attempt_id uuid,target_leg_id uuid,requested_provider text,requested_broker_subject text,requested_subject_digest bytea,requested_subject_key_version integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tx private.downstream_authorization_transactions%ROWTYPE;
  attempt private.oauth_login_attempts%ROWTYPE;
  leg private.upstream_login_legs%ROWTYPE;
  existing private.social_identity_registry%ROWTYPE;
  competing uuid;
  stale_competing uuid;
  now_at timestamptz:=clock_timestamp();
  violation_constraint text;
  next_tx_status text;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE login_attempt_id=target_attempt_id FOR UPDATE;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL OR attempt.state<>'upstream_pending' OR leg.status<>'callback_claimed' THEN RETURN 'IDENTITY_REJECTED'; END IF;
  IF tx.id IS NOT NULL AND (tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM leg.id) THEN RETURN 'IDENTITY_REJECTED'; END IF;
  IF attempt.provider<>requested_provider OR leg.provider<>requested_provider OR attempt.expires_at<=now_at OR leg.expires_at<=now_at OR requested_broker_subject !~ ('^slb:v1:k[0-9]{2}:'||requested_provider||':[A-Za-z0-9_-]{43}$') OR requested_subject_key_version NOT BETWEEN 1 AND 99 OR requested_subject_digest IS NULL OR octet_length(requested_subject_digest)<>32 OR split_part(requested_broker_subject,':',3)<>'k'||lpad(requested_subject_key_version::text,2,'0') OR split_part(requested_broker_subject,':',5)<>replace(replace(replace(encode(requested_subject_digest,'base64'),'+','-'),'/','_'),'=','') THEN
    next_tx_status:=CASE WHEN attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'expired' ELSE 'rejected' END;
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,next_tx_status,now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,next_tx_status,now_at);
    UPDATE private.oauth_login_attempts SET state=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,coarse_terminal_reason=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN CASE WHEN next_tx_status='expired' THEN 'EXPIRED' ELSE 'IDENTITY_REJECTED' END;
  END IF;

  -- At most one row can occupy this partial unique index. Lock and expire that
  -- exact stale owner before the new tuple attempts to join the live set.
  SELECT id INTO stale_competing
    FROM private.oauth_login_attempts
    WHERE id<>attempt.id
      AND provider=requested_provider
      AND broker_subject=requested_broker_subject
      AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')
      AND expires_at<=now_at
    ORDER BY expires_at,id
    LIMIT 1;
  IF stale_competing IS NOT NULL THEN
    PERFORM private.expire_stale_social_identity_attempt(stale_competing,now_at);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:broker-decision:v1:'||requested_provider||':'||requested_subject_key_version::text||':'||encode(requested_subject_digest,'hex'),0));
  SELECT r.* INTO existing FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id WHERE r.broker_subject=requested_broker_subject AND r.status='active' AND a.status='active' AND a.primary_provider=requested_provider AND a.primary_broker_subject=requested_broker_subject;
  IF existing.account_id IS NOT NULL THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
    UPDATE private.oauth_login_attempts SET state='existing_primary',broker_subject=requested_broker_subject,subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,account_id=existing.account_id,updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN 'EXISTING_PRIMARY';
  END IF;
  IF EXISTS(SELECT 1 FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id WHERE r.broker_subject=requested_broker_subject AND r.status='provisional' AND a.status='provisional')
    OR EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id<>attempt.id AND provider=requested_provider AND broker_subject=requested_broker_subject AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified') AND expires_at>now_at) THEN
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,'rejected',now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN 'IDENTITY_DECISION_IN_PROGRESS';
  END IF;
  UPDATE private.oauth_login_attempts SET state='upstream_verified',broker_subject=requested_broker_subject,subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  UPDATE private.oauth_login_attempts SET state='recovery_required',updated_at=now_at,version=version+1 WHERE id=attempt.id;
  PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
  RETURN 'RECOVERY_REQUIRED';
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
  IF violation_constraint<>'oauth_login_attempts_live_subject_unique' THEN RAISE; END IF;
  SELECT id INTO competing FROM private.oauth_login_attempts
    WHERE id<>target_attempt_id
      AND provider=requested_provider
      AND broker_subject=requested_broker_subject
      AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')
      AND expires_at>now_at
    FOR KEY SHARE LIMIT 1;
  IF competing IS NULL THEN RAISE; END IF;
  IF NOT private.terminalize_bound_downstream_authorization_transaction(target_attempt_id,target_leg_id,'rejected',now_at) THEN RAISE EXCEPTION 'PHASE10O_R_TRANSACTION_BINDING_REJECTED'; END IF;
  PERFORM private.scrub_upstream_login_leg(target_leg_id,'rejected',now_at);
  UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=target_attempt_id;
  RETURN 'IDENTITY_DECISION_IN_PROGRESS';
END $$;

-- Bounded one-time cleanup: every currently expired member of the live subject
-- set is scrubbed using the same helper. No identity is guessed and no row is
-- deleted; future requests use the same on-demand path above.
DO $$
DECLARE stale_attempt_id uuid;
BEGIN
  FOR stale_attempt_id IN
    SELECT id FROM private.oauth_login_attempts
    WHERE state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')
      AND expires_at<=clock_timestamp()
    ORDER BY provider,subject_key_version,encode(subject_digest,'hex'),expires_at,id
  LOOP
    IF NOT private.expire_stale_social_identity_attempt(stale_attempt_id,clock_timestamp()) THEN
      RAISE EXCEPTION 'PHASE10P_STALE_IDENTITY_ONE_TIME_EXPIRY_FAILED';
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION private.expire_stale_social_identity_attempt(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) TO service_role;

COMMENT ON FUNCTION private.expire_stale_social_identity_attempt(uuid,timestamptz) IS 'PHASE 10P stale live-subject expiry: recovery lock before broker lock, terminal recovery/downstream scrub, delivery history retained.';
COMMENT ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) IS 'PHASE 10P verified upstream identity decision: expire a stale same-subject owner before preserving exact live uniqueness.';
COMMIT;
