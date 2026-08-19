-- PHASE 10P: permit a recovery-decided first login to reach the downstream
-- OIDC exchange, then bind only the exact Supabase identity created by it.
BEGIN;

DO $$ BEGIN
  IF to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.private_accounts') IS NULL
    OR to_regclass('private.social_identity_registry') IS NULL
    OR to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regclass('private.broker_authorization_codes') IS NULL
    OR to_regprocedure('public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer)') IS NULL
    OR to_regprocedure('public.get_transaction_bound_broker_code_issuance_context(uuid)') IS NULL
    OR to_regprocedure('public.consume_broker_authorization_code(bytea,text,text,text)') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL
  THEN RAISE EXCEPTION 'PHASE10P_FIRST_LOGIN_BASELINE_MISSING'; END IF;
  IF to_regprocedure('public.get_social_recovery_http_context(uuid)') IS NOT NULL
    OR to_regprocedure('public.bind_social_auth_principal_from_attempt(uuid,uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'PHASE10P_FIRST_LOGIN_OBJECT_COLLISION'; END IF;
END $$;

CREATE FUNCTION public.get_social_recovery_http_context(target_attempt_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; tx private.downstream_authorization_transactions%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE login_attempt_id=target_attempt_id;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=tx.upstream_login_leg_id;
  IF attempt.id IS NULL OR attempt.state NOT IN ('recovery_required','recovery_pending') OR attempt.account_id IS NOT NULL
    OR attempt.expires_at<=now_at OR attempt.broker_subject IS NULL
    OR tx.id IS NULL OR tx.status<>'upstream_bound' OR tx.expires_at<=now_at
    OR leg.id IS NULL OR leg.login_attempt_id<>attempt.id OR leg.provider<>attempt.provider OR leg.status<>'verified' OR leg.expires_at<=now_at
  THEN RETURN 'RECOVERY_REJECTED'; END IF;
  RETURN 'RECOVERY_REQUIRED';
END $$;

CREATE OR REPLACE FUNCTION public.get_transaction_bound_broker_code_issuance_context(target_attempt_id uuid)
RETURNS TABLE(
  authorization_transaction_id uuid, login_attempt_id uuid, client_id text,
  redirect_uri text, pkce_s256_challenge text, downstream_nonce text,
  downstream_state text, expires_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_attempt_id IS NULL THEN RETURN; END IF;
  SELECT t.* INTO tx FROM private.downstream_authorization_transactions t WHERE t.login_attempt_id=target_attempt_id;
  SELECT a.* INTO attempt FROM private.oauth_login_attempts a WHERE a.id=target_attempt_id;
  IF tx.id IS NULL OR attempt.id IS NULL OR tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS NULL
    OR tx.expires_at<=now_at OR attempt.expires_at<=now_at OR attempt.state NOT IN ('account_decided','auth_principal_bound','existing_primary') THEN RETURN; END IF;
  SELECT l.* INTO leg FROM private.upstream_login_legs l WHERE l.id=tx.upstream_login_leg_id;
  IF leg.id IS NULL OR leg.login_attempt_id<>target_attempt_id OR leg.status<>'verified' OR leg.expires_at<=now_at THEN RETURN; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM private.private_accounts a JOIN private.social_identity_registry r ON r.account_id=a.id
    WHERE a.id=attempt.account_id AND a.primary_provider=attempt.provider AND a.primary_broker_subject=attempt.broker_subject
      AND r.broker_subject=attempt.broker_subject AND r.provider=attempt.provider
      AND ((attempt.state='account_decided' AND a.status='provisional' AND a.auth_user_id IS NULL AND r.status='provisional' AND r.auth_user_id IS NULL)
        OR (attempt.state='auth_principal_bound' AND a.status='provisional' AND a.auth_user_id IS NOT NULL AND r.auth_user_id=a.auth_user_id)
        OR (attempt.state='existing_primary' AND a.status='active' AND a.auth_user_id IS NOT NULL AND r.auth_user_id=a.auth_user_id))
  ) THEN RETURN; END IF;
  RETURN QUERY SELECT tx.id,tx.login_attempt_id,tx.client_id,tx.redirect_uri,tx.pkce_s256_challenge,tx.downstream_nonce,tx.downstream_state,tx.expires_at;
END $$;

CREATE OR REPLACE FUNCTION public.issue_transaction_bound_broker_authorization_code(
  target_transaction_id uuid, requested_code_id uuid, requested_code_digest bytea,
  requested_authentication_time bigint, requested_downstream_nonce text DEFAULT NULL,
  requested_downstream_nonce_digest bytea DEFAULT NULL,
  requested_downstream_nonce_ciphertext bytea DEFAULT NULL,
  requested_downstream_nonce_iv bytea DEFAULT NULL,
  requested_downstream_nonce_key_version integer DEFAULT NULL
) RETURNS TABLE(outcome text,code_id uuid,expires_at timestamptz,downstream_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; issued_at timestamptz:=clock_timestamp(); final_expiry timestamptz; nonce_digest bytea;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_transaction_id IS NULL OR requested_code_id IS NULL OR requested_code_digest IS NULL OR octet_length(requested_code_digest)<>32
    OR requested_authentication_time IS NULL OR requested_authentication_time<0 OR requested_authentication_time>floor(extract(epoch FROM issued_at))::bigint
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_ciphertext IS NULL))
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_iv IS NULL))
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_key_version IS NULL))
    OR (requested_downstream_nonce_digest IS NOT NULL AND (octet_length(requested_downstream_nonce_digest)<>32 OR octet_length(requested_downstream_nonce_ciphertext)<=16 OR octet_length(requested_downstream_nonce_iv)<>12 OR requested_downstream_nonce_key_version NOT BETWEEN 1 AND 32767))
  THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE id=target_transaction_id FOR UPDATE;
  IF tx.id IS NULL OR tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS NULL THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=tx.upstream_login_leg_id FOR UPDATE;
  IF tx.expires_at<=issued_at OR attempt.id IS NULL OR attempt.expires_at<=issued_at OR leg.id IS NULL OR leg.expires_at<=issued_at THEN
    UPDATE private.downstream_authorization_transactions SET status='expired',downstream_nonce=NULL,downstream_state=NULL,terminal_at=issued_at,version=version+1 WHERE id=tx.id AND status='upstream_bound';
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=issued_at,version=version+1 WHERE id=tx.login_attempt_id AND state IN ('account_decided','auth_principal_bound','existing_primary');
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_EXPIRED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  IF leg.login_attempt_id<>tx.login_attempt_id OR leg.status<>'verified' OR attempt.state NOT IN ('account_decided','auth_principal_bound','existing_primary') THEN
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM private.private_accounts a JOIN private.social_identity_registry r ON r.account_id=a.id
    WHERE a.id=attempt.account_id AND a.primary_provider=attempt.provider AND a.primary_broker_subject=attempt.broker_subject
      AND r.broker_subject=attempt.broker_subject AND r.provider=attempt.provider
      AND ((attempt.state='account_decided' AND a.status='provisional' AND a.auth_user_id IS NULL AND r.status='provisional' AND r.auth_user_id IS NULL)
        OR (attempt.state='auth_principal_bound' AND a.status='provisional' AND a.auth_user_id IS NOT NULL AND r.auth_user_id=a.auth_user_id)
        OR (attempt.state='existing_primary' AND a.status='active' AND a.auth_user_id IS NOT NULL AND r.auth_user_id=a.auth_user_id))
  ) THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  IF tx.downstream_nonce IS NULL THEN
    IF requested_downstream_nonce IS NOT NULL OR requested_downstream_nonce_digest IS NOT NULL THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  ELSE
    nonce_digest:=extensions.digest(convert_to('schoollove:broker-code-downstream-nonce-digest:v1','UTF8') || decode('00','hex') || convert_to(tx.downstream_nonce,'UTF8'),'sha256');
    IF requested_downstream_nonce IS DISTINCT FROM tx.downstream_nonce OR requested_downstream_nonce_digest IS NULL OR requested_downstream_nonce_digest<>nonce_digest THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE authorization_transaction_id=tx.id) THEN RETURN QUERY SELECT 'REPLAY_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  final_expiry:=LEAST(tx.expires_at,attempt.expires_at,issued_at+interval '60 seconds');
  IF final_expiry<=issued_at THEN
    UPDATE private.downstream_authorization_transactions SET status='expired',downstream_nonce=NULL,downstream_state=NULL,terminal_at=issued_at,version=version+1 WHERE id=tx.id AND status='upstream_bound';
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=issued_at,version=version+1 WHERE id=attempt.id AND state IN ('account_decided','auth_principal_bound','existing_primary');
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_EXPIRED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  BEGIN
    INSERT INTO private.broker_authorization_codes(id,login_attempt_id,authorization_transaction_id,code_digest,client_id,redirect_uri,pkce_s256_challenge,authentication_time,state,created_at,expires_at,downstream_nonce_digest,downstream_nonce_ciphertext,downstream_nonce_iv,downstream_nonce_key_version)
    VALUES(requested_code_id,tx.login_attempt_id,tx.id,requested_code_digest,tx.client_id,tx.redirect_uri,tx.pkce_s256_challenge,requested_authentication_time,'ready',issued_at,final_expiry,requested_downstream_nonce_digest,requested_downstream_nonce_ciphertext,requested_downstream_nonce_iv,requested_downstream_nonce_key_version);
  EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END;
  UPDATE private.oauth_login_attempts SET state='broker_code_ready',updated_at=issued_at,version=version+1 WHERE id=attempt.id AND state IN ('account_decided','auth_principal_bound','existing_primary');
  UPDATE private.downstream_authorization_transactions SET status='consumed',downstream_nonce=NULL,downstream_state=NULL,terminal_at=issued_at,version=version+1 WHERE id=tx.id AND status='upstream_bound';
  RETURN QUERY SELECT 'AUTHORIZATION_CODE_CREATED'::text,requested_code_id,final_expiry,tx.downstream_state;
END $$;

CREATE FUNCTION public.bind_social_auth_principal_from_attempt(target_attempt_id uuid,target_auth_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; account private.private_accounts%ROWTYPE; identity private.social_identity_registry%ROWTYPE;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_attempt_id IS NULL OR target_auth_user_id IS NULL THEN RAISE EXCEPTION 'SOCIAL_PRINCIPAL_BINDING_REJECTED'; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO account FROM private.private_accounts WHERE id=attempt.account_id FOR UPDATE;
  SELECT * INTO identity FROM private.social_identity_registry WHERE broker_subject=attempt.broker_subject FOR UPDATE;
  IF attempt.id IS NULL OR attempt.state<>'consumed' OR account.id IS NULL OR identity.broker_subject IS NULL
    OR identity.account_id<>account.id OR identity.provider<>attempt.provider
    OR account.primary_provider<>attempt.provider OR account.primary_broker_subject<>attempt.broker_subject
    OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=target_auth_user_id)
    OR NOT EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=target_auth_user_id AND (i.provider_id=attempt.broker_subject OR i.identity_data->>'sub'=attempt.broker_subject))
  THEN RAISE EXCEPTION 'SOCIAL_PRINCIPAL_BINDING_REJECTED'; END IF;
  IF account.auth_user_id=target_auth_user_id AND identity.auth_user_id=target_auth_user_id THEN RETURN 'AUTH_PRINCIPAL_ALREADY_BOUND'; END IF;
  IF account.status<>'provisional' OR identity.status<>'provisional' OR account.auth_user_id IS NOT NULL OR identity.auth_user_id IS NOT NULL
    OR account.recovery_email_verified_at IS NULL OR account.recovery_email_hmac IS NULL OR account.recovery_email_ciphertext IS NULL OR account.recovery_email_nonce IS NULL
  THEN RAISE EXCEPTION 'SOCIAL_PRINCIPAL_BINDING_REJECTED'; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET auth_user_id=target_auth_user_id WHERE id=account.id;
  UPDATE private.social_identity_registry SET auth_user_id=target_auth_user_id WHERE broker_subject=identity.broker_subject;
  RETURN 'AUTH_PRINCIPAL_BOUND';
END $$;

REVOKE ALL ON FUNCTION public.get_social_recovery_http_context(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bind_social_auth_principal_from_attempt(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_transaction_bound_broker_code_issuance_context(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_recovery_http_context(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_social_auth_principal_from_attempt(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_transaction_bound_broker_code_issuance_context(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_transaction_bound_broker_authorization_code(uuid,uuid,bytea,bigint,text,bytea,bytea,bytea,integer) TO service_role;

COMMENT ON FUNCTION public.bind_social_auth_principal_from_attempt(uuid,uuid) IS 'PHASE 10P post-OIDC binding: consumed trusted attempt plus matching Supabase auth.identities subject; no browser account identifier.';
COMMIT;
