-- PHASE 10O-F: additive, feature-off social-account identity and recovery-data boundary.
-- This forward migration is intentionally NOT a Production-application authorization.
BEGIN;

-- Fail before any permanent DDL or ACL change. This migration never adopts an
-- existing private schema or silently replaces an existing RPC/helper.
DO $$
DECLARE existing_role text;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='private') THEN RAISE EXCEPTION 'PHASE10O_F_PRIVATE_SCHEMA_COLLISION'; END IF;
  IF to_regclass('auth.users') IS NULL THEN RAISE EXCEPTION 'PHASE10O_F_AUTH_USERS_MISSING'; END IF;
  IF to_regclass('public.public_account_launch_control') IS NULL THEN RAISE EXCEPTION 'PHASE10O_F_LAUNCH_CONTROL_MISSING'; END IF;
  IF (SELECT count(*) FROM public.public_account_launch_control WHERE control_key='public_account')<>1 THEN RAISE EXCEPTION 'PHASE10O_F_LAUNCH_CONTROL_SINGLETON_INVALID'; END IF;
  FOREACH existing_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=existing_role) THEN RAISE EXCEPTION 'PHASE10O_F_REQUIRED_ROLE_MISSING_%',upper(existing_role); END IF;
  END LOOP;
  IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.role()') IS NULL OR to_regprocedure('gen_random_uuid()') IS NULL THEN RAISE EXCEPTION 'PHASE10O_F_REQUIRED_FUNCTION_MISSING'; END IF;
  IF to_regprocedure('public.create_provisional_social_account(text,text,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.bind_social_auth_principal(uuid,uuid)') IS NOT NULL
    OR to_regprocedure('public.create_recovery_email_verification(uuid,text,bytea,integer,bytea,bytea,integer,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.consume_recovery_email_verification(uuid,bytea)') IS NOT NULL
    OR to_regprocedure('public.activate_social_account(uuid)') IS NOT NULL
    OR to_regprocedure('public.get_social_account_state_for_owner()') IS NOT NULL
    OR to_regprocedure('public.revoke_social_identity_for_deletion(uuid)') IS NOT NULL
    OR to_regprocedure('public.enqueue_auth_principal_cleanup(uuid,uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'PHASE10O_F_PUBLIC_RPC_COLLISION'; END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN ('private_accounts_invariants','social_identity_registry_invariants','recovery_email_verifications_clear_terminal_material')) THEN RAISE EXCEPTION 'PHASE10O_F_TRIGGER_NAME_COLLISION'; END IF;
END $$;

CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.private_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('provisional','active','deletion_pending','cleanup_failed_safe')),
  primary_provider text NOT NULL CHECK (primary_provider IN ('kakao','naver','google')),
  primary_broker_subject text NOT NULL UNIQUE CHECK (
    primary_broker_subject ~ '^slb:v1:k[0-9]{2}:(kakao|naver|google):[A-Za-z0-9_-]{43}$'
    AND split_part(primary_broker_subject, ':', 4) = primary_provider
  ),
  recovery_email_hmac bytea NULL CHECK (recovery_email_hmac IS NULL OR octet_length(recovery_email_hmac)=32),
  recovery_email_hmac_key_version smallint NULL CHECK (recovery_email_hmac_key_version BETWEEN 1 AND 32767),
  recovery_email_ciphertext bytea NULL CHECK (recovery_email_ciphertext IS NULL OR octet_length(recovery_email_ciphertext)>16),
  recovery_email_nonce bytea NULL CHECK (recovery_email_nonce IS NULL OR octet_length(recovery_email_nonce)=12),
  recovery_email_encryption_key_version smallint NULL CHECK (recovery_email_encryption_key_version BETWEEN 1 AND 32767),
  recovery_email_verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  activated_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((recovery_email_hmac IS NULL) = (recovery_email_hmac_key_version IS NULL)),
  CHECK ((recovery_email_ciphertext IS NULL) = (recovery_email_nonce IS NULL)),
  CHECK ((recovery_email_ciphertext IS NULL) = (recovery_email_encryption_key_version IS NULL)),
  CHECK (status <> 'active' OR (
    auth_user_id IS NOT NULL
    AND recovery_email_hmac IS NOT NULL
    AND recovery_email_hmac_key_version IS NOT NULL
    AND recovery_email_ciphertext IS NOT NULL
    AND recovery_email_nonce IS NOT NULL
    AND recovery_email_encryption_key_version IS NOT NULL
    AND recovery_email_verified_at IS NOT NULL
    AND activated_at IS NOT NULL
  ))
);
CREATE UNIQUE INDEX private_accounts_auth_user_id_unique ON private.private_accounts(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE UNIQUE INDEX private_accounts_verified_recovery_hmac_unique
  ON private.private_accounts(recovery_email_hmac,recovery_email_hmac_key_version)
  WHERE recovery_email_verified_at IS NOT NULL AND status IN ('provisional','active','deletion_pending','cleanup_failed_safe');

CREATE TABLE private.social_identity_registry (
  broker_subject text PRIMARY KEY CHECK (
    broker_subject ~ '^slb:v1:k[0-9]{2}:(kakao|naver|google):[A-Za-z0-9_-]{43}$'
  ),
  provider text NOT NULL CHECK (provider IN ('kakao','naver','google')),
  subject_digest bytea NOT NULL CHECK (octet_length(subject_digest)=32),
  subject_key_version smallint NOT NULL CHECK (subject_key_version BETWEEN 1 AND 99),
  account_id uuid NOT NULL UNIQUE REFERENCES private.private_accounts(id) ON DELETE CASCADE,
  auth_user_id uuid NULL UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('provisional','active','revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  activated_at timestamptz NULL,
  revoked_at timestamptz NULL,
  CHECK (split_part(broker_subject, ':', 4) = provider),
  CHECK (split_part(broker_subject, ':', 3) = 'k' || lpad(subject_key_version::text, 2, '0')),
  CHECK (status<>'active' OR (auth_user_id IS NOT NULL AND activated_at IS NOT NULL)),
  CHECK (status<>'revoked' OR revoked_at IS NOT NULL)
);
CREATE UNIQUE INDEX social_identity_registry_one_active_identity
  ON private.social_identity_registry(account_id) WHERE status='active';

CREATE TABLE private.recovery_email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES private.private_accounts(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('activation','change','cross_provider_check','recovery_assistance')),
  recovery_email_hmac bytea NULL CHECK (recovery_email_hmac IS NULL OR octet_length(recovery_email_hmac)=32),
  hmac_key_version smallint NULL CHECK (hmac_key_version BETWEEN 1 AND 32767),
  destination_ciphertext bytea NULL CHECK (destination_ciphertext IS NULL OR octet_length(destination_ciphertext)>16),
  destination_nonce bytea NULL CHECK (destination_nonce IS NULL OR octet_length(destination_nonce)=12),
  encryption_key_version smallint NULL CHECK (encryption_key_version BETWEEN 1 AND 32767),
  otp_mac bytea NULL CHECK (otp_mac IS NULL OR octet_length(otp_mac)=32),
  otp_key_version smallint NULL CHECK (otp_key_version BETWEEN 1 AND 32767),
  failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  revoked_at timestamptz NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','consumed','locked','expired','revoked')),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes'),
  CHECK ((status='consumed') = (consumed_at IS NOT NULL)),
  CHECK ((status='revoked') = (revoked_at IS NOT NULL)),
  CHECK (
    (status='pending' AND
      recovery_email_hmac IS NOT NULL AND hmac_key_version IS NOT NULL
      AND destination_ciphertext IS NOT NULL AND destination_nonce IS NOT NULL AND encryption_key_version IS NOT NULL
      AND otp_mac IS NOT NULL AND otp_key_version IS NOT NULL
    ) OR (status<>'pending' AND
      recovery_email_hmac IS NULL AND hmac_key_version IS NULL
      AND destination_ciphertext IS NULL AND destination_nonce IS NULL AND encryption_key_version IS NULL
      AND otp_mac IS NULL AND otp_key_version IS NULL
    )
  )
);
CREATE UNIQUE INDEX recovery_email_verifications_one_pending_per_account_purpose
  ON private.recovery_email_verifications(account_id,purpose) WHERE status='pending';

CREATE TABLE private.auth_principal_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  account_id uuid NULL REFERENCES private.private_accounts(id) ON DELETE SET NULL,
  source_attempt_id uuid NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','retry_scheduled','completed','failed_safe')),
  retry_count smallint NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 100),
  next_retry_at timestamptz NULL,
  coarse_error_code text NULL CHECK (coarse_error_code IS NULL OR coarse_error_code ~ '^[A-Z0-9_]{2,60}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz NULL,
  CHECK ((status='completed') = (completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX auth_principal_cleanup_jobs_one_account
  ON private.auth_principal_cleanup_jobs(account_id)
  WHERE account_id IS NOT NULL;

CREATE FUNCTION private.require_social_service()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role()<>'service_role' AND session_user<>'postgres' THEN RAISE EXCEPTION 'SOCIAL_SERVICE_ROLE_REQUIRED'; END IF;
END $$;

CREATE FUNCTION private.require_social_transition()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('private.social_transition',true)<>'approved' THEN RAISE EXCEPTION 'SOCIAL_TRANSITION_REQUIRED'; END IF;
END $$;

CREATE FUNCTION private.enforce_private_account_invariants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.primary_provider<>OLD.primary_provider THEN RAISE EXCEPTION 'PRIMARY_PROVIDER_IMMUTABLE'; END IF;
    IF NEW.primary_broker_subject<>OLD.primary_broker_subject THEN RAISE EXCEPTION 'PRIMARY_BROKER_SUBJECT_IMMUTABLE'; END IF;
    IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
      AND NOT (OLD.auth_user_id IS NOT NULL AND NEW.auth_user_id IS NULL AND NEW.status IN ('deletion_pending','cleanup_failed_safe'))
    THEN PERFORM private.require_social_transition(); END IF;
    IF NEW.status<>OLD.status
      OR NEW.recovery_email_hmac IS DISTINCT FROM OLD.recovery_email_hmac
      OR NEW.recovery_email_hmac_key_version IS DISTINCT FROM OLD.recovery_email_hmac_key_version
      OR NEW.recovery_email_verified_at IS DISTINCT FROM OLD.recovery_email_verified_at
      OR NEW.recovery_email_ciphertext IS DISTINCT FROM OLD.recovery_email_ciphertext
      OR NEW.recovery_email_nonce IS DISTINCT FROM OLD.recovery_email_nonce
      OR NEW.recovery_email_encryption_key_version IS DISTINCT FROM OLD.recovery_email_encryption_key_version
    THEN PERFORM private.require_social_transition(); END IF;
    IF OLD.status='active' AND NEW.status NOT IN ('active','deletion_pending') THEN RAISE EXCEPTION 'SOCIAL_ACCOUNT_STATUS_TRANSITION_REJECTED'; END IF;
    IF OLD.status IN ('deletion_pending','cleanup_failed_safe') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'SOCIAL_ACCOUNT_STATUS_TERMINAL'; END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER private_accounts_invariants BEFORE UPDATE ON private.private_accounts
FOR EACH ROW EXECUTE FUNCTION private.enforce_private_account_invariants();

CREATE FUNCTION private.enforce_social_identity_invariants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account_status text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.broker_subject<>OLD.broker_subject OR NEW.provider<>OLD.provider
      OR NEW.subject_digest<>OLD.subject_digest OR NEW.subject_key_version<>OLD.subject_key_version
      OR NEW.account_id<>OLD.account_id THEN RAISE EXCEPTION 'SOCIAL_IDENTITY_IMMUTABLE'; END IF;
    IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
      AND NOT (OLD.auth_user_id IS NOT NULL AND NEW.auth_user_id IS NULL)
    THEN PERFORM private.require_social_transition(); END IF;
    IF NEW.status<>OLD.status THEN PERFORM private.require_social_transition(); END IF;
    IF OLD.status='active' AND NEW.status NOT IN ('active','revoked') THEN RAISE EXCEPTION 'SOCIAL_IDENTITY_STATUS_TRANSITION_REJECTED'; END IF;
    IF OLD.status='revoked' AND NEW.status<>'revoked' THEN RAISE EXCEPTION 'SOCIAL_IDENTITY_REVOKED_TERMINAL'; END IF;
  END IF;
  IF NEW.status='active' THEN
    SELECT status INTO account_status FROM private.private_accounts WHERE id=NEW.account_id;
    IF account_status<>'active' THEN RAISE EXCEPTION 'ACTIVE_IDENTITY_REQUIRES_ACTIVE_ACCOUNT'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER social_identity_registry_invariants BEFORE UPDATE ON private.social_identity_registry
FOR EACH ROW EXECUTE FUNCTION private.enforce_social_identity_invariants();

CREATE FUNCTION private.clear_terminal_recovery_challenge_material()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status IN ('consumed','locked','expired','revoked') THEN
    NEW.recovery_email_hmac:=NULL;
    NEW.hmac_key_version:=NULL;
    NEW.destination_ciphertext:=NULL;
    NEW.destination_nonce:=NULL;
    NEW.encryption_key_version:=NULL;
    NEW.otp_mac:=NULL;
    NEW.otp_key_version:=NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recovery_email_verifications_clear_terminal_material
BEFORE UPDATE ON private.recovery_email_verifications
FOR EACH ROW EXECUTE FUNCTION private.clear_terminal_recovery_challenge_material();

CREATE FUNCTION public.create_provisional_social_account(
  requested_provider text,requested_broker_subject text,requested_subject_digest bytea,requested_subject_key_version integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account_id uuid;
BEGIN
  PERFORM private.require_social_service();
  IF requested_provider NOT IN ('kakao','naver','google')
    OR requested_broker_subject !~ ('^slb:v1:k[0-9]{2}:'||requested_provider||':[A-Za-z0-9_-]{43}$')
    OR split_part(requested_broker_subject, ':', 3) <> 'k' || lpad(requested_subject_key_version::text, 2, '0')
    OR octet_length(requested_subject_digest)<>32 OR requested_subject_key_version NOT BETWEEN 1 AND 99
  THEN RAISE EXCEPTION 'INVALID_SOCIAL_IDENTITY'; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  INSERT INTO private.private_accounts(status,primary_provider,primary_broker_subject)
  VALUES('provisional',requested_provider,requested_broker_subject) RETURNING id INTO account_id;
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,status)
  VALUES(requested_broker_subject,requested_provider,requested_subject_digest,requested_subject_key_version,account_id,'provisional');
  RETURN account_id;
END $$;

CREATE FUNCTION public.bind_social_auth_principal(target_account_id uuid,target_auth_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account private.private_accounts%ROWTYPE;
BEGIN
  PERFORM private.require_social_service();
  SELECT * INTO account FROM private.private_accounts WHERE id=target_account_id FOR UPDATE;
  IF account.id IS NULL OR account.status<>'provisional' OR account.auth_user_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target_auth_user_id)
    THEN RAISE EXCEPTION 'SOCIAL_PRINCIPAL_BINDING_REJECTED'; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET auth_user_id=target_auth_user_id WHERE id=target_account_id;
  UPDATE private.social_identity_registry SET auth_user_id=target_auth_user_id WHERE account_id=target_account_id;
  RETURN true;
END $$;

CREATE FUNCTION public.create_recovery_email_verification(
  target_account_id uuid,requested_purpose text,requested_hmac bytea,requested_hmac_key_version integer,
  requested_ciphertext bytea,requested_nonce bytea,requested_encryption_key_version integer,
  requested_otp_mac bytea,requested_otp_key_version integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE verification_id uuid; account private.private_accounts%ROWTYPE; issued_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_service();
  SELECT * INTO account FROM private.private_accounts WHERE id=target_account_id FOR UPDATE;
  IF account.id IS NULL OR account.status<>'provisional' OR requested_purpose<>'activation'
    OR octet_length(requested_hmac)<>32 OR octet_length(requested_ciphertext)<=16 OR octet_length(requested_nonce)<>12 OR octet_length(requested_otp_mac)<>32
    OR requested_hmac_key_version NOT BETWEEN 1 AND 32767 OR requested_encryption_key_version NOT BETWEEN 1 AND 32767 OR requested_otp_key_version NOT BETWEEN 1 AND 32767
  THEN RAISE EXCEPTION 'RECOVERY_VERIFICATION_CREATE_REJECTED'; END IF;
  UPDATE private.recovery_email_verifications
    SET status='revoked',revoked_at=clock_timestamp()
    WHERE account_id=target_account_id AND purpose='activation' AND status='pending';
  INSERT INTO private.recovery_email_verifications(account_id,purpose,recovery_email_hmac,hmac_key_version,destination_ciphertext,destination_nonce,encryption_key_version,otp_mac,otp_key_version,created_at,expires_at)
  VALUES(target_account_id,'activation',requested_hmac,requested_hmac_key_version,requested_ciphertext,requested_nonce,requested_encryption_key_version,requested_otp_mac,requested_otp_key_version,issued_at,issued_at+interval '10 minutes')
  RETURNING id INTO verification_id;
  RETURN verification_id;
END $$;

CREATE FUNCTION public.consume_recovery_email_verification(target_verification_id uuid,submitted_otp_mac bytea)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE verification private.recovery_email_verifications%ROWTYPE;
BEGIN
  PERFORM private.require_social_service();
  IF octet_length(submitted_otp_mac)<>32 THEN RAISE EXCEPTION 'RECOVERY_OTP_MAC_INVALID'; END IF;
  SELECT * INTO verification FROM private.recovery_email_verifications WHERE id=target_verification_id FOR UPDATE;
  IF verification.id IS NULL OR verification.status<>'pending' THEN RETURN 'TERMINAL'; END IF;
  IF verification.purpose<>'activation' THEN RAISE EXCEPTION 'RECOVERY_PURPOSE_NOT_IMPLEMENTED'; END IF;
  IF verification.expires_at<=clock_timestamp() THEN
    UPDATE private.recovery_email_verifications SET status='expired' WHERE id=verification.id; RETURN 'EXPIRED';
  END IF;
  IF verification.otp_mac<>submitted_otp_mac THEN
    UPDATE private.recovery_email_verifications SET failed_attempts=failed_attempts+1,
      status=CASE WHEN failed_attempts+1>=5 THEN 'locked' ELSE 'pending' END WHERE id=verification.id;
    RETURN CASE WHEN verification.failed_attempts+1>=5 THEN 'LOCKED' ELSE 'OTP_REJECTED' END;
  END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET recovery_email_hmac=verification.recovery_email_hmac,
    recovery_email_hmac_key_version=verification.hmac_key_version,recovery_email_ciphertext=verification.destination_ciphertext,
    recovery_email_nonce=verification.destination_nonce,recovery_email_encryption_key_version=verification.encryption_key_version,
    recovery_email_verified_at=clock_timestamp() WHERE id=verification.account_id AND status='provisional';
  IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_ACCOUNT_NOT_PROVISIONAL'; END IF;
  UPDATE private.recovery_email_verifications SET status='consumed',consumed_at=clock_timestamp() WHERE id=verification.id;
  RETURN 'CONSUMED';
END $$;

CREATE FUNCTION public.activate_social_account(target_account_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account private.private_accounts%ROWTYPE; launch public.public_account_launch_control%ROWTYPE;
BEGIN
  PERFORM private.require_social_service();
  SELECT * INTO account FROM private.private_accounts WHERE id=target_account_id FOR UPDATE;
  SELECT * INTO launch FROM public.public_account_launch_control WHERE control_key='public_account' FOR SHARE;
  IF account.id IS NULL OR account.status<>'provisional' OR account.auth_user_id IS NULL OR account.recovery_email_hmac IS NULL
    OR account.recovery_email_ciphertext IS NULL OR account.recovery_email_nonce IS NULL OR account.recovery_email_verified_at IS NULL
    THEN RAISE EXCEPTION 'SOCIAL_ACTIVATION_RECOVERY_REQUIRED'; END IF;
  IF launch.state<>'open' OR NOT launch.account_registration_enabled OR NOT launch.private_profile_enabled OR NOT launch.school_membership_enabled
    THEN RAISE EXCEPTION 'SOCIAL_ACCOUNT_LAUNCH_CLOSED'; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET status='active',activated_at=clock_timestamp() WHERE id=target_account_id;
  UPDATE private.social_identity_registry SET status='active',activated_at=clock_timestamp() WHERE account_id=target_account_id AND status='provisional';
  IF NOT FOUND THEN RAISE EXCEPTION 'SOCIAL_PRIMARY_IDENTITY_REQUIRED'; END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.get_social_account_state_for_owner()
RETURNS TABLE(account_id uuid,status text,primary_provider text,recovery_verified boolean,cleanup_status text)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT account.id,account.status,account.primary_provider,(account.recovery_email_verified_at IS NOT NULL),job.status
  FROM private.private_accounts account LEFT JOIN private.auth_principal_cleanup_jobs job ON job.account_id=account.id
  WHERE account.auth_user_id=auth.uid()
$$;

CREATE FUNCTION public.revoke_social_identity_for_deletion(target_account_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account private.private_accounts%ROWTYPE;
BEGIN
  PERFORM private.require_social_service();
  SELECT * INTO account FROM private.private_accounts WHERE id=target_account_id FOR UPDATE;
  IF account.id IS NULL THEN RAISE EXCEPTION 'SOCIAL_ACCOUNT_NOT_FOUND'; END IF;
  IF account.status IN ('deletion_pending','cleanup_failed_safe') THEN RETURN true; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET status='deletion_pending',recovery_email_ciphertext=NULL,recovery_email_nonce=NULL,recovery_email_encryption_key_version=NULL
    WHERE id=target_account_id;
  UPDATE private.social_identity_registry SET status='revoked',revoked_at=clock_timestamp() WHERE account_id=target_account_id AND status<>'revoked';
  UPDATE private.recovery_email_verifications SET status='revoked',revoked_at=clock_timestamp() WHERE account_id=target_account_id AND status='pending';
  RETURN true;
END $$;

CREATE FUNCTION public.enqueue_auth_principal_cleanup(target_account_id uuid,requested_source_attempt_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account private.private_accounts%ROWTYPE; job_id uuid;
BEGIN
  PERFORM private.require_social_service();
  SELECT * INTO account FROM private.private_accounts WHERE id=target_account_id FOR UPDATE;
  IF account.id IS NULL OR account.status NOT IN ('deletion_pending','cleanup_failed_safe') OR account.auth_user_id IS NULL
    OR EXISTS(SELECT 1 FROM private.social_identity_registry WHERE account_id=target_account_id AND status<>'revoked')
  THEN RAISE EXCEPTION 'SOCIAL_CLEANUP_QUEUE_REJECTED'; END IF;
  SELECT id INTO job_id FROM private.auth_principal_cleanup_jobs WHERE account_id=target_account_id FOR UPDATE;
  IF job_id IS NOT NULL THEN RETURN job_id; END IF;
  INSERT INTO private.auth_principal_cleanup_jobs(auth_user_id,account_id,source_attempt_id)
  VALUES(account.auth_user_id,target_account_id,requested_source_attempt_id)
  RETURNING id INTO job_id;
  RETURN job_id;
END $$;

ALTER TABLE private.private_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.social_identity_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.recovery_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.auth_principal_cleanup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.private_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE private.social_identity_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE private.recovery_email_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE private.auth_principal_cleanup_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION private.require_social_service() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.require_social_transition() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.enforce_private_account_invariants() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.enforce_social_identity_invariants() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.clear_terminal_recovery_challenge_material() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_provisional_social_account(text,text,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bind_social_auth_principal(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_recovery_email_verification(uuid,text,bytea,integer,bytea,bytea,integer,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.consume_recovery_email_verification(uuid,bytea) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activate_social_account(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_social_identity_for_deletion(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enqueue_auth_principal_cleanup(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_social_account_state_for_owner() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_provisional_social_account(text,text,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_social_auth_principal(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_recovery_email_verification(uuid,text,bytea,integer,bytea,bytea,integer,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_recovery_email_verification(uuid,bytea) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_social_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_social_identity_for_deletion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_auth_principal_cleanup(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_social_account_state_for_owner() TO authenticated;

COMMENT ON SCHEMA private IS 'PHASE 10O-F private social account and recovery data; no PostgREST public-schema exposure or direct service-role table access.';
COMMENT ON TABLE private.private_accounts IS 'Additive social account boundary. Existing auth/private-profile ownership remains auth.users.id and is never migrated automatically.';
COMMENT ON TABLE private.recovery_email_verifications IS 'Synthetic-test-only recovery challenge storage: HMAC/ciphertext/OTP MAC only while pending; terminal one-time material is cleared.';
COMMIT;
