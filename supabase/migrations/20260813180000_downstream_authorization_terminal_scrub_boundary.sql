-- PHASE 10O-R: atomically scrub raw downstream context whenever its transaction becomes terminal. Feature-off.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regprocedure('public.fail_upstream_login_leg(uuid,uuid,text)') IS NULL
    OR to_regprocedure('public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)') IS NULL
    OR to_regprocedure('public.claim_upstream_login_callback_by_state(text,bytea,bytea)') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_R_BASELINE_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM private.downstream_authorization_transactions
    WHERE status IN ('expired','rejected','consumed') AND (downstream_nonce IS NOT NULL OR downstream_state IS NOT NULL)) THEN
    RAISE EXCEPTION 'PHASE10O_R_TERMINAL_RAW_CONTEXT_PRESENT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='downstream_authorization_transactions_terminal_context_scrub') THEN
    RAISE EXCEPTION 'PHASE10O_R_OBJECT_COLLISION';
  END IF;
END $$;

ALTER TABLE private.downstream_authorization_transactions
  ADD CONSTRAINT downstream_authorization_transactions_terminal_context_scrub CHECK (
    status NOT IN ('expired','rejected','consumed') OR (downstream_nonce IS NULL AND downstream_state IS NULL)
  );

-- The helper takes the transaction lock before callers lock attempt then leg.
-- It has no grants and is usable only by the service SECURITY DEFINER RPCs below.
CREATE FUNCTION private.lock_downstream_authorization_transaction_for_attempt(target_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM private.downstream_authorization_transactions WHERE login_attempt_id=target_attempt_id FOR UPDATE;
END $$;

CREATE FUNCTION private.terminalize_bound_downstream_authorization_transaction(
  target_attempt_id uuid,target_leg_id uuid,next_status text,at_time timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE;
BEGIN
  IF next_status NOT IN ('expired','rejected') THEN RAISE EXCEPTION 'PHASE10O_R_TERMINAL_STATUS_INVALID'; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions
    WHERE login_attempt_id=target_attempt_id FOR UPDATE;
  IF tx.id IS NULL THEN RETURN true; END IF;
  IF tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM target_leg_id THEN RETURN false; END IF;
  UPDATE private.downstream_authorization_transactions
    SET status=next_status,broker_handle_digest=NULL,downstream_nonce=NULL,downstream_state=NULL,terminal_at=at_time,version=version+1
    WHERE id=tx.id AND status='upstream_bound' AND upstream_login_leg_id=target_leg_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.claim_downstream_authorization_transaction_by_handle(requested_handle_digest bytea)
RETURNS TABLE(outcome text,transaction_id uuid,login_attempt_id uuid,client_id text,redirect_uri text,response_type text,requested_scopes text,pkce_s256_challenge text,pkce_method text,downstream_nonce text,downstream_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF requested_handle_digest IS NULL OR octet_length(requested_handle_digest)<>32 THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE status='pending' AND broker_handle_digest=requested_handle_digest FOR UPDATE;
  IF tx.id IS NULL THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  IF tx.expires_at<=now_at OR attempt.id IS NULL OR attempt.expires_at<=now_at OR attempt.state<>'created' THEN
    UPDATE private.downstream_authorization_transactions SET status='expired',broker_handle_digest=NULL,downstream_nonce=NULL,downstream_state=NULL,terminal_at=now_at,version=version+1 WHERE id=tx.id;
    IF attempt.id IS NOT NULL AND attempt.state='created' THEN UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id; END IF;
    RETURN QUERY SELECT 'EXPIRED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  UPDATE private.downstream_authorization_transactions SET status='claimed',broker_handle_digest=NULL,claimed_at=now_at,version=version+1 WHERE id=tx.id;
  RETURN QUERY SELECT 'TRANSACTION_CLAIMED',tx.id,tx.login_attempt_id,tx.client_id,tx.redirect_uri,tx.response_type,tx.requested_scopes,tx.pkce_s256_challenge,tx.pkce_method,tx.downstream_nonce,tx.downstream_state;
END $$;

CREATE OR REPLACE FUNCTION public.bind_downstream_authorization_transaction_upstream_leg(target_transaction_id uuid, requested_leg_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_transaction_id IS NULL OR requested_leg_id IS NULL THEN RETURN 'BINDING_REJECTED'; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE id=target_transaction_id FOR UPDATE;
  IF tx.id IS NULL OR tx.status<>'claimed' OR tx.broker_handle_digest IS NOT NULL THEN RETURN 'BINDING_REJECTED'; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=requested_leg_id FOR UPDATE;
  IF tx.expires_at<=now_at OR attempt.id IS NULL OR attempt.expires_at<=now_at THEN
    UPDATE private.downstream_authorization_transactions SET status='expired',downstream_nonce=NULL,downstream_state=NULL,terminal_at=now_at,version=version+1 WHERE id=tx.id; RETURN 'EXPIRED';
  END IF;
  IF leg.id IS NULL OR leg.login_attempt_id<>tx.login_attempt_id OR leg.status<>'pending' OR attempt.state<>'upstream_pending' THEN RETURN 'BINDING_REJECTED'; END IF;
  UPDATE private.downstream_authorization_transactions SET status='upstream_bound',broker_handle_digest=NULL,upstream_login_leg_id=leg.id,claimed_at=now_at,version=version+1 WHERE id=tx.id;
  RETURN 'UPSTREAM_BOUND';
END $$;

CREATE OR REPLACE FUNCTION public.fail_upstream_login_leg(target_attempt_id uuid,target_leg_id uuid,reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp(); next_tx_status text;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF reason NOT IN ('provider_failure','identity_failure','expired') THEN RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_FAILURE_REJECTED'; END IF;
  PERFORM private.lock_downstream_authorization_transaction_for_attempt(target_attempt_id);
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL OR leg.status<>'callback_claimed' THEN RETURN 'REPLAY_REJECTED'; END IF;
  next_tx_status:=CASE WHEN reason='expired' OR attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'expired' ELSE 'rejected' END;
  IF NOT private.terminalize_bound_downstream_authorization_transaction(target_attempt_id,target_leg_id,next_tx_status,now_at) THEN RETURN 'REPLAY_REJECTED'; END IF;
  PERFORM private.scrub_upstream_login_leg(leg.id,next_tx_status,now_at);
  UPDATE private.oauth_login_attempts SET state=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,coarse_terminal_reason=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  RETURN CASE WHEN next_tx_status='expired' THEN 'EXPIRED' ELSE 'REJECTED' END;
END $$;

CREATE OR REPLACE FUNCTION public.claim_upstream_login_callback_by_state(
  requested_provider text, requested_client_binding_digest bytea, submitted_state_digest bytea
) RETURNS TABLE(outcome text,attempt_id uuid,leg_id uuid,provider text,nonce_digest bytea,pkce_s256_challenge text,pkce_verifier_ciphertext bytea,pkce_verifier_iv bytea,pkce_verifier_key_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate_attempt_id uuid; tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp(); next_tx_status text;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF requested_provider NOT IN ('kakao','naver','google') OR submitted_state_digest IS NULL OR octet_length(submitted_state_digest)<>32 THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  SELECT login_attempt_id INTO candidate_attempt_id FROM private.upstream_login_legs WHERE status='pending' AND state_digest=submitted_state_digest LIMIT 1;
  IF candidate_attempt_id IS NULL THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE login_attempt_id=candidate_attempt_id FOR UPDATE;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=candidate_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE login_attempt_id=candidate_attempt_id AND status='pending' AND state_digest=submitted_state_digest FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL OR leg.status<>'pending' OR leg.state_digest IS DISTINCT FROM submitted_state_digest OR attempt.state<>'upstream_pending' THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  -- A transaction is optional for pre-O compatibility.  When it exists, only
  -- its exact bound leg may claim this callback; a claimed/unbound row is not
  -- a substitute authority and must remain untouched for its valid bind path.
  IF tx.id IS NOT NULL AND (tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM leg.id) THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  IF attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN next_tx_status:='expired';
  ELSIF attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN next_tx_status:='rejected';
  ELSIF requested_client_binding_digest IS NULL OR octet_length(requested_client_binding_digest)<>32 OR leg.client_binding_digest<>requested_client_binding_digest THEN next_tx_status:='rejected';
  ELSE
    UPDATE private.upstream_login_legs SET status='callback_claimed',state_digest=NULL,callback_claimed_at=now_at,version=version+1 WHERE id=leg.id;
    RETURN QUERY SELECT 'CALLBACK_CLAIMED',attempt.id,leg.id,leg.provider,leg.nonce_digest,leg.pkce_s256_challenge,leg.pkce_verifier_ciphertext,leg.pkce_verifier_iv,leg.pkce_verifier_key_version::integer; RETURN;
  END IF;
  IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,next_tx_status,now_at) THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  PERFORM private.scrub_upstream_login_leg(leg.id,next_tx_status,now_at);
  UPDATE private.oauth_login_attempts SET state=CASE WHEN next_tx_status='expired' THEN 'expired' WHEN attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN 'provider_mismatch' ELSE 'failed_safe' END,coarse_terminal_reason=CASE WHEN next_tx_status='expired' THEN 'expired' WHEN attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN 'provider_mismatch' ELSE 'failed_safe' END,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT CASE WHEN next_tx_status='expired' THEN 'EXPIRED' WHEN attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN 'PROVIDER_MISMATCH' ELSE 'CLIENT_BINDING_REJECTED' END,NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer;
END $$;

CREATE OR REPLACE FUNCTION public.record_verified_social_identity_from_upstream_leg(
  target_attempt_id uuid,target_leg_id uuid,requested_provider text,requested_broker_subject text,requested_subject_digest bytea,requested_subject_key_version integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; existing private.social_identity_registry%ROWTYPE; competing uuid; now_at timestamptz:=clock_timestamp(); violation_constraint text; next_tx_status text;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE login_attempt_id=target_attempt_id FOR UPDATE;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL OR attempt.state<>'upstream_pending' OR leg.status<>'callback_claimed' THEN RETURN 'IDENTITY_REJECTED'; END IF;
  -- Success must be authorized by the exact transaction↔attempt↔leg tuple.
  -- Pre-O attempts have no transaction and retain their compatible lifecycle.
  IF tx.id IS NOT NULL AND (tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM leg.id) THEN RETURN 'IDENTITY_REJECTED'; END IF;
  IF attempt.provider<>requested_provider OR leg.provider<>requested_provider OR attempt.expires_at<=now_at OR leg.expires_at<=now_at OR requested_broker_subject !~ ('^slb:v1:k[0-9]{2}:'||requested_provider||':[A-Za-z0-9_-]{43}$') OR requested_subject_key_version NOT BETWEEN 1 AND 99 OR requested_subject_digest IS NULL OR octet_length(requested_subject_digest)<>32 OR split_part(requested_broker_subject,':',3)<>'k'||lpad(requested_subject_key_version::text,2,'0') OR split_part(requested_broker_subject,':',5)<>replace(replace(replace(encode(requested_subject_digest,'base64'),'+','-'),'/','_'),'=','') THEN
    next_tx_status:=CASE WHEN attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'expired' ELSE 'rejected' END;
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,next_tx_status,now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,next_tx_status,now_at);
    UPDATE private.oauth_login_attempts SET state=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,coarse_terminal_reason=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN CASE WHEN next_tx_status='expired' THEN 'EXPIRED' ELSE 'IDENTITY_REJECTED' END;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:broker-decision:v1:'||requested_provider||':'||requested_subject_key_version::text||':'||encode(requested_subject_digest,'hex'),0));
  SELECT r.* INTO existing FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id WHERE r.broker_subject=requested_broker_subject AND r.status='active' AND a.status='active' AND a.primary_provider=requested_provider AND a.primary_broker_subject=requested_broker_subject;
  IF existing.account_id IS NOT NULL THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at); UPDATE private.oauth_login_attempts SET state='existing_primary',broker_subject=requested_broker_subject,subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,account_id=existing.account_id,updated_at=now_at,version=version+1 WHERE id=attempt.id; RETURN 'EXISTING_PRIMARY';
  END IF;
  IF EXISTS(SELECT 1 FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id WHERE r.broker_subject=requested_broker_subject AND r.status='provisional' AND a.status='provisional') OR EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id<>attempt.id AND provider=requested_provider AND broker_subject=requested_broker_subject AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')) THEN
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,'rejected',now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at); UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=attempt.id; RETURN 'IDENTITY_DECISION_IN_PROGRESS';
  END IF;
  UPDATE private.oauth_login_attempts SET state='upstream_verified',broker_subject=requested_broker_subject,subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  UPDATE private.oauth_login_attempts SET state='recovery_required',updated_at=now_at,version=version+1 WHERE id=attempt.id;
  PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
  RETURN 'RECOVERY_REQUIRED';
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
  IF violation_constraint<>'oauth_login_attempts_live_subject_unique' THEN RAISE; END IF;
  -- Preserve the original defensive re-read: only a committed competing live
  -- attempt turns this narrow index race into the approved safe outcome.
  SELECT id INTO competing FROM private.oauth_login_attempts
    WHERE id<>target_attempt_id AND provider=requested_provider AND broker_subject=requested_broker_subject
      AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')
    FOR KEY SHARE LIMIT 1;
  IF competing IS NULL THEN RAISE; END IF;
  IF NOT private.terminalize_bound_downstream_authorization_transaction(target_attempt_id,target_leg_id,'rejected',now_at) THEN RAISE EXCEPTION 'PHASE10O_R_TRANSACTION_BINDING_REJECTED'; END IF;
  PERFORM private.scrub_upstream_login_leg(target_leg_id,'rejected',now_at); UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=target_attempt_id; RETURN 'IDENTITY_DECISION_IN_PROGRESS';
END $$;

REVOKE ALL ON FUNCTION private.lock_downstream_authorization_transaction_for_attempt(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.terminalize_bound_downstream_authorization_transaction(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fail_upstream_login_leg(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_upstream_login_callback_by_state(text,bytea,bytea) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_upstream_login_leg(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_upstream_login_callback_by_state(text,bytea,bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) TO service_role;
COMMENT ON CONSTRAINT downstream_authorization_transactions_terminal_context_scrub ON private.downstream_authorization_transactions IS 'PHASE 10O-R terminal transaction rows never retain raw downstream nonce or state.';
COMMIT;
