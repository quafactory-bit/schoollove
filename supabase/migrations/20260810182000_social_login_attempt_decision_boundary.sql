-- PHASE 10O-G: additive attempt-first, feature-off social account decision boundary.
BEGIN;

-- This migration extends only the audited PHASE 10O-F private schema.  It
-- never creates an Auth user, exposes an HTTP route, or adopts existing data.
DO $$
BEGIN
  IF to_regclass('private.private_accounts') IS NULL
    OR to_regclass('private.social_identity_registry') IS NULL
    OR to_regclass('private.recovery_email_verifications') IS NULL THEN
    RAISE EXCEPTION 'PHASE10O_G_BASELINE_MISSING';
  END IF;
  IF to_regclass('private.oauth_login_attempts') IS NOT NULL
    OR to_regprocedure('public.record_verified_social_identity(uuid,text,text,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.consume_recovery_and_decide_social_account(uuid,uuid,bytea)') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE10O_G_OBJECT_COLLISION';
  END IF;
END $$;

CREATE TABLE private.oauth_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_attempt_id text NOT NULL UNIQUE CHECK (safe_attempt_id ~ '^att_[A-Za-z0-9_-]{16,64}$'),
  provider text NOT NULL CHECK (provider IN ('kakao','naver','google')),
  state text NOT NULL CHECK (state IN (
    'created','upstream_verified','recovery_required','recovery_pending','recovery_verified',
    'account_decided','existing_primary','existing_account_match','auth_principal_bound',
    'broker_code_ready','consumed','cancelled','expired','provider_mismatch','replay_rejected',
    'launch_blocked','failed_safe'
  )),
  broker_subject text NULL CHECK (broker_subject IS NULL OR broker_subject ~ '^slb:v1:k[0-9]{2}:(kakao|naver|google):[A-Za-z0-9_-]{43}$'),
  subject_digest bytea NULL CHECK (subject_digest IS NULL OR octet_length(subject_digest)=32),
  subject_key_version smallint NULL CHECK (subject_key_version BETWEEN 1 AND 99),
  recovery_failed_attempts smallint NOT NULL DEFAULT 0 CHECK (recovery_failed_attempts BETWEEN 0 AND 5),
  account_id uuid NULL REFERENCES private.private_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '10 minutes',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_at timestamptz NULL,
  coarse_terminal_reason text NULL CHECK (coarse_terminal_reason IS NULL OR coarse_terminal_reason IN ('cancelled','expired','provider_mismatch','replay_rejected','launch_blocked','failed_safe')),
  version integer NOT NULL DEFAULT 0 CHECK (version>=0),
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
  -- Broker identity is always an atomic, provider/key-version-bound tuple.
  CHECK ((broker_subject IS NULL)=(subject_digest IS NULL) AND (broker_subject IS NULL)=(subject_key_version IS NULL)),
  CHECK (broker_subject IS NULL OR split_part(broker_subject,':',4)=provider),
  CHECK (broker_subject IS NULL OR split_part(broker_subject,':',3)='k'||lpad(subject_key_version::text,2,'0')),
  -- created is pre-upstream.  The listed post-upstream states retain identity;
  -- generic terminals may be reached before or after upstream verification.
  CHECK (state<>'created' OR broker_subject IS NULL),
  CHECK (state NOT IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified','account_decided','existing_primary','existing_account_match','auth_principal_bound','broker_code_ready','consumed') OR broker_subject IS NOT NULL),
  -- Account-bearing lifecycle states require the verified tuple.  Cross-provider
  -- existing_account_match deliberately remains identity-only and unlinked.
  CHECK (state NOT IN ('account_decided','auth_principal_bound','broker_code_ready','consumed','existing_primary') OR account_id IS NOT NULL),
  CHECK (state NOT IN ('created','upstream_verified','recovery_required','recovery_pending','recovery_verified','existing_account_match') OR account_id IS NULL),
  CHECK (account_id IS NULL OR broker_subject IS NOT NULL),
  CHECK ((state='consumed') = (consumed_at IS NOT NULL)),
  CHECK ((state IN ('cancelled','expired','provider_mismatch','replay_rejected','launch_blocked','failed_safe')) = (coarse_terminal_reason IS NOT NULL))
);
CREATE UNIQUE INDEX oauth_login_attempts_live_subject_unique ON private.oauth_login_attempts(broker_subject)
  WHERE state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified');

ALTER TABLE private.recovery_email_verifications ADD COLUMN login_attempt_id uuid NULL REFERENCES private.oauth_login_attempts(id) ON DELETE CASCADE;
ALTER TABLE private.recovery_email_verifications ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE private.recovery_email_verifications ADD CONSTRAINT recovery_email_verifications_owner_binding CHECK ((account_id IS NULL) <> (login_attempt_id IS NULL));
ALTER TABLE private.recovery_email_verifications DROP CONSTRAINT recovery_email_verifications_purpose_check;
ALTER TABLE private.recovery_email_verifications ADD CONSTRAINT recovery_email_verifications_purpose_check CHECK (purpose IN ('activation','change','cross_provider_check','recovery_assistance','login_decision'));
DROP INDEX private.recovery_email_verifications_one_pending_per_account_purpose;
CREATE UNIQUE INDEX recovery_email_verifications_one_pending_per_owner_purpose
  ON private.recovery_email_verifications(COALESCE(account_id,login_attempt_id),purpose) WHERE status='pending';

CREATE FUNCTION private.require_social_attempt_service()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_SERVICE_ROLE_REQUIRED'; END IF;
END $$;

CREATE FUNCTION private.transition_login_attempt(target_id uuid, expected_states text[], next_state text, target_account_id uuid DEFAULT NULL, terminal_reason text DEFAULT NULL)
RETURNS private.oauth_login_attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE;
BEGIN
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_id FOR UPDATE;
  IF attempt.id IS NULL OR attempt.state<>ALL(expected_states) THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_TRANSITION_REJECTED'; END IF;
  IF attempt.expires_at<=clock_timestamp() AND next_state<>'expired' THEN
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=clock_timestamp(),version=version+1 WHERE id=target_id;
    RAISE EXCEPTION 'SOCIAL_ATTEMPT_EXPIRED';
  END IF;
  UPDATE private.oauth_login_attempts SET state=next_state,account_id=COALESCE(target_account_id,account_id),coarse_terminal_reason=terminal_reason,
    consumed_at=CASE WHEN next_state='consumed' THEN clock_timestamp() ELSE consumed_at END,updated_at=clock_timestamp(),version=version+1
    WHERE id=target_id RETURNING * INTO attempt;
  RETURN attempt;
END $$;

CREATE FUNCTION public.create_social_login_attempt(requested_safe_attempt_id text,requested_provider text,requested_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt_id uuid;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF requested_provider NOT IN ('kakao','naver','google') OR requested_safe_attempt_id !~ '^att_[A-Za-z0-9_-]{16,64}$'
    OR requested_expires_at<=clock_timestamp() OR requested_expires_at>clock_timestamp()+interval '10 minutes' THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_CREATE_REJECTED'; END IF;
  INSERT INTO private.oauth_login_attempts(safe_attempt_id,provider,state,expires_at) VALUES(requested_safe_attempt_id,requested_provider,'created',requested_expires_at) RETURNING id INTO attempt_id;
  RETURN attempt_id;
END $$;

CREATE FUNCTION public.record_verified_social_identity(target_attempt_id uuid,requested_provider text,requested_broker_subject text,requested_subject_digest bytea,requested_subject_key_version integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; existing private.social_identity_registry%ROWTYPE; competing_attempt_id uuid; violation_constraint text;
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR attempt.state<>'created' OR attempt.provider<>requested_provider OR attempt.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_IDENTITY_REJECTED'; END IF;
  IF requested_provider NOT IN ('kakao','naver','google') OR requested_broker_subject !~ ('^slb:v1:k[0-9]{2}:'||requested_provider||':[A-Za-z0-9_-]{43}$')
    OR split_part(requested_broker_subject,':',3)<>'k'||lpad(requested_subject_key_version::text,2,'0') OR octet_length(requested_subject_digest)<>32 OR requested_subject_key_version NOT BETWEEN 1 AND 99
    OR split_part(requested_broker_subject,':',5)<>replace(replace(replace(encode(requested_subject_digest,'base64'),'+','-'),'/','_'),'=','') THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_IDENTITY_INVALID'; END IF;
  -- Identity recording acquires broker only; any later decision path keeps the
  -- frozen recovery-lock then broker-lock order and never takes the reverse.
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:broker-decision:v1:'||requested_provider||':'||requested_subject_key_version::text||':'||encode(requested_subject_digest,'hex'),0));
  SELECT r.* INTO existing FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id WHERE r.broker_subject=requested_broker_subject AND r.status='active' AND a.status='active' AND a.primary_provider=requested_provider AND a.primary_broker_subject=requested_broker_subject;
  IF existing.account_id IS NOT NULL THEN
    UPDATE private.oauth_login_attempts SET state='existing_primary',broker_subject=requested_broker_subject,subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,account_id=existing.account_id,updated_at=clock_timestamp(),version=version+1 WHERE id=target_attempt_id;
    RETURN 'EXISTING_PRIMARY';
  END IF;
  IF EXISTS(SELECT 1 FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id WHERE r.broker_subject=requested_broker_subject AND r.status='provisional' AND a.status='provisional') THEN
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=target_attempt_id;
    RETURN 'IDENTITY_DECISION_IN_PROGRESS';
  END IF;
  SELECT id INTO competing_attempt_id FROM private.oauth_login_attempts WHERE id<>target_attempt_id AND provider=requested_provider AND broker_subject=requested_broker_subject AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified') FOR KEY SHARE LIMIT 1;
  IF competing_attempt_id IS NOT NULL THEN
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=target_attempt_id;
    RETURN 'IDENTITY_DECISION_IN_PROGRESS';
  END IF;
  BEGIN
    UPDATE private.oauth_login_attempts SET state='upstream_verified',broker_subject=requested_broker_subject,subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,updated_at=clock_timestamp(),version=version+1 WHERE id=target_attempt_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
    IF violation_constraint<>'oauth_login_attempts_live_subject_unique' THEN RAISE; END IF;
    SELECT id INTO competing_attempt_id FROM private.oauth_login_attempts WHERE id<>target_attempt_id AND provider=requested_provider AND broker_subject=requested_broker_subject AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified') FOR KEY SHARE LIMIT 1;
    IF competing_attempt_id IS NULL THEN RAISE; END IF;
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=target_attempt_id;
    RETURN 'IDENTITY_DECISION_IN_PROGRESS';
  END;
  UPDATE private.oauth_login_attempts SET state='recovery_required',updated_at=clock_timestamp(),version=version+1 WHERE id=target_attempt_id;
  RETURN 'RECOVERY_REQUIRED';
END $$;

CREATE FUNCTION public.create_login_attempt_recovery_verification(target_attempt_id uuid,requested_hmac bytea,requested_hmac_key_version integer,requested_ciphertext bytea,requested_nonce bytea,requested_encryption_key_version integer,requested_otp_mac bytea,requested_otp_key_version integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE verification_id uuid; attempt private.oauth_login_attempts%ROWTYPE; issued_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR attempt.state NOT IN ('upstream_verified','recovery_required','recovery_pending') OR attempt.account_id IS NOT NULL OR attempt.expires_at<=issued_at OR attempt.recovery_failed_attempts>=5
    OR octet_length(requested_hmac)<>32 OR octet_length(requested_ciphertext)<=16 OR octet_length(requested_nonce)<>12 OR octet_length(requested_otp_mac)<>32
    OR requested_hmac_key_version NOT BETWEEN 1 AND 32767 OR requested_encryption_key_version NOT BETWEEN 1 AND 32767 OR requested_otp_key_version NOT BETWEEN 1 AND 32767 THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_RECOVERY_CREATE_REJECTED'; END IF;
  -- The attempt row is locked above.  A resend may only supersede its own pending
  -- challenge; terminal attempts are never reset to recovery_required.
  UPDATE private.recovery_email_verifications SET status='revoked',revoked_at=issued_at WHERE login_attempt_id=target_attempt_id AND purpose='login_decision' AND status='pending';
  INSERT INTO private.recovery_email_verifications(login_attempt_id,purpose,recovery_email_hmac,hmac_key_version,destination_ciphertext,destination_nonce,encryption_key_version,otp_mac,otp_key_version,created_at,expires_at)
  VALUES(target_attempt_id,'login_decision',requested_hmac,requested_hmac_key_version,requested_ciphertext,requested_nonce,requested_encryption_key_version,requested_otp_mac,requested_otp_key_version,issued_at,LEAST(attempt.expires_at,issued_at+interval '10 minutes')) RETURNING id INTO verification_id;
  UPDATE private.oauth_login_attempts SET state='recovery_pending',updated_at=issued_at,version=version+1 WHERE id=target_attempt_id;
  RETURN verification_id;
END $$;

CREATE FUNCTION public.consume_recovery_and_decide_social_account(target_attempt_id uuid,target_verification_id uuid,submitted_otp_mac bytea)
RETURNS TABLE(outcome text,primary_provider text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; verification private.recovery_email_verifications%ROWTYPE; matched private.private_accounts%ROWTYPE; identity private.social_identity_registry%ROWTYPE; new_account_id uuid;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF octet_length(submitted_otp_mac)<>32 THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_OTP_INVALID'; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO verification FROM private.recovery_email_verifications WHERE id=target_verification_id FOR UPDATE;
  IF attempt.id IS NULL OR verification.id IS NULL OR verification.login_attempt_id<>attempt.id OR attempt.state NOT IN ('recovery_pending','recovery_required') OR verification.status<>'pending' THEN RAISE EXCEPTION 'SOCIAL_ATTEMPT_DECISION_REJECTED'; END IF;
  IF attempt.expires_at<=clock_timestamp() OR verification.expires_at<=clock_timestamp() THEN UPDATE private.recovery_email_verifications SET status='expired' WHERE id=verification.id; UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'EXPIRED'::text,NULL::text; RETURN; END IF;
  IF verification.otp_mac<>submitted_otp_mac THEN
    UPDATE private.oauth_login_attempts SET recovery_failed_attempts=recovery_failed_attempts+1,updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id RETURNING recovery_failed_attempts INTO attempt.recovery_failed_attempts;
    UPDATE private.recovery_email_verifications SET failed_attempts=failed_attempts+1,status=CASE WHEN attempt.recovery_failed_attempts>=5 THEN 'locked' ELSE 'pending' END WHERE id=verification.id;
    RETURN QUERY SELECT CASE WHEN attempt.recovery_failed_attempts>=5 THEN 'LOCKED' ELSE 'OTP_REJECTED' END,NULL::text; RETURN;
  END IF;
  -- Fixed order: recovery domain before broker domain. Hash collision only serializes;
  -- correctness always comes from the committed-state re-read below.
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:recovery-decision:v1:'||verification.hmac_key_version::text||':'||encode(verification.recovery_email_hmac,'hex'),0));
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:broker-decision:v1:'||attempt.provider||':'||attempt.subject_key_version::text||':'||encode(attempt.subject_digest,'hex'),0));
  SELECT * INTO identity FROM private.social_identity_registry WHERE broker_subject=attempt.broker_subject FOR UPDATE;
  IF identity.broker_subject IS NOT NULL THEN
    SELECT * INTO matched FROM private.private_accounts WHERE id=identity.account_id FOR UPDATE;
    UPDATE private.recovery_email_verifications SET status='consumed',consumed_at=clock_timestamp() WHERE id=verification.id;
    IF identity.status='active' AND matched.status='active' AND matched.primary_provider=attempt.provider AND matched.primary_broker_subject=attempt.broker_subject THEN
      UPDATE private.oauth_login_attempts SET state='existing_primary',account_id=matched.id,updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id;
      RETURN QUERY SELECT 'EXISTING_PRIMARY'::text,matched.primary_provider; RETURN;
    ELSIF identity.status='provisional' AND matched.status='provisional' THEN
      UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id;
      RETURN QUERY SELECT 'IDENTITY_DECISION_IN_PROGRESS'::text,NULL::text; RETURN;
    ELSE
      UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id;
      RETURN QUERY SELECT 'ACCOUNT_UNAVAILABLE'::text,NULL::text; RETURN;
    END IF;
  END IF;
  SELECT * INTO matched FROM private.private_accounts WHERE recovery_email_hmac=verification.recovery_email_hmac AND recovery_email_hmac_key_version=verification.hmac_key_version AND recovery_email_verified_at IS NOT NULL AND status IN ('provisional','active','deletion_pending','cleanup_failed_safe') FOR UPDATE;
  UPDATE private.recovery_email_verifications SET status='consumed',consumed_at=clock_timestamp() WHERE id=verification.id;
  IF matched.id IS NOT NULL THEN
    IF matched.status='active' THEN UPDATE private.oauth_login_attempts SET state='existing_account_match',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'USE_PRIMARY_PROVIDER'::text,matched.primary_provider; RETURN;
    ELSIF matched.status='provisional' THEN UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'ACCOUNT_DECISION_IN_PROGRESS'::text,NULL::text; RETURN;
    ELSE UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id; RETURN QUERY SELECT 'ACCOUNT_UNAVAILABLE'::text,NULL::text; RETURN; END IF;
  END IF;
  PERFORM set_config('private.social_transition','approved',true);
  INSERT INTO private.private_accounts(status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at)
  VALUES('provisional',attempt.provider,attempt.broker_subject,verification.recovery_email_hmac,verification.hmac_key_version,verification.destination_ciphertext,verification.destination_nonce,verification.encryption_key_version,clock_timestamp()) RETURNING id INTO new_account_id;
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,status) VALUES(attempt.broker_subject,attempt.provider,attempt.subject_digest,attempt.subject_key_version,new_account_id,'provisional');
  UPDATE private.oauth_login_attempts SET state='account_decided',account_id=new_account_id,updated_at=clock_timestamp(),version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT 'ACCOUNT_DECIDED'::text,attempt.provider;
END $$;

-- Retire the direct pre-recovery creation boundary without dropping its known signature.
REVOKE EXECUTE ON FUNCTION public.create_provisional_social_account(text,text,bytea,integer) FROM service_role;

CREATE OR REPLACE FUNCTION public.bind_social_auth_principal(target_account_id uuid,target_auth_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account private.private_accounts%ROWTYPE;
BEGIN
  PERFORM private.require_social_service();
  SELECT * INTO account FROM private.private_accounts WHERE id=target_account_id FOR UPDATE;
  IF account.id IS NULL OR account.status<>'provisional' OR account.auth_user_id IS NOT NULL OR account.recovery_email_verified_at IS NULL OR account.recovery_email_hmac IS NULL OR account.recovery_email_ciphertext IS NULL OR account.recovery_email_nonce IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target_auth_user_id) OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE account_id=target_account_id AND state='account_decided' AND provider=account.primary_provider AND broker_subject=account.primary_broker_subject) THEN RAISE EXCEPTION 'SOCIAL_PRINCIPAL_BINDING_RECOVERY_DECISION_REQUIRED'; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET auth_user_id=target_auth_user_id WHERE id=target_account_id;
  UPDATE private.social_identity_registry SET auth_user_id=target_auth_user_id WHERE account_id=target_account_id;
  UPDATE private.oauth_login_attempts SET state='auth_principal_bound',updated_at=clock_timestamp(),version=version+1 WHERE account_id=target_account_id AND state='account_decided';
  RETURN true;
END $$;

ALTER TABLE private.oauth_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.oauth_login_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.oauth_login_attempts FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.require_social_attempt_service() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.transition_login_attempt(uuid,text[],text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_social_login_attempt(text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_verified_social_identity(uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_login_attempt_recovery_verification(uuid,bytea,integer,bytea,bytea,integer,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.consume_recovery_and_decide_social_account(uuid,uuid,bytea) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_social_login_attempt(text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_social_identity(uuid,text,text,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_login_attempt_recovery_verification(uuid,bytea,integer,bytea,bytea,integer,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_recovery_and_decide_social_account(uuid,uuid,bytea) TO service_role;
COMMENT ON TABLE private.oauth_login_attempts IS 'PHASE 10O-G durable, safe-id-only attempt-first decision state; no raw subject, email, token, OTP, callback, profile, or Auth principal data.';
COMMIT;
