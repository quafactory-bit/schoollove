-- PHASE 10O-M: durable, resumable upstream browser-redirect leg.  Feature-off.
BEGIN;

DO $$
BEGIN
  IF to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regprocedure('public.record_verified_social_identity(uuid,text,text,bytea,integer)') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_M_BASELINE_MISSING';
  END IF;
  IF to_regclass('private.upstream_login_legs') IS NOT NULL
    OR to_regprocedure('public.create_upstream_login_leg(uuid,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea)') IS NOT NULL
    OR to_regprocedure('public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10O_M_OBJECT_COLLISION';
  END IF;
END $$;

ALTER TABLE private.oauth_login_attempts DROP CONSTRAINT oauth_login_attempts_state_check;
ALTER TABLE private.oauth_login_attempts ADD CONSTRAINT oauth_login_attempts_state_check CHECK (state IN (
  'created','upstream_pending','upstream_verified','recovery_required','recovery_pending','recovery_verified',
  'account_decided','existing_primary','existing_account_match','auth_principal_bound','broker_code_ready','consumed',
 'cancelled','expired','provider_mismatch','replay_rejected','launch_blocked','failed_safe'
));
ALTER TABLE private.oauth_login_attempts ADD CONSTRAINT oauth_login_attempts_upstream_pending_identity_clear
  CHECK (state<>'upstream_pending' OR (broker_subject IS NULL AND subject_digest IS NULL AND subject_key_version IS NULL AND account_id IS NULL));

CREATE TABLE private.upstream_login_legs (
  id uuid PRIMARY KEY,
  login_attempt_id uuid NOT NULL UNIQUE REFERENCES private.oauth_login_attempts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('kakao','naver','google')),
  status text NOT NULL CHECK (status IN ('pending','callback_claimed','verified','rejected','expired')),
  client_binding_digest bytea NOT NULL CHECK (octet_length(client_binding_digest)=32),
  state_digest bytea NULL CHECK (state_digest IS NULL OR octet_length(state_digest)=32),
  nonce_digest bytea NULL CHECK (nonce_digest IS NULL OR octet_length(nonce_digest)=32),
  pkce_s256_challenge text NULL CHECK (pkce_s256_challenge IS NULL OR pkce_s256_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  pkce_verifier_ciphertext bytea NULL CHECK (pkce_verifier_ciphertext IS NULL OR octet_length(pkce_verifier_ciphertext)>16),
  pkce_verifier_iv bytea NULL CHECK (pkce_verifier_iv IS NULL OR octet_length(pkce_verifier_iv)=12),
  pkce_verifier_key_version smallint NULL CHECK (pkce_verifier_key_version BETWEEN 1 AND 32767),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  callback_claimed_at timestamptz NULL,
  terminal_at timestamptz NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  CHECK (expires_at>created_at),
  CHECK ((pkce_s256_challenge IS NULL)=(pkce_verifier_ciphertext IS NULL)
    AND (pkce_s256_challenge IS NULL)=(pkce_verifier_iv IS NULL)
    AND (pkce_s256_challenge IS NULL)=(pkce_verifier_key_version IS NULL)),
  CHECK (status IN ('verified','rejected','expired') OR (provider='naver' AND nonce_digest IS NULL AND pkce_s256_challenge IS NULL) OR (provider IN ('kakao','google') AND nonce_digest IS NOT NULL AND pkce_s256_challenge IS NOT NULL)),
  CHECK ((status='pending') = (state_digest IS NOT NULL AND callback_claimed_at IS NULL AND terminal_at IS NULL)),
  CHECK ((status='callback_claimed') = (state_digest IS NULL AND callback_claimed_at IS NOT NULL AND terminal_at IS NULL)),
  CHECK ((status IN ('verified','rejected','expired')) = (
    state_digest IS NULL AND nonce_digest IS NULL AND pkce_s256_challenge IS NULL AND pkce_verifier_ciphertext IS NULL
    AND pkce_verifier_iv IS NULL AND pkce_verifier_key_version IS NULL AND terminal_at IS NOT NULL
  ))
);
ALTER TABLE private.upstream_login_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.upstream_login_legs FORCE ROW LEVEL SECURITY;

CREATE FUNCTION private.scrub_upstream_login_leg(target_leg_id uuid, next_status text, at_time timestamptz DEFAULT clock_timestamp())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE private.upstream_login_legs
  SET status=next_status,state_digest=NULL,nonce_digest=NULL,pkce_s256_challenge=NULL,
      pkce_verifier_ciphertext=NULL,pkce_verifier_iv=NULL,pkce_verifier_key_version=NULL,
      terminal_at=at_time,version=version+1
  WHERE id=target_leg_id;
END $$;

CREATE FUNCTION public.create_upstream_login_leg(
  target_attempt_id uuid, requested_leg_id uuid, requested_provider text,
  requested_client_binding_digest bytea, requested_state_digest bytea, requested_nonce_digest bytea,
  requested_pkce_s256_challenge text, requested_pkce_verifier_ciphertext bytea,
  requested_pkce_verifier_iv bytea, requested_pkce_verifier_key_version integer
) RETURNS TABLE(outcome text,leg_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp(); final_expiry timestamptz;
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
    RETURN QUERY SELECT 'LEG_ALREADY_EXISTS'::text,NULL::uuid,NULL::timestamptz; RETURN;
  END;
  UPDATE private.oauth_login_attempts SET state='upstream_pending',updated_at=now_at,version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT 'UPSTREAM_LEG_CREATED'::text,requested_leg_id,final_expiry;
END $$;

CREATE FUNCTION public.claim_upstream_login_callback(
  target_attempt_id uuid,target_leg_id uuid,requested_provider text,requested_client_binding_digest bytea,submitted_state_digest bytea
) RETURNS TABLE(outcome text,leg_id uuid,provider text,nonce_digest bytea,pkce_s256_challenge text,pkce_verifier_ciphertext bytea,pkce_verifier_iv bytea,pkce_verifier_key_version integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp(); state_mismatch boolean; client_mismatch boolean;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL THEN RETURN QUERY SELECT 'REPLAY_REJECTED'::text,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  IF leg.status<>'pending' THEN RETURN QUERY SELECT 'REPLAY_REJECTED'::text,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN; END IF;
  IF attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'expired',now_at);
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'EXPIRED'::text,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  IF attempt.state<>'upstream_pending' OR attempt.provider<>requested_provider OR leg.provider<>requested_provider THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
    UPDATE private.oauth_login_attempts SET state='provider_mismatch',coarse_terminal_reason='provider_mismatch',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'PROVIDER_MISMATCH'::text,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  client_mismatch:=requested_client_binding_digest IS NULL OR octet_length(requested_client_binding_digest)<>32 OR leg.client_binding_digest<>requested_client_binding_digest;
  state_mismatch:=submitted_state_digest IS NULL OR octet_length(submitted_state_digest)<>32 OR leg.state_digest<>submitted_state_digest;
  IF client_mismatch OR state_mismatch THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT CASE WHEN client_mismatch THEN 'CLIENT_BINDING_REJECTED' ELSE 'STATE_REJECTED' END,NULL::uuid,NULL::text,NULL::bytea,NULL::text,NULL::bytea,NULL::bytea,NULL::integer; RETURN;
  END IF;
  UPDATE private.upstream_login_legs SET status='callback_claimed',state_digest=NULL,callback_claimed_at=now_at,version=version+1 WHERE id=leg.id;
  RETURN QUERY SELECT 'CALLBACK_CLAIMED'::text,leg.id,leg.provider,leg.nonce_digest,leg.pkce_s256_challenge,leg.pkce_verifier_ciphertext,leg.pkce_verifier_iv,leg.pkce_verifier_key_version::integer;
END $$;

CREATE FUNCTION public.fail_upstream_login_leg(target_attempt_id uuid,target_leg_id uuid,reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF reason NOT IN ('provider_failure','identity_failure','expired') THEN RAISE EXCEPTION 'UPSTREAM_LOGIN_LEG_FAILURE_REJECTED'; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL OR leg.status<>'callback_claimed' THEN RETURN 'REPLAY_REJECTED'; END IF;
  IF reason='expired' OR attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'expired',now_at); UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1 WHERE id=attempt.id; RETURN 'EXPIRED';
  END IF;
  PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at); UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=attempt.id; RETURN 'REJECTED';
END $$;

CREATE FUNCTION public.record_verified_social_identity_from_upstream_leg(
  target_attempt_id uuid,target_leg_id uuid,requested_provider text,requested_broker_subject text,requested_subject_digest bytea,requested_subject_key_version integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; existing private.social_identity_registry%ROWTYPE; competing uuid; now_at timestamptz:=clock_timestamp(); violation_constraint text;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR leg.id IS NULL OR attempt.state<>'upstream_pending' OR leg.status<>'callback_claimed' THEN RETURN 'IDENTITY_REJECTED'; END IF;
  IF attempt.provider<>requested_provider OR leg.provider<>requested_provider OR attempt.expires_at<=now_at OR leg.expires_at<=now_at OR requested_broker_subject !~ ('^slb:v1:k[0-9]{2}:'||requested_provider||':[A-Za-z0-9_-]{43}$') OR requested_subject_key_version NOT BETWEEN 1 AND 99 OR requested_subject_digest IS NULL OR octet_length(requested_subject_digest)<>32 OR split_part(requested_broker_subject,':',3)<>'k'||lpad(requested_subject_key_version::text,2,'0') OR split_part(requested_broker_subject,':',5)<>replace(replace(replace(encode(requested_subject_digest,'base64'),'+','-'),'/','_'),'=','') THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,CASE WHEN attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'expired' ELSE 'rejected' END,now_at);
    UPDATE private.oauth_login_attempts SET state=CASE WHEN attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'expired' ELSE 'failed_safe' END,coarse_terminal_reason=CASE WHEN attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'expired' ELSE 'failed_safe' END,updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN CASE WHEN attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'EXPIRED' ELSE 'IDENTITY_REJECTED' END;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:broker-decision:v1:'||requested_provider||':'||requested_subject_key_version::text||':'||encode(requested_subject_digest,'hex'),0));
  SELECT r.* INTO existing FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id WHERE r.broker_subject=requested_broker_subject AND r.status='active' AND a.status='active' AND a.primary_provider=requested_provider AND a.primary_broker_subject=requested_broker_subject;
  IF existing.account_id IS NOT NULL THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at); UPDATE private.oauth_login_attempts SET state='existing_primary',broker_subject=requested_broker_subject,subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,account_id=existing.account_id,updated_at=now_at,version=version+1 WHERE id=attempt.id; RETURN 'EXISTING_PRIMARY';
  END IF;
  IF EXISTS(SELECT 1 FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id WHERE r.broker_subject=requested_broker_subject AND r.status='provisional' AND a.status='provisional') OR EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id<>attempt.id AND provider=requested_provider AND broker_subject=requested_broker_subject AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')) THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at); UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=attempt.id; RETURN 'IDENTITY_DECISION_IN_PROGRESS';
  END IF;
  UPDATE private.oauth_login_attempts SET state='upstream_verified',broker_subject=requested_broker_subject,subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  UPDATE private.oauth_login_attempts SET state='recovery_required',updated_at=now_at,version=version+1 WHERE id=attempt.id;
  PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
  RETURN 'RECOVERY_REQUIRED';
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
  IF violation_constraint<>'oauth_login_attempts_live_subject_unique' THEN RAISE; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts x WHERE x.id<>target_attempt_id AND x.provider=requested_provider AND x.broker_subject=requested_broker_subject AND x.state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified')) THEN RAISE; END IF;
  PERFORM private.scrub_upstream_login_leg(target_leg_id,'rejected',now_at); UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1 WHERE id=target_attempt_id; RETURN 'IDENTITY_DECISION_IN_PROGRESS';
END $$;

REVOKE ALL ON TABLE private.upstream_login_legs FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.scrub_upstream_login_leg(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_verified_social_identity(uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_upstream_login_leg(uuid,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_upstream_login_leg(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_upstream_login_leg(uuid,uuid,text,bytea,bytea,bytea,text,bytea,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_upstream_login_callback(uuid,uuid,text,bytea,bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_upstream_login_leg(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) TO service_role;
COMMENT ON TABLE private.upstream_login_legs IS 'PHASE 10O-M durable upstream redirect leg: state/nonce digests and encrypted PKCE verifier only; never raw state, nonce, verifier, authorization code, tokens, email, subject, or profile.';
COMMIT;
