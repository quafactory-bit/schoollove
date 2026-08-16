-- PHASE 10O-S: retry-safe pre-callback continuation and abandoned-context expiry. Feature-off.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regprocedure('private.scrub_upstream_login_leg(uuid,text,timestamp with time zone)') IS NULL
    OR to_regprocedure('public.claim_upstream_login_callback_by_state(text,bytea,bytea)') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_S_BASELINE_MISSING';
  END IF;
  -- S does not guess how historical live Q rows should be converted.  Feature-off
  -- production has no such rows; any unexpected row must be audited separately.
  IF EXISTS (SELECT 1 FROM private.downstream_authorization_transactions
    WHERE status IN ('pending','claimed','upstream_bound')) THEN
    RAISE EXCEPTION 'PHASE10O_S_LIVE_CONTINUATION_PRECHECK_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='private' AND table_name='downstream_authorization_transactions'
      AND column_name='continuation_handle_digest')
    OR EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='private' AND table_name='upstream_login_legs'
        AND column_name IN ('continuation_ciphertext','continuation_iv','continuation_key_version'))
    OR to_regprocedure('public.resolve_durable_continuation_by_digest(bytea)') IS NOT NULL
    OR to_regprocedure('public.create_or_resume_durable_upstream_continuation(bytea,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer,bytea,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.expire_abandoned_downstream_authorization_transaction(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10O_S_OBJECT_COLLISION';
  END IF;
END $$;

ALTER TABLE private.downstream_authorization_transactions
  ADD COLUMN continuation_handle_digest bytea NULL CHECK (continuation_handle_digest IS NULL OR octet_length(continuation_handle_digest)=32);
ALTER TABLE private.upstream_login_legs
  ADD COLUMN continuation_ciphertext bytea NULL CHECK (continuation_ciphertext IS NULL OR octet_length(continuation_ciphertext)>16),
  ADD COLUMN continuation_iv bytea NULL CHECK (continuation_iv IS NULL OR octet_length(continuation_iv)=12),
  ADD COLUMN continuation_key_version smallint NULL CHECK (continuation_key_version BETWEEN 1 AND 32767);

ALTER TABLE private.downstream_authorization_transactions
  ADD CONSTRAINT downstream_authorization_transactions_terminal_continuation_scrub CHECK (
    status NOT IN ('expired','rejected','consumed') OR continuation_handle_digest IS NULL
  );
ALTER TABLE private.upstream_login_legs
  ADD CONSTRAINT upstream_login_legs_terminal_continuation_scrub CHECK (
    status NOT IN ('verified','rejected','expired') OR (
      continuation_ciphertext IS NULL AND continuation_iv IS NULL AND continuation_key_version IS NULL
    )
  );
ALTER TABLE private.upstream_login_legs
  ADD CONSTRAINT upstream_login_legs_continuation_envelope_complete CHECK (
    (continuation_ciphertext IS NULL) = (continuation_iv IS NULL)
    AND (continuation_ciphertext IS NULL) = (continuation_key_version IS NULL)
  );

-- Existing O callers remain compatible.  New rows get a second, independently
-- named continuation authority; legacy destructive claim still clears both.
CREATE OR REPLACE FUNCTION public.create_downstream_authorization_transaction(
  requested_transaction_id uuid, target_attempt_id uuid, requested_handle_digest bytea,
  requested_client_id text, requested_redirect_uri text, requested_response_type text,
  requested_scopes text, requested_pkce_s256_challenge text, requested_pkce_method text,
  requested_downstream_nonce text, requested_downstream_state text, requested_expires_at timestamptz
) RETURNS TABLE(outcome text,transaction_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  IF requested_transaction_id IS NULL OR requested_handle_digest IS NULL OR octet_length(requested_handle_digest)<>32
    OR requested_client_id IS NULL OR length(requested_client_id) NOT BETWEEN 1 AND 512
    OR requested_redirect_uri IS NULL OR length(requested_redirect_uri) NOT BETWEEN 1 AND 2048
    OR requested_response_type IS DISTINCT FROM 'code' OR requested_scopes IS NULL OR length(requested_scopes) NOT BETWEEN 1 AND 2048
    OR requested_pkce_s256_challenge IS NULL OR requested_pkce_s256_challenge !~ '^[A-Za-z0-9_-]{43}$' OR requested_pkce_method IS DISTINCT FROM 'S256'
    OR (requested_downstream_nonce IS NOT NULL AND length(requested_downstream_nonce) NOT BETWEEN 1 AND 2048)
    OR (requested_downstream_state IS NOT NULL AND length(requested_downstream_state) NOT BETWEEN 1 AND 2048)
    OR requested_expires_at IS NULL OR requested_expires_at<=now_at OR attempt.id IS NULL OR attempt.state<>'created' OR attempt.expires_at<=now_at THEN
    RAISE EXCEPTION 'DOWNSTREAM_AUTHORIZATION_TRANSACTION_CREATE_REJECTED';
  END IF;
  IF EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE login_attempt_id=attempt.id) THEN
    RETURN QUERY SELECT 'TRANSACTION_ALREADY_EXISTS'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  BEGIN
    INSERT INTO private.downstream_authorization_transactions(id,login_attempt_id,broker_handle_digest,continuation_handle_digest,client_id,redirect_uri,response_type,requested_scopes,pkce_s256_challenge,pkce_method,downstream_nonce,downstream_state,status,created_at,expires_at)
    VALUES(requested_transaction_id,attempt.id,requested_handle_digest,requested_handle_digest,requested_client_id,requested_redirect_uri,requested_response_type,requested_scopes,requested_pkce_s256_challenge,requested_pkce_method,requested_downstream_nonce,requested_downstream_state,'pending',now_at,LEAST(requested_expires_at,attempt.expires_at));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DOWNSTREAM_AUTHORIZATION_TRANSACTION_COLLISION';
  END;
  RETURN QUERY SELECT 'TRANSACTION_CREATED'::text,requested_transaction_id,LEAST(requested_expires_at,attempt.expires_at);
END $$;

CREATE OR REPLACE FUNCTION private.scrub_upstream_login_leg(target_leg_id uuid, next_status text, at_time timestamptz DEFAULT clock_timestamp())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE private.upstream_login_legs
  SET status=next_status,state_digest=NULL,nonce_digest=NULL,pkce_s256_challenge=NULL,
      pkce_verifier_ciphertext=NULL,pkce_verifier_iv=NULL,pkce_verifier_key_version=NULL,
      continuation_ciphertext=NULL,continuation_iv=NULL,continuation_key_version=NULL,
      terminal_at=at_time,version=version+1
  WHERE id=target_leg_id;
END $$;

CREATE OR REPLACE FUNCTION private.terminalize_bound_downstream_authorization_transaction(
  target_attempt_id uuid,target_leg_id uuid,next_status text,at_time timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE;
BEGIN
  IF next_status NOT IN ('expired','rejected') THEN RAISE EXCEPTION 'PHASE10O_R_TERMINAL_STATUS_INVALID'; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE login_attempt_id=target_attempt_id FOR UPDATE;
  IF tx.id IS NULL THEN RETURN true; END IF;
  IF tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM target_leg_id THEN RETURN false; END IF;
  UPDATE private.downstream_authorization_transactions
    SET status=next_status,broker_handle_digest=NULL,continuation_handle_digest=NULL,downstream_nonce=NULL,downstream_state=NULL,terminal_at=at_time,version=version+1
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
    UPDATE private.downstream_authorization_transactions SET status='expired',broker_handle_digest=NULL,continuation_handle_digest=NULL,downstream_nonce=NULL,downstream_state=NULL,terminal_at=now_at,version=version+1 WHERE id=tx.id;
    IF attempt.id IS NOT NULL AND attempt.state='created' THEN UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id; END IF;
    RETURN QUERY SELECT 'EXPIRED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  UPDATE private.downstream_authorization_transactions SET status='claimed',broker_handle_digest=NULL,continuation_handle_digest=NULL,claimed_at=now_at,version=version+1 WHERE id=tx.id;
  RETURN QUERY SELECT 'TRANSACTION_CLAIMED',tx.id,tx.login_attempt_id,tx.client_id,tx.redirect_uri,tx.response_type,tx.requested_scopes,tx.pkce_s256_challenge,tx.pkce_method,tx.downstream_nonce,tx.downstream_state;
END $$;

CREATE FUNCTION public.resolve_durable_continuation_by_digest(requested_continuation_digest bytea)
RETURNS TABLE(outcome text,transaction_id uuid,attempt_id uuid,provider text,client_id text,redirect_uri text,leg_id uuid,client_binding_digest bytea,state_digest bytea,nonce_digest bytea,pkce_s256_challenge text,pkce_verifier_ciphertext bytea,pkce_verifier_iv bytea,pkce_verifier_key_version integer,continuation_ciphertext bytea,continuation_iv bytea,continuation_key_version integer,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF requested_continuation_digest IS NULL OR octet_length(requested_continuation_digest)<>32 THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::bytea,NULL::bytea,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer,NULL::bytea,NULL::bytea,NULL::integer,NULL::timestamptz; RETURN; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE continuation_handle_digest=requested_continuation_digest AND status IN ('pending','upstream_bound');
  IF tx.id IS NULL THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::bytea,NULL::bytea,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer,NULL::bytea,NULL::bytea,NULL::integer,NULL::timestamptz; RETURN; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=tx.upstream_login_leg_id;
  IF attempt.id IS NULL OR tx.expires_at<=now_at OR attempt.expires_at<=now_at OR (tx.status='pending' AND attempt.state<>'created') OR (tx.status='upstream_bound' AND (attempt.state<>'upstream_pending' OR leg.id IS NULL OR leg.status<>'pending')) THEN
    RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::bytea,NULL::bytea,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer,NULL::bytea,NULL::bytea,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  RETURN QUERY SELECT CASE WHEN tx.status='pending' THEN 'CONTINUATION_PENDING' ELSE 'CONTINUATION_BOUND' END,tx.id,attempt.id,attempt.provider,tx.client_id,tx.redirect_uri,leg.id,leg.client_binding_digest,leg.state_digest,leg.nonce_digest,leg.pkce_s256_challenge,leg.pkce_verifier_ciphertext,leg.pkce_verifier_iv,leg.pkce_verifier_key_version::integer,leg.continuation_ciphertext,leg.continuation_iv,leg.continuation_key_version::integer,tx.expires_at;
END $$;

CREATE FUNCTION public.create_or_resume_durable_upstream_continuation(
  requested_continuation_digest bytea, requested_leg_id uuid, requested_provider text,
  requested_client_binding_digest bytea, requested_state_digest bytea, requested_nonce_digest bytea,
  requested_pkce_s256_challenge text, requested_pkce_verifier_ciphertext bytea, requested_pkce_verifier_iv bytea, requested_pkce_verifier_key_version integer,
  requested_continuation_ciphertext bytea, requested_continuation_iv bytea, requested_continuation_key_version integer
) RETURNS TABLE(outcome text,transaction_id uuid,attempt_id uuid,provider text,client_id text,redirect_uri text,leg_id uuid,client_binding_digest bytea,state_digest bytea,nonce_digest bytea,pkce_s256_challenge text,pkce_verifier_ciphertext bytea,pkce_verifier_iv bytea,pkce_verifier_key_version integer,continuation_ciphertext bytea,continuation_iv bytea,continuation_key_version integer,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp(); final_expiry timestamptz;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF requested_continuation_digest IS NULL OR octet_length(requested_continuation_digest)<>32 THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::bytea,NULL::bytea,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer,NULL::bytea,NULL::bytea,NULL::integer,NULL::timestamptz; RETURN; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE continuation_handle_digest=requested_continuation_digest AND status IN ('pending','upstream_bound') FOR UPDATE;
  IF tx.id IS NULL THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::bytea,NULL::bytea,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer,NULL::bytea,NULL::bytea,NULL::integer,NULL::timestamptz; RETURN; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR tx.expires_at<=now_at OR attempt.expires_at<=now_at THEN
    UPDATE private.downstream_authorization_transactions SET status='expired',broker_handle_digest=NULL,continuation_handle_digest=NULL,downstream_nonce=NULL,downstream_state=NULL,terminal_at=now_at,version=version+1 WHERE id=tx.id;
    IF attempt.id IS NOT NULL AND attempt.state IN ('created','upstream_pending') THEN UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id; END IF;
    RETURN QUERY SELECT 'EXPIRED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::bytea,NULL::bytea,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer,NULL::bytea,NULL::bytea,NULL::integer,NULL::timestamptz; RETURN;
  END IF;
  IF tx.status='upstream_bound' THEN
    SELECT * INTO leg FROM private.upstream_login_legs WHERE id=tx.upstream_login_leg_id FOR UPDATE;
    IF attempt.state<>'upstream_pending' OR leg.id IS NULL OR leg.status<>'pending' OR leg.login_attempt_id<>attempt.id THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::uuid,NULL::bytea,NULL::bytea,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer,NULL::bytea,NULL::bytea,NULL::integer,NULL::timestamptz; RETURN; END IF;
    RETURN QUERY SELECT 'CONTINUATION_RESUMED',tx.id,attempt.id,attempt.provider,tx.client_id,tx.redirect_uri,leg.id,leg.client_binding_digest,leg.state_digest,leg.nonce_digest,leg.pkce_s256_challenge,leg.pkce_verifier_ciphertext,leg.pkce_verifier_iv,leg.pkce_verifier_key_version::integer,leg.continuation_ciphertext,leg.continuation_iv,leg.continuation_key_version::integer,tx.expires_at; RETURN;
  END IF;
  IF tx.status<>'pending' OR attempt.state<>'created' OR requested_leg_id IS NULL OR requested_provider<>attempt.provider
    OR requested_client_binding_digest IS NULL OR octet_length(requested_client_binding_digest)<>32
    OR requested_state_digest IS NULL OR octet_length(requested_state_digest)<>32
    OR requested_continuation_ciphertext IS NULL OR octet_length(requested_continuation_ciphertext)<=16
    OR requested_continuation_iv IS NULL OR octet_length(requested_continuation_iv)<>12
    OR requested_continuation_key_version NOT BETWEEN 1 AND 32767
    OR (requested_provider='naver' AND (requested_nonce_digest IS NOT NULL OR requested_pkce_s256_challenge IS NOT NULL OR requested_pkce_verifier_ciphertext IS NOT NULL OR requested_pkce_verifier_iv IS NOT NULL OR requested_pkce_verifier_key_version IS NOT NULL))
    OR (requested_provider IN ('kakao','google') AND (requested_nonce_digest IS NULL OR octet_length(requested_nonce_digest)<>32 OR requested_pkce_s256_challenge !~ '^[A-Za-z0-9_-]{43}$' OR requested_pkce_verifier_ciphertext IS NULL OR octet_length(requested_pkce_verifier_ciphertext)<=16 OR requested_pkce_verifier_iv IS NULL OR octet_length(requested_pkce_verifier_iv)<>12 OR requested_pkce_verifier_key_version NOT BETWEEN 1 AND 32767)) THEN
    RAISE EXCEPTION 'DURABLE_CONTINUATION_BINDING_REJECTED';
  END IF;
  final_expiry:=LEAST(tx.expires_at,attempt.expires_at,now_at+interval '10 minutes');
  INSERT INTO private.upstream_login_legs(id,login_attempt_id,provider,status,client_binding_digest,state_digest,nonce_digest,pkce_s256_challenge,pkce_verifier_ciphertext,pkce_verifier_iv,pkce_verifier_key_version,continuation_ciphertext,continuation_iv,continuation_key_version,created_at,expires_at)
  VALUES(requested_leg_id,attempt.id,requested_provider,'pending',requested_client_binding_digest,requested_state_digest,requested_nonce_digest,requested_pkce_s256_challenge,requested_pkce_verifier_ciphertext,requested_pkce_verifier_iv,requested_pkce_verifier_key_version,requested_continuation_ciphertext,requested_continuation_iv,requested_continuation_key_version,now_at,final_expiry);
  UPDATE private.oauth_login_attempts SET state='upstream_pending',updated_at=now_at,version=version+1 WHERE id=attempt.id;
  UPDATE private.downstream_authorization_transactions SET status='upstream_bound',broker_handle_digest=NULL,upstream_login_leg_id=requested_leg_id,claimed_at=now_at,version=version+1 WHERE id=tx.id;
  RETURN QUERY SELECT 'CONTINUATION_BOUND',tx.id,attempt.id,attempt.provider,tx.client_id,tx.redirect_uri,requested_leg_id,requested_client_binding_digest,requested_state_digest,requested_nonce_digest,requested_pkce_s256_challenge,requested_pkce_verifier_ciphertext,requested_pkce_verifier_iv,requested_pkce_verifier_key_version,requested_continuation_ciphertext,requested_continuation_iv,requested_continuation_key_version,final_expiry;
END $$;

CREATE FUNCTION public.expire_abandoned_downstream_authorization_transaction(target_transaction_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_transaction_id IS NULL THEN RETURN 'EXPIRY_REJECTED'; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE id=target_transaction_id FOR UPDATE;
  IF tx.id IS NULL OR tx.status IN ('expired','rejected','consumed') THEN RETURN 'REPLAY_REJECTED'; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  IF tx.expires_at>now_at AND attempt.id IS NOT NULL AND attempt.expires_at>now_at THEN RETURN 'NOT_EXPIRED'; END IF;
  IF tx.upstream_login_leg_id IS NOT NULL THEN
    SELECT * INTO leg FROM private.upstream_login_legs WHERE id=tx.upstream_login_leg_id FOR UPDATE;
    IF leg.id IS NOT NULL AND leg.status IN ('pending','callback_claimed') THEN PERFORM private.scrub_upstream_login_leg(leg.id,'expired',now_at); END IF;
  END IF;
  UPDATE private.downstream_authorization_transactions SET status='expired',broker_handle_digest=NULL,continuation_handle_digest=NULL,downstream_nonce=NULL,downstream_state=NULL,terminal_at=now_at,version=version+1 WHERE id=tx.id;
  IF attempt.id IS NOT NULL AND attempt.state NOT IN ('consumed','cancelled','expired','provider_mismatch','replay_rejected','launch_blocked','failed_safe') THEN UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id; END IF;
  RETURN 'EXPIRED';
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
  IF tx.id IS NOT NULL AND (tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM leg.id) THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  IF attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN next_tx_status:='expired';
  ELSIF attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN next_tx_status:='rejected';
  ELSIF requested_client_binding_digest IS NULL OR octet_length(requested_client_binding_digest)<>32 OR leg.client_binding_digest<>requested_client_binding_digest THEN next_tx_status:='rejected';
  ELSE
    UPDATE private.upstream_login_legs SET status='callback_claimed',state_digest=NULL,continuation_ciphertext=NULL,continuation_iv=NULL,continuation_key_version=NULL,callback_claimed_at=now_at,version=version+1 WHERE id=leg.id;
    IF tx.id IS NOT NULL THEN UPDATE private.downstream_authorization_transactions SET continuation_handle_digest=NULL,version=version+1 WHERE id=tx.id; END IF;
    RETURN QUERY SELECT 'CALLBACK_CLAIMED',attempt.id,leg.id,leg.provider,leg.nonce_digest,leg.pkce_s256_challenge,leg.pkce_verifier_ciphertext,leg.pkce_verifier_iv,leg.pkce_verifier_key_version::integer; RETURN;
  END IF;
  IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,next_tx_status,now_at) THEN RETURN QUERY SELECT 'CORRELATION_REJECTED',NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  PERFORM private.scrub_upstream_login_leg(leg.id,next_tx_status,now_at);
  UPDATE private.oauth_login_attempts SET state=CASE WHEN next_tx_status='expired' THEN 'expired' WHEN attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN 'provider_mismatch' ELSE 'failed_safe' END,coarse_terminal_reason=CASE WHEN next_tx_status='expired' THEN 'expired' WHEN attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN 'provider_mismatch' ELSE 'failed_safe' END,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT CASE WHEN next_tx_status='expired' THEN 'EXPIRED' WHEN attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN 'PROVIDER_MISMATCH' ELSE 'CLIENT_BINDING_REJECTED' END,NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer;
END $$;

REVOKE ALL ON TABLE private.downstream_authorization_transactions,private.upstream_login_legs FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.scrub_upstream_login_leg(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.terminalize_bound_downstream_authorization_transaction(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.resolve_durable_continuation_by_digest(bytea) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_or_resume_durable_upstream_continuation(bytea,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer,bytea,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expire_abandoned_downstream_authorization_transaction(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_durable_continuation_by_digest(bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_or_resume_durable_upstream_continuation(bytea,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer,bytea,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_downstream_authorization_transaction(uuid) TO service_role;
COMMENT ON COLUMN private.downstream_authorization_transactions.continuation_handle_digest IS 'PHASE 10O-S browser-bound digest retained only until callback claim or terminalization; never raw browser credentials.';
COMMENT ON COLUMN private.upstream_login_legs.continuation_ciphertext IS 'PHASE 10O-S AEAD envelope for raw upstream state and optional nonce; no plaintext continuation values are persisted.';
COMMIT;
