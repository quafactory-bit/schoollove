-- PHASE 10O-N: opaque OAuth state is the only browser-visible callback correlation bearer. Feature-off.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.upstream_login_legs') IS NULL
    OR to_regprocedure('public.create_upstream_login_leg(uuid,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer)') IS NULL
    OR to_regprocedure('public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea)') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_N_BASELINE_MISSING';
  END IF;
  IF to_regprocedure('public.claim_upstream_login_callback_by_state(text,bytea,bytea)') IS NOT NULL
    OR to_regclass('private.upstream_login_legs_pending_state_digest_unique') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10O_N_OBJECT_COLLISION';
  END IF;
END $$;

CREATE UNIQUE INDEX upstream_login_legs_pending_state_digest_unique
  ON private.upstream_login_legs(state_digest)
  WHERE status='pending' AND state_digest IS NOT NULL;

-- Replaces only the known 10O-M function so state-index collisions are never
-- misreported as per-attempt leg reuse.
CREATE OR REPLACE FUNCTION public.create_upstream_login_leg(
  target_attempt_id uuid, requested_leg_id uuid, requested_provider text,
  requested_client_binding_digest bytea, requested_state_digest bytea, requested_nonce_digest bytea,
  requested_pkce_s256_challenge text, requested_pkce_verifier_ciphertext bytea,
  requested_pkce_verifier_iv bytea, requested_pkce_verifier_key_version integer
) RETURNS TABLE(outcome text,leg_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp(); final_expiry timestamptz; violation_constraint text;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR attempt.state<>'created' OR attempt.provider<>requested_provider OR requested_leg_id IS NULL
    OR requested_client_binding_digest IS NULL OR octet_length(requested_client_binding_digest)<>32
    OR requested_state_digest IS NULL OR octet_length(requested_state_digest)<>32 THEN
    RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_CREATE_REJECTED';
  END IF;
  IF attempt.expires_at<=now_at THEN
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'EXPIRED'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  IF (requested_provider='naver' AND (requested_nonce_digest IS NOT NULL OR requested_pkce_s256_challenge IS NOT NULL OR requested_pkce_verifier_ciphertext IS NOT NULL OR requested_pkce_verifier_iv IS NOT NULL OR requested_pkce_verifier_key_version IS NOT NULL))
    OR (requested_provider IN ('kakao','google') AND (requested_nonce_digest IS NULL OR octet_length(requested_nonce_digest)<>32 OR requested_pkce_s256_challenge !~ '^[A-Za-z0-9_-]{43}$' OR requested_pkce_verifier_ciphertext IS NULL OR octet_length(requested_pkce_verifier_ciphertext)<=16 OR requested_pkce_verifier_iv IS NULL OR octet_length(requested_pkce_verifier_iv)<>12 OR requested_pkce_verifier_key_version NOT BETWEEN 1 AND 32767)) THEN
    RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_CRYPTO_REJECTED';
  END IF;
  IF EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE login_attempt_id=attempt.id) THEN
    RETURN QUERY SELECT 'LEG_ALREADY_EXISTS'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  final_expiry:=LEAST(attempt.expires_at,now_at+interval '10 minutes');
  BEGIN
    INSERT INTO private.upstream_login_legs(id,login_attempt_id,provider,status,client_binding_digest,state_digest,nonce_digest,pkce_s256_challenge,pkce_verifier_ciphertext,pkce_verifier_iv,pkce_verifier_key_version,created_at,expires_at)
    VALUES(requested_leg_id,attempt.id,requested_provider,'pending',requested_client_binding_digest,requested_state_digest,requested_nonce_digest,requested_pkce_s256_challenge,requested_pkce_verifier_ciphertext,requested_pkce_verifier_iv,requested_pkce_verifier_key_version,now_at,final_expiry);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
    IF violation_constraint='upstream_login_legs_login_attempt_id_key' THEN
      RETURN QUERY SELECT 'LEG_ALREADY_EXISTS'::text,NULL::uuid,NULL::timestamptz; RETURN;
    END IF;
    IF violation_constraint='upstream_login_legs_pending_state_digest_unique' THEN
      RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_STATE_COLLISION';
    END IF;
    RAISE;
  END;
  UPDATE private.oauth_login_attempts SET state='upstream_pending',updated_at=now_at,version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT 'UPSTREAM_LEG_CREATED'::text,requested_leg_id,final_expiry;
END $$;

CREATE FUNCTION public.claim_upstream_login_callback_by_state(
  requested_provider text, requested_client_binding_digest bytea, submitted_state_digest bytea
) RETURNS TABLE(outcome text,attempt_id uuid,leg_id uuid,provider text,nonce_digest bytea,pkce_s256_challenge text,pkce_verifier_ciphertext bytea,pkce_verifier_iv bytea,pkce_verifier_key_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate_attempt_id uuid; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF requested_provider NOT IN ('kakao','naver','google') OR submitted_state_digest IS NULL OR octet_length(submitted_state_digest)<>32 THEN
    RETURN QUERY SELECT 'CORRELATION_REJECTED'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  -- Candidate discovery intentionally takes no row lock. The canonical locks below
  -- are always attempt first, then its leg, followed by authoritative re-read.
  SELECT login_attempt_id INTO candidate_attempt_id FROM private.upstream_login_legs
    WHERE status='pending' AND state_digest=submitted_state_digest LIMIT 1;
  IF candidate_attempt_id IS NULL THEN
    RETURN QUERY SELECT 'CORRELATION_REJECTED'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=candidate_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE login_attempt_id=candidate_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL OR leg.status<>'pending' OR leg.state_digest IS DISTINCT FROM submitted_state_digest OR attempt.state<>'upstream_pending' THEN
    RETURN QUERY SELECT 'CORRELATION_REJECTED'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  IF attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'expired',now_at);
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'EXPIRED'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  IF attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
    UPDATE private.oauth_login_attempts SET state='provider_mismatch',coarse_terminal_reason='provider_mismatch',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'PROVIDER_MISMATCH'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  IF requested_client_binding_digest IS NULL OR octet_length(requested_client_binding_digest)<>32 OR leg.client_binding_digest<>requested_client_binding_digest THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'CLIENT_BINDING_REJECTED'::text,NULL::uuid,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  UPDATE private.upstream_login_legs SET status='callback_claimed',state_digest=NULL,callback_claimed_at=now_at,version=version+1 WHERE id=leg.id;
  RETURN QUERY SELECT 'CALLBACK_CLAIMED'::text,attempt.id,leg.id,leg.provider,leg.nonce_digest,leg.pkce_s256_challenge,leg.pkce_verifier_ciphertext,leg.pkce_verifier_iv,leg.pkce_verifier_key_version::integer;
END $$;

REVOKE ALL ON FUNCTION public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.claim_upstream_login_callback_by_state(text,bytea,bytea) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upstream_login_callback_by_state(text,bytea,bytea) TO service_role;

COMMENT ON FUNCTION public.claim_upstream_login_callback_by_state(text,bytea,bytea) IS 'PHASE 10O-N service-only callback correlation: opaque raw OAuth state is hashed server-side; browser IDs are never accepted.';
COMMIT;
