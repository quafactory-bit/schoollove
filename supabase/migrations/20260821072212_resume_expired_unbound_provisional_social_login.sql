-- PHASE 10P: resume only the exact expired, recovery-verified provisional
-- first-login orphan left when downstream OIDC client authentication failed.
-- No row is deleted and no recovery material is copied to the replacement
-- attempt. Forward-only; provider/Auth configuration remains untouched.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.private_accounts') IS NULL
    OR to_regclass('private.social_identity_registry') IS NULL
    OR to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regclass('private.broker_authorization_codes') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL
    OR to_regprocedure('private.terminalize_bound_downstream_authorization_transaction(uuid,uuid,text,timestamp with time zone)') IS NULL
    OR to_regprocedure('private.scrub_upstream_login_leg(uuid,text,timestamp with time zone)') IS NULL
    OR to_regprocedure('public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)') IS NULL
  THEN
    RAISE EXCEPTION 'PHASE10P_PROVISIONAL_RESUME_BASELINE_MISSING';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_verified_social_identity_from_upstream_leg(
  target_attempt_id uuid,target_leg_id uuid,requested_provider text,requested_broker_subject text,requested_subject_digest bytea,requested_subject_key_version integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tx private.downstream_authorization_transactions%ROWTYPE;
  attempt private.oauth_login_attempts%ROWTYPE;
  leg private.upstream_login_legs%ROWTYPE;
  active_identity private.social_identity_registry%ROWTYPE;
  orphan_identity private.social_identity_registry%ROWTYPE;
  orphan_account private.private_accounts%ROWTYPE;
  source_attempt private.oauth_login_attempts%ROWTYPE;
  source_code private.broker_authorization_codes%ROWTYPE;
  source_tx private.downstream_authorization_transactions%ROWTYPE;
  source_leg private.upstream_login_legs%ROWTYPE;
  competing uuid;
  stale_competing uuid;
  source_attempt_id uuid;
  source_attempt_count integer;
  source_code_count integer;
  account_attempt_count integer;
  matching_auth_identity_count integer;
  now_at timestamptz:=clock_timestamp();
  violation_constraint text;
  next_tx_status text;
BEGIN
  PERFORM private.require_social_attempt_service();

  -- Canonical current-flow row order is unchanged: transaction, attempt, leg,
  -- then the broker-subject advisory domain. Orphan adoption subsequently
  -- locks identity, account, source code, and source attempt. The code-before-
  -- attempt order matches consume_broker_authorization_code and avoids an
  -- inverse lock with a concurrent downstream token request.
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE login_attempt_id=target_attempt_id FOR UPDATE;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL OR attempt.state<>'upstream_pending' OR leg.status<>'callback_claimed' THEN RETURN 'IDENTITY_REJECTED'; END IF;
  IF tx.id IS NOT NULL AND (tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM leg.id) THEN RETURN 'IDENTITY_REJECTED'; END IF;
  IF attempt.provider<>requested_provider OR leg.provider<>requested_provider OR attempt.expires_at<=now_at OR leg.expires_at<=now_at
    OR requested_broker_subject !~ ('^slb:v1:k[0-9]{2}:'||requested_provider||':[A-Za-z0-9_-]{43}$')
    OR requested_subject_key_version NOT BETWEEN 1 AND 99 OR requested_subject_digest IS NULL OR octet_length(requested_subject_digest)<>32
    OR split_part(requested_broker_subject,':',3)<>'k'||lpad(requested_subject_key_version::text,2,'0')
    OR split_part(requested_broker_subject,':',5)<>replace(replace(replace(encode(requested_subject_digest,'base64'),'+','-'),'/','_'),'=','')
  THEN
    next_tx_status:=CASE WHEN attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'expired' ELSE 'rejected' END;
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,next_tx_status,now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,next_tx_status,now_at);
    UPDATE private.oauth_login_attempts SET state=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,
      coarse_terminal_reason=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN CASE WHEN next_tx_status='expired' THEN 'EXPIRED' ELSE 'IDENTITY_REJECTED' END;
  END IF;

  -- Preserve the stale pre-recovery release path before entering the canonical
  -- broker-subject authority. Post-recovery broker_code_ready is deliberately
  -- not handled by that older helper.
  SELECT id INTO stale_competing FROM private.oauth_login_attempts
    WHERE id<>attempt.id AND provider=requested_provider AND broker_subject=requested_broker_subject
      AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified') AND expires_at<=now_at
    ORDER BY expires_at,id LIMIT 1;
  IF stale_competing IS NOT NULL THEN PERFORM private.expire_stale_social_identity_attempt(stale_competing,now_at); END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'schoollove:10o-g:broker-decision:v1:'||requested_provider||':'||requested_subject_key_version::text||':'||encode(requested_subject_digest,'hex'),0
  ));

  SELECT r.* INTO active_identity
    FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id
    WHERE r.broker_subject=requested_broker_subject AND r.status='active' AND a.status='active'
      AND a.primary_provider=requested_provider AND a.primary_broker_subject=requested_broker_subject;
  IF active_identity.account_id IS NOT NULL THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
    UPDATE private.oauth_login_attempts SET state='existing_primary',broker_subject=requested_broker_subject,
      subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,
      account_id=active_identity.account_id,updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN 'EXISTING_PRIMARY';
  END IF;

  -- The only resumable identity is the exact unbound provisional tuple.
  SELECT * INTO orphan_identity FROM private.social_identity_registry
    WHERE broker_subject=requested_broker_subject FOR UPDATE;
  IF orphan_identity.broker_subject IS NOT NULL THEN
    SELECT * INTO orphan_account FROM private.private_accounts WHERE id=orphan_identity.account_id FOR UPDATE;

    SELECT count(*) INTO source_attempt_count FROM private.oauth_login_attempts a
      WHERE a.id<>attempt.id AND a.account_id=orphan_account.id AND a.provider=requested_provider
        AND a.broker_subject=requested_broker_subject AND a.subject_digest=requested_subject_digest
        AND a.subject_key_version=requested_subject_key_version AND a.state='broker_code_ready' AND a.expires_at<=now_at;
    SELECT a.id INTO source_attempt_id FROM private.oauth_login_attempts a
      WHERE a.id<>attempt.id AND a.account_id=orphan_account.id AND a.provider=requested_provider
        AND a.broker_subject=requested_broker_subject AND a.subject_digest=requested_subject_digest
        AND a.subject_key_version=requested_subject_key_version AND a.state='broker_code_ready' AND a.expires_at<=now_at
      ORDER BY a.expires_at,a.id LIMIT 1;
    SELECT count(*) INTO account_attempt_count FROM private.oauth_login_attempts a
      WHERE a.id<>attempt.id AND a.account_id=orphan_account.id;
    SELECT count(*) INTO matching_auth_identity_count FROM auth.identities i
      WHERE i.provider='custom:schoollove-'||requested_provider
        AND (i.provider_id=requested_broker_subject OR i.identity_data->>'sub'=requested_broker_subject);

    IF orphan_identity.provider=requested_provider AND orphan_identity.status='provisional' AND orphan_identity.auth_user_id IS NULL
      AND orphan_identity.subject_digest=requested_subject_digest AND orphan_identity.subject_key_version=requested_subject_key_version
      AND orphan_account.id IS NOT NULL AND orphan_account.status='provisional' AND orphan_account.auth_user_id IS NULL
      AND orphan_account.primary_provider=requested_provider AND orphan_account.primary_broker_subject=requested_broker_subject
      AND orphan_account.recovery_email_verified_at IS NOT NULL AND orphan_account.recovery_email_hmac IS NOT NULL
      AND orphan_account.recovery_email_ciphertext IS NOT NULL AND orphan_account.recovery_email_nonce IS NOT NULL
      AND source_attempt_count=1 AND account_attempt_count=1 AND matching_auth_identity_count=0
    THEN
      -- Token consumption locks code before attempt; adoption uses the same
      -- order, then revalidates every source relationship while both are held.
      SELECT count(*) INTO source_code_count FROM private.broker_authorization_codes c WHERE c.login_attempt_id=source_attempt_id;
      IF source_code_count=1 THEN
        SELECT * INTO source_code FROM private.broker_authorization_codes c WHERE c.login_attempt_id=source_attempt_id FOR UPDATE;
        SELECT * INTO source_attempt FROM private.oauth_login_attempts a WHERE a.id=source_attempt_id FOR UPDATE;
        SELECT * INTO source_tx FROM private.downstream_authorization_transactions t WHERE t.login_attempt_id=source_attempt_id FOR KEY SHARE;
        SELECT * INTO source_leg FROM private.upstream_login_legs l WHERE l.login_attempt_id=source_attempt_id FOR KEY SHARE;
      END IF;

      IF source_code_count=1 AND source_attempt.id=source_attempt_id AND source_attempt.state='broker_code_ready'
        AND source_attempt.expires_at<=now_at AND source_attempt.account_id=orphan_account.id
        AND source_attempt.provider=requested_provider AND source_attempt.broker_subject=requested_broker_subject
        AND source_attempt.subject_digest=requested_subject_digest AND source_attempt.subject_key_version=requested_subject_key_version
        AND source_code.login_attempt_id=source_attempt.id AND source_code.authorization_transaction_id=source_tx.id
        AND source_code.state IN ('ready','expired') AND source_code.expires_at<=now_at
        AND source_tx.login_attempt_id=source_attempt.id AND source_tx.status='consumed'
        AND source_tx.upstream_login_leg_id=source_leg.id AND source_leg.login_attempt_id=source_attempt.id
        AND source_leg.provider=requested_provider AND source_leg.status='verified'
      THEN
        UPDATE private.broker_authorization_codes SET state='expired',rejected_at=now_at
          WHERE id=source_code.id AND state='ready' AND expires_at<=now_at;
        UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1
          WHERE id=source_attempt.id AND state='broker_code_ready' AND expires_at<=now_at;
        IF NOT FOUND THEN RAISE EXCEPTION 'PHASE10P_PROVISIONAL_RESUME_SOURCE_CHANGED'; END IF;

        PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
        UPDATE private.oauth_login_attempts SET state='account_decided',broker_subject=requested_broker_subject,
          subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,
          account_id=orphan_account.id,updated_at=now_at,version=version+1 WHERE id=attempt.id AND state='upstream_pending';
        IF NOT FOUND THEN RAISE EXCEPTION 'PHASE10P_PROVISIONAL_RESUME_TARGET_CHANGED'; END IF;
        RETURN 'PROVISIONAL_RESUME_READY';
      END IF;
    END IF;

    -- Any provisional, bound, mismatched, live, or structurally ambiguous
    -- identity remains fail-closed and cannot consume the recovery decision.
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,'rejected',now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN 'IDENTITY_DECISION_IN_PROGRESS';
  END IF;

  IF EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id<>attempt.id AND provider=requested_provider
      AND broker_subject=requested_broker_subject AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified') AND expires_at>now_at)
  THEN
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,'rejected',now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN 'IDENTITY_DECISION_IN_PROGRESS';
  END IF;

  UPDATE private.oauth_login_attempts SET state='upstream_verified',broker_subject=requested_broker_subject,
    subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  UPDATE private.oauth_login_attempts SET state='recovery_required',updated_at=now_at,version=version+1 WHERE id=attempt.id;
  PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
  RETURN 'RECOVERY_REQUIRED';
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
  IF violation_constraint<>'oauth_login_attempts_live_subject_unique' THEN RAISE; END IF;
  SELECT id INTO competing FROM private.oauth_login_attempts
    WHERE id<>target_attempt_id AND provider=requested_provider AND broker_subject=requested_broker_subject
      AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified') AND expires_at>now_at
    FOR KEY SHARE LIMIT 1;
  IF competing IS NULL THEN RAISE; END IF;
  IF NOT private.terminalize_bound_downstream_authorization_transaction(target_attempt_id,target_leg_id,'rejected',now_at) THEN RAISE EXCEPTION 'PHASE10O_R_TRANSACTION_BINDING_REJECTED'; END IF;
  PERFORM private.scrub_upstream_login_leg(target_leg_id,'rejected',now_at);
  UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=target_attempt_id;
  RETURN 'IDENTITY_DECISION_IN_PROGRESS';
END $$;

REVOKE ALL ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) TO service_role;

COMMENT ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) IS
  'PHASE 10P exact expired unbound provisional resume: transaction/attempt/leg, broker advisory, identity/account, source code/attempt; no delete or second recovery.';
COMMIT;
