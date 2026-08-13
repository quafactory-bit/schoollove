-- PHASE 10O-P: only a trusted downstream authorization transaction may issue a broker code.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.broker_authorization_codes') IS NULL
    OR to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_P_BASELINE_MISSING';
  END IF;
  IF to_regprocedure('public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10O_P_OBJECT_COLLISION';
  END IF;
END $$;

-- Production has no durable broker-code rows.  The relationship is therefore
-- mandatory for every future code and additionally enforces the same attempt.
ALTER TABLE private.downstream_authorization_transactions
  ADD CONSTRAINT downstream_authorization_transactions_id_attempt_unique UNIQUE (id,login_attempt_id);
ALTER TABLE private.broker_authorization_codes
  ADD COLUMN authorization_transaction_id uuid NULL;
ALTER TABLE private.broker_authorization_codes
  ADD CONSTRAINT broker_authorization_codes_transaction_attempt_fkey
    FOREIGN KEY (authorization_transaction_id,login_attempt_id)
    REFERENCES private.downstream_authorization_transactions(id,login_attempt_id) ON DELETE RESTRICT;
ALTER TABLE private.broker_authorization_codes
  ALTER COLUMN authorization_transaction_id SET NOT NULL;
ALTER TABLE private.broker_authorization_codes
  ADD CONSTRAINT broker_authorization_codes_authorization_transaction_unique UNIQUE (authorization_transaction_id);

CREATE FUNCTION public.issue_transaction_bound_broker_authorization_code(
  target_transaction_id uuid,
  requested_code_id uuid,
  requested_code_digest bytea,
  requested_authentication_time bigint,
  requested_downstream_nonce text DEFAULT NULL,
  requested_downstream_nonce_digest bytea DEFAULT NULL,
  requested_downstream_nonce_ciphertext bytea DEFAULT NULL,
  requested_downstream_nonce_iv bytea DEFAULT NULL,
  requested_downstream_nonce_key_version integer DEFAULT NULL
) RETURNS TABLE(outcome text,code_id uuid,expires_at timestamptz,downstream_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tx private.downstream_authorization_transactions%ROWTYPE;
  attempt private.oauth_login_attempts%ROWTYPE;
  leg private.upstream_login_legs%ROWTYPE;
  issued_at timestamptz:=clock_timestamp();
  final_expiry timestamptz;
  nonce_digest bytea;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_transaction_id IS NULL OR requested_code_id IS NULL
    OR requested_code_digest IS NULL OR octet_length(requested_code_digest)<>32
    OR requested_authentication_time IS NULL OR requested_authentication_time<0
    OR requested_authentication_time>floor(extract(epoch FROM issued_at))::bigint
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_ciphertext IS NULL))
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_iv IS NULL))
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_key_version IS NULL))
    OR (requested_downstream_nonce_digest IS NOT NULL AND (octet_length(requested_downstream_nonce_digest)<>32 OR octet_length(requested_downstream_nonce_ciphertext)<=16 OR octet_length(requested_downstream_nonce_iv)<>12 OR requested_downstream_nonce_key_version NOT BETWEEN 1 AND 32767)) THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;

  -- Canonical lock order: transaction, its attempt, then its trusted leg.
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE id=target_transaction_id FOR UPDATE;
  IF tx.id IS NULL OR tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS NULL THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=tx.upstream_login_leg_id FOR UPDATE;
  IF tx.expires_at<=issued_at OR attempt.id IS NULL OR attempt.expires_at<=issued_at OR leg.id IS NULL OR leg.expires_at<=issued_at THEN
    UPDATE private.downstream_authorization_transactions
      SET status='expired',downstream_nonce=NULL,downstream_state=NULL,terminal_at=issued_at,version=version+1
      WHERE id=tx.id AND status='upstream_bound';
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=issued_at,version=version+1
      WHERE id=tx.login_attempt_id AND state IN ('auth_principal_bound','existing_primary');
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_EXPIRED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  IF leg.login_attempt_id<>tx.login_attempt_id OR leg.status<>'verified'
    OR attempt.state NOT IN ('auth_principal_bound','existing_primary') THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM private.private_accounts a JOIN private.social_identity_registry r ON r.account_id=a.id
    WHERE a.id=attempt.account_id AND a.primary_provider=attempt.provider AND a.primary_broker_subject=attempt.broker_subject
      AND r.broker_subject=attempt.broker_subject AND r.provider=attempt.provider AND r.auth_user_id=a.auth_user_id
      AND ((attempt.state='auth_principal_bound' AND a.status='provisional' AND a.auth_user_id IS NOT NULL)
        OR (attempt.state='existing_primary' AND a.status='active' AND a.auth_user_id IS NOT NULL))
  ) THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;

  -- The raw nonce is transient proof only.  Its digest proves the encrypted tuple
  -- corresponds to the exact nonce frozen on this transaction; raw nonce is never stored in code rows.
  IF tx.downstream_nonce IS NULL THEN
    IF requested_downstream_nonce IS NOT NULL OR requested_downstream_nonce_digest IS NOT NULL THEN
      RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
    END IF;
  ELSE
    nonce_digest:=extensions.digest(convert_to('schoollove:broker-code-downstream-nonce-digest:v1','UTF8') || decode('00','hex') || convert_to(tx.downstream_nonce,'UTF8'),'sha256');
    IF requested_downstream_nonce IS DISTINCT FROM tx.downstream_nonce
      OR requested_downstream_nonce_digest IS NULL OR requested_downstream_nonce_digest<>nonce_digest THEN
      RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE authorization_transaction_id=tx.id) THEN
    RETURN QUERY SELECT 'REPLAY_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  final_expiry:=LEAST(tx.expires_at,attempt.expires_at,issued_at+interval '60 seconds');
  IF final_expiry<=issued_at THEN
    UPDATE private.downstream_authorization_transactions
      SET status='expired',downstream_nonce=NULL,downstream_state=NULL,terminal_at=issued_at,version=version+1
      WHERE id=tx.id AND status='upstream_bound';
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=issued_at,version=version+1
      WHERE id=attempt.id AND state IN ('auth_principal_bound','existing_primary');
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_EXPIRED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  BEGIN
    INSERT INTO private.broker_authorization_codes(
      id,login_attempt_id,authorization_transaction_id,code_digest,client_id,redirect_uri,pkce_s256_challenge,
      authentication_time,state,created_at,expires_at,downstream_nonce_digest,downstream_nonce_ciphertext,
      downstream_nonce_iv,downstream_nonce_key_version
    ) VALUES (
      requested_code_id,tx.login_attempt_id,tx.id,requested_code_digest,tx.client_id,tx.redirect_uri,tx.pkce_s256_challenge,
      requested_authentication_time,'ready',issued_at,final_expiry,requested_downstream_nonce_digest,
      requested_downstream_nonce_ciphertext,requested_downstream_nonce_iv,requested_downstream_nonce_key_version
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END;
  UPDATE private.oauth_login_attempts SET state='broker_code_ready',updated_at=issued_at,version=version+1
    WHERE id=attempt.id AND state IN ('auth_principal_bound','existing_primary');
  UPDATE private.downstream_authorization_transactions
    SET status='consumed',downstream_nonce=NULL,downstream_state=NULL,terminal_at=issued_at,version=version+1
    WHERE id=tx.id AND status='upstream_bound';
  RETURN QUERY SELECT 'AUTHORIZATION_CODE_CREATED'::text,requested_code_id,final_expiry,tx.downstream_state;
END $$;

-- The legacy function is intentionally retained only for historical schema
-- compatibility.  No service principal can issue through its unbound signature.
REVOKE ALL ON FUNCTION public.create_broker_authorization_code(uuid,uuid,bytea,text,text,text,bigint,bytea,bytea,bytea,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer) TO service_role;
REVOKE ALL ON TABLE private.broker_authorization_codes FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE private.downstream_authorization_transactions FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer) IS 'PHASE 10O-P service-only issuance: immutable downstream transaction is authority for client, exact redirect, S256 PKCE, nonce and state; successful issuance atomically consumes transaction and scrubs raw nonce/state.';
COMMIT;
