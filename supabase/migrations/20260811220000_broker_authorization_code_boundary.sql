-- PHASE 10O-J: durable, service-only broker authorization-code boundary.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.social_identity_registry') IS NULL
    OR to_regclass('private.private_accounts') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_J_BASELINE_MISSING';
  END IF;
  IF to_regclass('private.broker_authorization_codes') IS NOT NULL
    OR to_regprocedure('public.create_broker_authorization_code(uuid,uuid,bytea,text,text,text,bigint,bytea,bytea,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.consume_broker_authorization_code(bytea,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10O_J_OBJECT_COLLISION';
  END IF;
END $$;

CREATE TABLE private.broker_authorization_codes (
  id uuid PRIMARY KEY,
  login_attempt_id uuid NOT NULL REFERENCES private.oauth_login_attempts(id) ON DELETE CASCADE,
  code_digest bytea NOT NULL UNIQUE CHECK (octet_length(code_digest)=32),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 512),
  redirect_uri text NOT NULL CHECK (length(redirect_uri) BETWEEN 1 AND 2048),
  pkce_s256_challenge text NOT NULL CHECK (pkce_s256_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  authentication_time bigint NOT NULL,
  state text NOT NULL CHECK (state IN ('ready','consumed','expired','rejected')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  rejected_at timestamptz NULL,
  downstream_nonce_digest bytea NULL CHECK (downstream_nonce_digest IS NULL OR octet_length(downstream_nonce_digest)=32),
  downstream_nonce_ciphertext bytea NULL CHECK (downstream_nonce_ciphertext IS NULL OR octet_length(downstream_nonce_ciphertext)>16),
  downstream_nonce_iv bytea NULL CHECK (downstream_nonce_iv IS NULL OR octet_length(downstream_nonce_iv)=12),
  downstream_nonce_key_version smallint NULL CHECK (downstream_nonce_key_version BETWEEN 1 AND 32767),
  CHECK (expires_at > created_at),
  CHECK ((downstream_nonce_digest IS NULL) = (downstream_nonce_ciphertext IS NULL)
    AND (downstream_nonce_digest IS NULL) = (downstream_nonce_iv IS NULL)
    AND (downstream_nonce_digest IS NULL) = (downstream_nonce_key_version IS NULL)),
  CHECK ((state='ready') = (consumed_at IS NULL AND rejected_at IS NULL)),
  CHECK ((state='consumed') = (consumed_at IS NOT NULL AND rejected_at IS NULL)),
  CHECK ((state IN ('expired','rejected')) = (consumed_at IS NULL AND rejected_at IS NOT NULL))
);
ALTER TABLE private.broker_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.broker_authorization_codes FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX broker_authorization_codes_one_ready_per_attempt
  ON private.broker_authorization_codes(login_attempt_id) WHERE state='ready';

CREATE FUNCTION public.create_broker_authorization_code(
  target_attempt_id uuid,
  requested_code_id uuid,
  requested_code_digest bytea,
  requested_client_id text,
  requested_redirect_uri text,
  requested_pkce_s256_challenge text,
  requested_authentication_time bigint,
  requested_downstream_nonce_digest bytea DEFAULT NULL,
  requested_downstream_nonce_ciphertext bytea DEFAULT NULL,
  requested_downstream_nonce_iv bytea DEFAULT NULL,
  requested_downstream_nonce_key_version integer DEFAULT NULL
) RETURNS TABLE(outcome text,code_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  attempt private.oauth_login_attempts%ROWTYPE;
  issued_at timestamptz:=clock_timestamp();
  terminal_at timestamptz;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  IF requested_code_id IS NULL OR requested_code_digest IS NULL OR octet_length(requested_code_digest)<>32
    OR requested_client_id IS NULL OR length(requested_client_id) NOT BETWEEN 1 AND 512
    OR requested_redirect_uri IS NULL OR length(requested_redirect_uri) NOT BETWEEN 1 AND 2048
    OR requested_pkce_s256_challenge IS NULL OR requested_pkce_s256_challenge !~ '^[A-Za-z0-9_-]{43}$'
    OR requested_authentication_time IS NULL OR requested_authentication_time<0
    OR requested_authentication_time>floor(extract(epoch FROM issued_at))::bigint
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_ciphertext IS NULL))
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_iv IS NULL))
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_key_version IS NULL))
    OR (requested_downstream_nonce_digest IS NOT NULL AND (octet_length(requested_downstream_nonce_digest)<>32 OR octet_length(requested_downstream_nonce_ciphertext)<=16 OR octet_length(requested_downstream_nonce_iv)<>12 OR requested_downstream_nonce_key_version NOT BETWEEN 1 AND 32767))
    OR attempt.id IS NULL OR attempt.state NOT IN ('auth_principal_bound','existing_primary') THEN
    RAISE EXCEPTION 'BROKER_AUTHORIZATION_CODE_ISSUE_REJECTED';
  END IF;
  IF attempt.expires_at<=issued_at THEN
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=issued_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_EXPIRED'::text,NULL::uuid,NULL::timestamptz;
    RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM private.private_accounts a JOIN private.social_identity_registry r ON r.account_id=a.id
    WHERE a.id=attempt.account_id AND a.primary_provider=attempt.provider AND a.primary_broker_subject=attempt.broker_subject
      AND r.broker_subject=attempt.broker_subject AND r.provider=attempt.provider AND r.auth_user_id=a.auth_user_id
      AND ((attempt.state='auth_principal_bound' AND a.status='provisional' AND a.auth_user_id IS NOT NULL)
        OR (attempt.state='existing_primary' AND a.status='active' AND a.auth_user_id IS NOT NULL))
  ) THEN RAISE EXCEPTION 'BROKER_AUTHORIZATION_CODE_ISSUE_REJECTED'; END IF;
  IF EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE login_attempt_id=attempt.id) THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz;
    RETURN;
  END IF;
  terminal_at:=LEAST(attempt.expires_at,issued_at+interval '60 seconds');
  IF terminal_at<=issued_at THEN
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=issued_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_EXPIRED'::text,NULL::uuid,NULL::timestamptz;
    RETURN;
  END IF;
  BEGIN
    INSERT INTO private.broker_authorization_codes(id,login_attempt_id,code_digest,client_id,redirect_uri,pkce_s256_challenge,authentication_time,state,created_at,expires_at,downstream_nonce_digest,downstream_nonce_ciphertext,downstream_nonce_iv,downstream_nonce_key_version)
    VALUES(requested_code_id,attempt.id,requested_code_digest,requested_client_id,requested_redirect_uri,requested_pkce_s256_challenge,requested_authentication_time,'ready',issued_at,terminal_at,requested_downstream_nonce_digest,requested_downstream_nonce_ciphertext,requested_downstream_nonce_iv,requested_downstream_nonce_key_version);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz;
    RETURN;
  END;
  UPDATE private.oauth_login_attempts SET state='broker_code_ready',updated_at=issued_at,version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT 'AUTHORIZATION_CODE_CREATED'::text,requested_code_id,terminal_at;
END $$;

CREATE FUNCTION public.consume_broker_authorization_code(
  requested_code_digest bytea,
  requested_client_id text,
  requested_redirect_uri text,
  requested_pkce_s256_challenge text
) RETURNS TABLE(
  outcome text,
  broker_subject text,
  authentication_time bigint,
  client_id text,
  downstream_nonce_digest bytea,
  downstream_nonce_ciphertext bytea,
  downstream_nonce_iv bytea,
  downstream_nonce_key_version integer,
  code_id uuid
) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE code private.broker_authorization_codes%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF requested_code_digest IS NULL OR octet_length(requested_code_digest)<>32 OR requested_client_id IS NULL OR requested_redirect_uri IS NULL OR requested_pkce_s256_challenge IS NULL OR requested_pkce_s256_challenge !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::text,NULL::bigint,NULL::text,NULL::bytea,NULL::bytea,NULL::bytea,NULL::integer,NULL::uuid;
    RETURN;
  END IF;
  SELECT * INTO code FROM private.broker_authorization_codes WHERE code_digest=requested_code_digest FOR UPDATE;
  IF code.id IS NULL THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::text,NULL::bigint,NULL::text,NULL::bytea,NULL::bytea,NULL::bytea,NULL::integer,NULL::uuid;
    RETURN;
  END IF;
  IF code.state='consumed' OR code.state IN ('expired','rejected') THEN
    RETURN QUERY SELECT 'REPLAY_REJECTED'::text,NULL::text,NULL::bigint,NULL::text,NULL::bytea,NULL::bytea,NULL::bytea,NULL::integer,NULL::uuid;
    RETURN;
  END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=code.login_attempt_id FOR UPDATE;
  IF code.expires_at<=now_at OR attempt.id IS NULL OR attempt.expires_at<=now_at THEN
    UPDATE private.broker_authorization_codes SET state='expired',rejected_at=now_at WHERE id=code.id;
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=code.login_attempt_id AND state='broker_code_ready';
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_EXPIRED'::text,NULL::text,NULL::bigint,NULL::text,NULL::bytea,NULL::bytea,NULL::bytea,NULL::integer,NULL::uuid;
    RETURN;
  END IF;
  IF attempt.state<>'broker_code_ready' OR requested_client_id<>code.client_id OR requested_redirect_uri<>code.redirect_uri OR requested_pkce_s256_challenge<>code.pkce_s256_challenge THEN
    UPDATE private.broker_authorization_codes SET state='rejected',rejected_at=now_at WHERE id=code.id;
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=code.login_attempt_id AND state='broker_code_ready';
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::text,NULL::bigint,NULL::text,NULL::bytea,NULL::bytea,NULL::bytea,NULL::integer,NULL::uuid;
    RETURN;
  END IF;
  UPDATE private.broker_authorization_codes SET state='consumed',consumed_at=now_at WHERE id=code.id;
  UPDATE private.oauth_login_attempts SET state='consumed',consumed_at=now_at,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT 'AUTHORIZATION_CODE_CONSUMED'::text,attempt.broker_subject,code.authentication_time,code.client_id,code.downstream_nonce_digest,code.downstream_nonce_ciphertext,code.downstream_nonce_iv,code.downstream_nonce_key_version::integer,code.id;
END $$;

REVOKE ALL ON TABLE private.broker_authorization_codes FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_broker_authorization_code(uuid,uuid,bytea,text,text,text,bigint,bytea,bytea,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.consume_broker_authorization_code(bytea,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_broker_authorization_code(uuid,uuid,bytea,text,text,text,bigint,bytea,bytea,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_broker_authorization_code(bytea,text,text,text) TO service_role;
COMMENT ON TABLE private.broker_authorization_codes IS 'PHASE 10O-J durable opaque broker codes: SHA-256 digest and optional encrypted downstream nonce only; never raw code, verifier, nonce, email, subject, or tokens.';
COMMIT;
