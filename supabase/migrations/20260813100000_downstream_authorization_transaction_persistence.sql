-- PHASE 10O-O: durable downstream authorization-request context. Feature-off.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_O_BASELINE_MISSING';
  END IF;
  IF to_regclass('private.downstream_authorization_transactions') IS NOT NULL
    OR to_regprocedure('public.create_downstream_authorization_transaction(uuid,uuid,bytea,text,text,text,text,text,text,text,timestamptz)') IS NOT NULL
    OR to_regprocedure('public.claim_downstream_authorization_transaction_by_handle(bytea)') IS NOT NULL
    OR to_regprocedure('public.bind_downstream_authorization_transaction_upstream_leg(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10O_O_OBJECT_COLLISION';
  END IF;
END $$;

CREATE TABLE private.downstream_authorization_transactions (
  id uuid PRIMARY KEY,
  login_attempt_id uuid NOT NULL UNIQUE REFERENCES private.oauth_login_attempts(id) ON DELETE CASCADE,
  upstream_login_leg_id uuid NULL UNIQUE REFERENCES private.upstream_login_legs(id) ON DELETE RESTRICT,
  broker_handle_digest bytea NULL CHECK (broker_handle_digest IS NULL OR octet_length(broker_handle_digest)=32),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 512),
  redirect_uri text NOT NULL CHECK (length(redirect_uri) BETWEEN 1 AND 2048),
  response_type text NOT NULL CHECK (response_type='code'),
  requested_scopes text NOT NULL CHECK (length(requested_scopes) BETWEEN 1 AND 2048),
  pkce_s256_challenge text NOT NULL CHECK (pkce_s256_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  pkce_method text NOT NULL CHECK (pkce_method='S256'),
  downstream_nonce text NULL CHECK (downstream_nonce IS NULL OR length(downstream_nonce) BETWEEN 1 AND 2048),
  downstream_state text NULL CHECK (downstream_state IS NULL OR length(downstream_state) BETWEEN 1 AND 2048),
  status text NOT NULL CHECK (status IN ('pending','claimed','upstream_bound','expired','rejected','consumed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz NULL,
  terminal_at timestamptz NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  CHECK (expires_at>created_at),
  CHECK ((status='pending') = (broker_handle_digest IS NOT NULL AND claimed_at IS NULL AND terminal_at IS NULL)),
  CHECK ((status='claimed') = (broker_handle_digest IS NULL AND upstream_login_leg_id IS NULL AND claimed_at IS NOT NULL AND terminal_at IS NULL)),
  CHECK ((status='upstream_bound') = (broker_handle_digest IS NULL AND claimed_at IS NOT NULL AND terminal_at IS NULL AND upstream_login_leg_id IS NOT NULL)),
  CHECK ((status IN ('expired','rejected','consumed')) = (broker_handle_digest IS NULL AND terminal_at IS NOT NULL))
);
ALTER TABLE private.downstream_authorization_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.downstream_authorization_transactions FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX downstream_authorization_transactions_pending_handle_unique
  ON private.downstream_authorization_transactions(broker_handle_digest)
  WHERE status='pending' AND broker_handle_digest IS NOT NULL;

CREATE FUNCTION public.create_downstream_authorization_transaction(
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
    OR requested_response_type IS NULL OR requested_response_type<>'code' OR requested_scopes IS NULL OR length(requested_scopes) NOT BETWEEN 1 AND 2048
    OR requested_pkce_s256_challenge IS NULL OR requested_pkce_s256_challenge !~ '^[A-Za-z0-9_-]{43}$' OR requested_pkce_method IS NULL OR requested_pkce_method<>'S256'
    OR (requested_downstream_nonce IS NOT NULL AND length(requested_downstream_nonce) NOT BETWEEN 1 AND 2048)
    OR (requested_downstream_state IS NOT NULL AND length(requested_downstream_state) NOT BETWEEN 1 AND 2048)
    OR requested_expires_at IS NULL OR requested_expires_at<=now_at OR attempt.id IS NULL OR attempt.state<>'created' OR attempt.expires_at<=now_at THEN
    RAISE EXCEPTION 'DOWNSTREAM_AUTHORIZATION_TRANSACTION_CREATE_REJECTED';
  END IF;
  IF EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE login_attempt_id=attempt.id) THEN
    RETURN QUERY SELECT 'TRANSACTION_ALREADY_EXISTS'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  BEGIN
    INSERT INTO private.downstream_authorization_transactions(id,login_attempt_id,broker_handle_digest,client_id,redirect_uri,response_type,requested_scopes,pkce_s256_challenge,pkce_method,downstream_nonce,downstream_state,status,created_at,expires_at)
    VALUES(requested_transaction_id,attempt.id,requested_handle_digest,requested_client_id,requested_redirect_uri,requested_response_type,requested_scopes,requested_pkce_s256_challenge,requested_pkce_method,requested_downstream_nonce,requested_downstream_state,'pending',now_at,LEAST(requested_expires_at,attempt.expires_at));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DOWNSTREAM_AUTHORIZATION_TRANSACTION_COLLISION';
  END;
  RETURN QUERY SELECT 'TRANSACTION_CREATED'::text,requested_transaction_id,LEAST(requested_expires_at,attempt.expires_at);
END $$;

CREATE FUNCTION public.claim_downstream_authorization_transaction_by_handle(requested_handle_digest bytea)
RETURNS TABLE(outcome text,transaction_id uuid,login_attempt_id uuid,client_id text,redirect_uri text,response_type text,requested_scopes text,pkce_s256_challenge text,pkce_method text,downstream_nonce text,downstream_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF requested_handle_digest IS NULL OR octet_length(requested_handle_digest)<>32 THEN
    RETURN QUERY SELECT 'CORRELATION_REJECTED'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE status='pending' AND broker_handle_digest=requested_handle_digest FOR UPDATE;
  IF tx.id IS NULL THEN RETURN QUERY SELECT 'CORRELATION_REJECTED'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  IF tx.expires_at<=now_at OR attempt.id IS NULL OR attempt.expires_at<=now_at OR attempt.state<>'created' THEN
    UPDATE private.downstream_authorization_transactions SET status='expired',broker_handle_digest=NULL,terminal_at=now_at,version=version+1 WHERE id=tx.id;
    IF attempt.id IS NOT NULL AND attempt.state='created' THEN UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id; END IF;
    RETURN QUERY SELECT 'EXPIRED'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text; RETURN;
  END IF;
  UPDATE private.downstream_authorization_transactions SET status='claimed',broker_handle_digest=NULL,claimed_at=now_at,version=version+1 WHERE id=tx.id;
  RETURN QUERY SELECT 'TRANSACTION_CLAIMED'::text,tx.id,tx.login_attempt_id,tx.client_id,tx.redirect_uri,tx.response_type,tx.requested_scopes,tx.pkce_s256_challenge,tx.pkce_method,tx.downstream_nonce,tx.downstream_state;
END $$;

CREATE FUNCTION public.bind_downstream_authorization_transaction_upstream_leg(target_transaction_id uuid, requested_leg_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  -- This private ID comes only from the preceding handle claim; no browser route accepts it.
  IF target_transaction_id IS NULL OR requested_leg_id IS NULL THEN RETURN 'BINDING_REJECTED'; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE id=target_transaction_id FOR UPDATE;
  IF tx.id IS NULL OR tx.status<>'claimed' OR tx.broker_handle_digest IS NOT NULL THEN RETURN 'BINDING_REJECTED'; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=requested_leg_id FOR UPDATE;
  IF tx.expires_at<=now_at OR attempt.id IS NULL OR attempt.expires_at<=now_at THEN
    UPDATE private.downstream_authorization_transactions SET status='expired',terminal_at=now_at,version=version+1 WHERE id=tx.id; RETURN 'EXPIRED';
  END IF;
  IF leg.id IS NULL OR leg.login_attempt_id<>tx.login_attempt_id OR leg.status<>'pending' OR attempt.state<>'upstream_pending' THEN
    -- A foreign/stale trusted leg cannot consume or terminalize this transaction.
    -- This keeps a valid same-attempt leg bindable after a competing mismatch.
    RETURN 'BINDING_REJECTED';
  END IF;
  UPDATE private.downstream_authorization_transactions SET status='upstream_bound',broker_handle_digest=NULL,upstream_login_leg_id=leg.id,claimed_at=now_at,version=version+1 WHERE id=tx.id;
  RETURN 'UPSTREAM_BOUND';
END $$;

REVOKE ALL ON TABLE private.downstream_authorization_transactions FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_downstream_authorization_transaction(uuid,uuid,bytea,text,text,text,text,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_downstream_authorization_transaction_by_handle(bytea) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bind_downstream_authorization_transaction_upstream_leg(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_downstream_authorization_transaction(uuid,uuid,bytea,text,text,text,text,text,text,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_downstream_authorization_transaction_by_handle(bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_downstream_authorization_transaction_upstream_leg(uuid,uuid) TO service_role;
COMMENT ON TABLE private.downstream_authorization_transactions IS 'PHASE 10O-O immutable downstream authorization context. Browser handles are SHA-256 digests only; no provider tokens, raw provider codes, verifier, profile, email, IP, or user agent.';
COMMIT;
