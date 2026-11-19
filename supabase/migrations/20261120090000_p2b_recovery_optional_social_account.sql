-- Part 2 P2b (approved 2026-11-19, docs/decisions/2026-11-19-p2b-recovery-skip-and-one-tap.md):
-- a new Google identity finishes sign-up without a recovery email; the 8-digit
-- custom recovery boundary stays and can be registered later from /account.
--
-- Additive except the two approved constraint replacements (E1, E2). No
-- existing function is replaced, no row is updated or deleted, nothing is
-- dropped except the two named CHECK constraints that are re-added wider.
-- Rollback = point the app back at the legacy RPCs (all still present); see
-- scripts/part2-p2b/rollback.sql.
BEGIN;
SET LOCAL lock_timeout='5s';

DO $p2b_preflight$
DECLARE e1_count integer; e2_count integer; attempt_nullable boolean;
BEGIN
  IF to_regclass('private.private_accounts') IS NULL
    OR to_regclass('private.social_identity_registry') IS NULL
    OR to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regclass('private.recovery_email_verifications') IS NULL
    OR to_regclass('private.recovery_delivery_attempts') IS NULL
    OR to_regclass('public.public_account_launch_control') IS NULL
    OR to_regclass('public.account_deletion_requests') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL
    OR to_regprocedure('private.scrub_upstream_login_leg(uuid,text,timestamp with time zone)') IS NULL
    OR to_regprocedure('private.terminalize_bound_downstream_authorization_transaction(uuid,uuid,text,timestamp with time zone)') IS NULL
    OR to_regprocedure('private.expire_stale_social_identity_attempt(uuid,timestamp with time zone)') IS NULL
    OR to_regprocedure('public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)') IS NULL
    OR to_regprocedure('public.mark_login_attempt_recovery_delivery_sent(uuid)') IS NULL
    OR to_regprocedure('public.fail_login_attempt_recovery_delivery(uuid)') IS NULL
  THEN RAISE EXCEPTION 'P2B_BASELINE_MISSING'; END IF;

  IF to_regprocedure('public.record_verified_google_identity_recovery_optional(uuid,uuid,text,text,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.bind_social_auth_principal_from_attempt_recovery_optional(uuid,uuid)') IS NOT NULL
    OR to_regprocedure('public.activate_social_account_from_attempt_recovery_optional(uuid)') IS NOT NULL
    OR to_regprocedure('public.create_and_reserve_account_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)') IS NOT NULL
    OR to_regprocedure('public.consume_account_recovery_verification(uuid,uuid,bytea)') IS NOT NULL
    OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='private' AND table_name='recovery_delivery_attempts' AND column_name='account_id')
    OR EXISTS(SELECT 1 FROM pg_constraint WHERE conname IN ('private_accounts_active_principal_recovery_atomic','recovery_delivery_reserved_requires_single_owner'))
  THEN RAISE EXCEPTION 'P2B_OBJECT_COLLISION'; END IF;

  -- E1: the unnamed "active requires recovery" CHECK. Never guess its name.
  SELECT count(*) INTO e1_count FROM pg_constraint c
    WHERE c.conrelid='private.private_accounts'::regclass AND c.contype='c'
      AND pg_get_constraintdef(c.oid) LIKE '%status <> ''active''::text%'
      AND pg_get_constraintdef(c.oid) LIKE '%recovery_email_verified_at IS NOT NULL%'
      AND pg_get_constraintdef(c.oid) LIKE '%activated_at IS NOT NULL%';
  -- E2 has two known baselines: before 20260915211712 (login_attempt_id NOT NULL,
  -- no owner CHECK; e.g. the Preview project) and after it (nullable + the named
  -- owner CHECK). Exactly one of them must hold; anything else aborts.
  SELECT count(*) INTO e2_count FROM pg_constraint c
    WHERE c.conrelid='private.recovery_delivery_attempts'::regclass AND c.contype='c'
      AND c.conname='recovery_delivery_reserved_requires_owner';
  SELECT is_nullable='YES' INTO attempt_nullable FROM information_schema.columns
    WHERE table_schema='private' AND table_name='recovery_delivery_attempts' AND column_name='login_attempt_id';
  IF e1_count<>1 OR attempt_nullable IS NULL
    OR NOT ((e2_count=1 AND attempt_nullable) OR (e2_count=0 AND NOT attempt_nullable))
  THEN RAISE EXCEPTION 'P2B_CONSTRAINT_BASELINE_AMBIGUOUS %/%/%',e1_count,e2_count,attempt_nullable; END IF;
END $p2b_preflight$;

-- E1 (approved exception): an active account still needs its Auth principal and
-- activation time; recovery custody becomes all-or-nothing instead of required.
DO $p2b_e1$
DECLARE target_name text;
BEGIN
  SELECT c.conname INTO STRICT target_name FROM pg_constraint c
    WHERE c.conrelid='private.private_accounts'::regclass AND c.contype='c'
      AND pg_get_constraintdef(c.oid) LIKE '%status <> ''active''::text%'
      AND pg_get_constraintdef(c.oid) LIKE '%recovery_email_verified_at IS NOT NULL%'
      AND pg_get_constraintdef(c.oid) LIKE '%activated_at IS NOT NULL%';
  EXECUTE format('ALTER TABLE private.private_accounts DROP CONSTRAINT %I',target_name);
END $p2b_e1$;
ALTER TABLE private.private_accounts ADD CONSTRAINT private_accounts_active_principal_recovery_atomic CHECK (
  status<>'active' OR (
    auth_user_id IS NOT NULL AND activated_at IS NOT NULL
    AND (
      (recovery_email_hmac IS NOT NULL AND recovery_email_hmac_key_version IS NOT NULL
        AND recovery_email_ciphertext IS NOT NULL AND recovery_email_nonce IS NOT NULL
        AND recovery_email_encryption_key_version IS NOT NULL AND recovery_email_verified_at IS NOT NULL)
      OR
      (recovery_email_hmac IS NULL AND recovery_email_hmac_key_version IS NULL
        AND recovery_email_ciphertext IS NULL AND recovery_email_nonce IS NULL
        AND recovery_email_encryption_key_version IS NULL AND recovery_email_verified_at IS NULL)
    )
  )
);

-- E2 (approved exception): a reserved delivery belongs to exactly one owner,
-- either the sign-up login attempt (legacy) or an active account (/account).
ALTER TABLE private.recovery_delivery_attempts
  ADD COLUMN account_id uuid NULL REFERENCES private.private_accounts(id) ON DELETE CASCADE;
ALTER TABLE private.recovery_delivery_attempts DROP CONSTRAINT IF EXISTS recovery_delivery_reserved_requires_owner;
-- Pre-0915 baseline only: the sign-up owner column becomes optional; the CHECK
-- below still requires exactly one owner for every reserved row. No-op after 0915.
ALTER TABLE private.recovery_delivery_attempts ALTER COLUMN login_attempt_id DROP NOT NULL;
ALTER TABLE private.recovery_delivery_attempts ADD CONSTRAINT recovery_delivery_reserved_requires_single_owner
  CHECK(state<>'reserved' OR (verification_id IS NOT NULL AND num_nonnulls(login_attempt_id,account_id)=1));
ALTER TABLE private.recovery_delivery_attempts ADD CONSTRAINT recovery_delivery_account_or_attempt
  CHECK(account_id IS NULL OR login_attempt_id IS NULL);
CREATE INDEX recovery_delivery_attempts_account_reserved_idx
  ON private.recovery_delivery_attempts(account_id,reserved_at) WHERE account_id IS NOT NULL;

CREATE FUNCTION private.p2b_recovery_absent(a private.private_accounts)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT a.recovery_email_hmac IS NULL AND a.recovery_email_hmac_key_version IS NULL
    AND a.recovery_email_ciphertext IS NULL AND a.recovery_email_nonce IS NULL
    AND a.recovery_email_encryption_key_version IS NULL AND a.recovery_email_verified_at IS NULL
$$;
CREATE FUNCTION private.p2b_recovery_complete(a private.private_accounts)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT a.recovery_email_hmac IS NOT NULL AND a.recovery_email_hmac_key_version IS NOT NULL
    AND a.recovery_email_ciphertext IS NOT NULL AND a.recovery_email_nonce IS NOT NULL
    AND a.recovery_email_encryption_key_version IS NOT NULL AND a.recovery_email_verified_at IS NOT NULL
$$;

-- Google identity decision without a recovery step. Lock order matches the
-- legacy wrapper: transaction, attempt, leg, broker-subject advisory, then
-- account, identity. Every case it does not own is delegated to the legacy
-- public wrapper BEFORE any account/identity lock is taken.
CREATE FUNCTION public.record_verified_google_identity_recovery_optional(
  target_attempt_id uuid,target_leg_id uuid,requested_provider text,requested_broker_subject text,
  requested_subject_digest bytea,requested_subject_key_version integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tx private.downstream_authorization_transactions%ROWTYPE;
  attempt private.oauth_login_attempts%ROWTYPE;
  leg private.upstream_login_legs%ROWTYPE;
  account private.private_accounts%ROWTYPE;
  identity private.social_identity_registry%ROWTYPE;
  stale_competing uuid;
  candidate_account_id uuid;
  identity_count integer;
  auth_identity_count integer;
  auth_mapping_count integer;
  live_other_count integer;
  new_account_id uuid;
  now_at timestamptz:=clock_timestamp();
  next_tx_status text;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_attempt_id IS NULL OR target_leg_id IS NULL OR requested_provider IS DISTINCT FROM 'google'
    OR requested_broker_subject IS NULL OR requested_broker_subject !~ '^slb:v1:k[0-9]{2}:google:[A-Za-z0-9_-]{43}$'
    OR requested_subject_digest IS NULL OR octet_length(requested_subject_digest)<>32
    OR requested_subject_key_version IS NULL OR requested_subject_key_version NOT BETWEEN 1 AND 99
    OR split_part(requested_broker_subject,':',3) IS DISTINCT FROM 'k'||lpad(requested_subject_key_version::text,2,'0')
    OR split_part(requested_broker_subject,':',5) IS DISTINCT FROM replace(replace(replace(encode(requested_subject_digest,'base64'),'+','-'),'/','_'),'=','')
  THEN
    RETURN public.record_verified_social_identity_from_upstream_leg(target_attempt_id,target_leg_id,requested_provider,requested_broker_subject,requested_subject_digest,requested_subject_key_version);
  END IF;

  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE login_attempt_id=target_attempt_id FOR UPDATE;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF tx.id IS NULL OR attempt.id IS NULL OR leg.id IS NULL
    OR tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM leg.id OR tx.expires_at<=now_at
    OR attempt.state<>'upstream_pending' OR attempt.provider<>'google' OR attempt.expires_at<=now_at
    OR leg.status<>'callback_claimed' OR leg.provider<>'google' OR leg.expires_at<=now_at
  THEN
    RETURN public.record_verified_social_identity_from_upstream_leg(target_attempt_id,target_leg_id,requested_provider,requested_broker_subject,requested_subject_digest,requested_subject_key_version);
  END IF;

  -- Same stale pre-recovery release the legacy helper performs before the advisory domain.
  SELECT id INTO stale_competing FROM private.oauth_login_attempts
    WHERE id<>attempt.id AND provider='google' AND broker_subject=requested_broker_subject
      AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified') AND expires_at<=now_at
    ORDER BY expires_at,id LIMIT 1;
  IF stale_competing IS NOT NULL THEN PERFORM private.expire_stale_social_identity_attempt(stale_competing,now_at); END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'schoollove:10o-g:broker-decision:v1:google:'||requested_subject_key_version::text||':'||encode(requested_subject_digest,'hex'),0
  ));
  now_at:=clock_timestamp();
  IF tx.expires_at<=now_at OR attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN
    -- The legacy wrapper re-checks the same rows and terminalizes as expired.
    RETURN public.record_verified_social_identity_from_upstream_leg(target_attempt_id,target_leg_id,requested_provider,requested_broker_subject,requested_subject_digest,requested_subject_key_version);
  END IF;

  SELECT count(*) INTO identity_count FROM private.social_identity_registry WHERE broker_subject=requested_broker_subject;

  IF identity_count=0 THEN
    -- A live legacy recovery attempt for this subject keeps its in-progress answer.
    IF EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id<>attempt.id AND provider='google'
        AND broker_subject=requested_broker_subject AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified'))
      OR EXISTS(SELECT 1 FROM private.private_accounts WHERE primary_broker_subject=requested_broker_subject)
    THEN
      RETURN public.record_verified_social_identity_from_upstream_leg(target_attempt_id,target_leg_id,requested_provider,requested_broker_subject,requested_subject_digest,requested_subject_key_version);
    END IF;
    INSERT INTO private.private_accounts(status,primary_provider,primary_broker_subject)
      VALUES('provisional','google',requested_broker_subject) RETURNING id INTO new_account_id;
    INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,status)
      VALUES(requested_broker_subject,'google',requested_subject_digest,requested_subject_key_version,new_account_id,'provisional');
    PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
    UPDATE private.oauth_login_attempts SET state='account_decided',broker_subject=requested_broker_subject,
      subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,
      account_id=new_account_id,updated_at=now_at,version=version+1
      WHERE id=attempt.id AND state='upstream_pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'P2B_ACCOUNT_DECISION_TARGET_CHANGED'; END IF;
    RETURN 'ACCOUNT_DECIDED_RECOVERY_DEFERRED';
  END IF;

  -- Non-locking candidate read: only an exact provisional, recovery-absent tuple
  -- is owned here. Active accounts (EXISTING_PRIMARY), recovery-verified legacy
  -- accounts, revoked or mismatched identities all stay with the legacy wrapper.
  SELECT a.id INTO candidate_account_id
    FROM private.social_identity_registry r JOIN private.private_accounts a ON a.id=r.account_id
    WHERE r.broker_subject=requested_broker_subject AND r.provider='google'
      AND r.subject_digest=requested_subject_digest AND r.subject_key_version=requested_subject_key_version
      AND r.status='provisional' AND a.status='provisional'
      AND a.primary_provider='google' AND a.primary_broker_subject=requested_broker_subject
      AND private.p2b_recovery_absent(a);
  IF candidate_account_id IS NULL THEN
    RETURN public.record_verified_social_identity_from_upstream_leg(target_attempt_id,target_leg_id,requested_provider,requested_broker_subject,requested_subject_digest,requested_subject_key_version);
  END IF;

  -- Canonical candidate lock order: account, then identity. No delegation after this point.
  SELECT * INTO account FROM private.private_accounts WHERE id=candidate_account_id FOR UPDATE;
  SELECT * INTO identity FROM private.social_identity_registry WHERE broker_subject=requested_broker_subject FOR UPDATE;
  now_at:=clock_timestamp();
  IF tx.expires_at<=now_at OR attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN
    next_tx_status:='expired';
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,next_tx_status,now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,next_tx_status,now_at);
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=now_at,version=version+1
      WHERE id=attempt.id AND state='upstream_pending';
    RETURN 'EXPIRED';
  END IF;

  SELECT count(*) INTO auth_mapping_count FROM auth.identities i
    WHERE i.provider='custom:schoollove-google'
      AND (i.provider_id=requested_broker_subject OR i.identity_data->>'sub'=requested_broker_subject
        OR (account.auth_user_id IS NOT NULL AND i.user_id=account.auth_user_id));

  -- (a) Bound provisional (e.g. activation deferred while launch was not open).
  IF account.id=candidate_account_id AND account.status='provisional' AND account.auth_user_id IS NOT NULL
    AND private.p2b_recovery_absent(account)
    AND account.primary_provider='google' AND account.primary_broker_subject=requested_broker_subject
    AND identity.account_id=account.id AND identity.status='provisional' AND identity.activated_at IS NULL
    AND identity.provider='google' AND identity.subject_digest=requested_subject_digest
    AND identity.subject_key_version=requested_subject_key_version AND identity.auth_user_id=account.auth_user_id
    AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=account.auth_user_id)
  THEN
    SELECT count(*) INTO auth_identity_count FROM auth.identities i
      WHERE i.user_id=account.auth_user_id AND i.provider='custom:schoollove-google'
        AND i.provider_id=requested_broker_subject AND i.identity_data->>'sub'=requested_broker_subject;
    IF auth_identity_count=1 AND auth_mapping_count=1 THEN
      PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
      UPDATE private.oauth_login_attempts SET state='auth_principal_bound',broker_subject=requested_broker_subject,
        subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,
        account_id=account.id,updated_at=now_at,version=version+1
        WHERE id=attempt.id AND state='upstream_pending';
      IF FOUND THEN RETURN 'BOUND_PROVISIONAL_REAUTH_READY'; END IF;
    END IF;
  END IF;

  -- (b) Unbound provisional left by an interrupted first sign-up. Adopt only
  -- when no other attempt of this account can still issue or redeem a code,
  -- and Supabase holds at most the exact mapping for this same subject.
  SELECT count(*) INTO live_other_count FROM private.oauth_login_attempts o
    WHERE o.account_id=candidate_account_id AND o.id<>attempt.id
      AND o.state IN ('account_decided','auth_principal_bound','existing_primary','broker_code_ready')
      AND o.expires_at>now_at;
  IF account.id=candidate_account_id AND account.status='provisional' AND account.auth_user_id IS NULL
    AND private.p2b_recovery_absent(account)
    AND account.primary_provider='google' AND account.primary_broker_subject=requested_broker_subject
    AND identity.account_id=account.id AND identity.status='provisional' AND identity.auth_user_id IS NULL
    AND identity.provider='google' AND identity.subject_digest=requested_subject_digest
    AND identity.subject_key_version=requested_subject_key_version
    AND live_other_count=0 AND auth_mapping_count<=1
    AND NOT EXISTS(SELECT 1 FROM auth.identities i WHERE i.provider='custom:schoollove-google'
      AND (i.provider_id=requested_broker_subject OR i.identity_data->>'sub'=requested_broker_subject)
      AND (i.provider_id IS DISTINCT FROM requested_broker_subject OR i.identity_data->>'sub' IS DISTINCT FROM requested_broker_subject))
  THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
    UPDATE private.oauth_login_attempts SET state='account_decided',broker_subject=requested_broker_subject,
      subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,
      account_id=account.id,updated_at=now_at,version=version+1
      WHERE id=attempt.id AND state='upstream_pending';
    IF FOUND THEN RETURN 'PROVISIONAL_RESUME_READY'; END IF;
  END IF;

  -- (c) A concurrent legitimate activation won while this call waited.
  IF account.id=candidate_account_id AND account.status='active' AND account.auth_user_id IS NOT NULL
    AND account.activated_at IS NOT NULL AND account.primary_broker_subject=requested_broker_subject
    AND identity.account_id=account.id AND identity.status='active' AND identity.auth_user_id=account.auth_user_id
    AND identity.subject_digest=requested_subject_digest AND identity.subject_key_version=requested_subject_key_version
  THEN
    PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
    UPDATE private.oauth_login_attempts SET state='existing_primary',broker_subject=requested_broker_subject,
      subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,
      account_id=account.id,updated_at=now_at,version=version+1
      WHERE id=attempt.id AND state='upstream_pending';
    IF FOUND THEN RETURN 'EXISTING_PRIMARY'; END IF;
  END IF;

  IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,'rejected',now_at) THEN RETURN 'IDENTITY_REJECTED'; END IF;
  PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
  UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1
    WHERE id=attempt.id AND state='upstream_pending';
  RETURN 'IDENTITY_DECISION_IN_PROGRESS';
END $$;

-- Completion binding: identical checks to bind_social_auth_principal_from_attempt
-- except recovery custody is all-or-nothing instead of required.
CREATE FUNCTION public.bind_social_auth_principal_from_attempt_recovery_optional(target_attempt_id uuid,target_auth_user_id uuid)
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
    OR NOT EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=target_auth_user_id AND i.provider='custom:schoollove-'||attempt.provider AND i.provider_id=attempt.broker_subject AND i.identity_data->>'sub'=attempt.broker_subject)
  THEN RAISE EXCEPTION 'SOCIAL_PRINCIPAL_BINDING_REJECTED'; END IF;
  IF account.auth_user_id=target_auth_user_id AND identity.auth_user_id=target_auth_user_id THEN RETURN 'AUTH_PRINCIPAL_ALREADY_BOUND'; END IF;
  IF account.status<>'provisional' OR identity.status<>'provisional' OR account.auth_user_id IS NOT NULL OR identity.auth_user_id IS NOT NULL
    OR NOT (private.p2b_recovery_complete(account) OR private.p2b_recovery_absent(account))
  THEN RAISE EXCEPTION 'SOCIAL_PRINCIPAL_BINDING_REJECTED'; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET auth_user_id=target_auth_user_id WHERE id=account.id;
  UPDATE private.social_identity_registry SET auth_user_id=target_auth_user_id WHERE broker_subject=identity.broker_subject;
  RETURN 'AUTH_PRINCIPAL_BOUND';
END $$;

-- Activation: same exact-open launch gate and Auth 1:1 checks as PHASE 10P,
-- recovery custody all-or-nothing. Activates inline (the legacy
-- activate_social_account still requires recovery and is left untouched).
CREATE FUNCTION public.activate_social_account_from_attempt_recovery_optional(target_attempt_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  attempt private.oauth_login_attempts%ROWTYPE;
  account private.private_accounts%ROWTYPE;
  identity private.social_identity_registry%ROWTYPE;
  launch public.public_account_launch_control%ROWTYPE;
  launch_count integer;
  auth_identity_count integer;
  auth_mapping_count integer;
  activation_time timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_attempt_id IS NULL THEN RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR attempt.state<>'consumed' OR attempt.account_id IS NULL
    OR attempt.provider NOT IN ('google','kakao','naver') OR attempt.broker_subject IS NULL
    OR attempt.subject_digest IS NULL OR octet_length(attempt.subject_digest)<>32
    OR attempt.subject_key_version NOT BETWEEN 1 AND 99
  THEN RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'; END IF;
  SELECT * INTO account FROM private.private_accounts WHERE id=attempt.account_id FOR UPDATE;
  SELECT * INTO identity FROM private.social_identity_registry WHERE broker_subject=attempt.broker_subject FOR UPDATE;
  IF account.id IS NULL OR identity.broker_subject IS NULL
    OR identity.account_id IS DISTINCT FROM account.id
    OR account.primary_provider IS DISTINCT FROM attempt.provider
    OR account.primary_broker_subject IS DISTINCT FROM attempt.broker_subject
    OR identity.provider IS DISTINCT FROM attempt.provider
    OR identity.subject_digest IS DISTINCT FROM attempt.subject_digest
    OR identity.subject_key_version IS DISTINCT FROM attempt.subject_key_version
    OR account.auth_user_id IS NULL OR identity.auth_user_id IS DISTINCT FROM account.auth_user_id
    OR NOT (private.p2b_recovery_complete(account) OR private.p2b_recovery_absent(account))
    OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=account.auth_user_id)
  THEN RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'; END IF;

  SELECT count(*) INTO auth_identity_count FROM auth.identities i
    WHERE i.user_id=account.auth_user_id AND i.provider='custom:schoollove-'||attempt.provider
      AND i.provider_id=attempt.broker_subject AND i.identity_data->>'sub'=attempt.broker_subject;
  SELECT count(*) INTO auth_mapping_count FROM auth.identities i
    WHERE i.provider='custom:schoollove-'||attempt.provider
      AND (i.user_id=account.auth_user_id OR i.provider_id=attempt.broker_subject OR i.identity_data->>'sub'=attempt.broker_subject);
  IF auth_identity_count<>1 OR auth_mapping_count<>1 THEN RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'; END IF;

  IF account.status='active' AND identity.status='active'
    AND account.activated_at IS NOT NULL AND identity.activated_at IS NOT NULL
  THEN RETURN 'SOCIAL_ACCOUNT_ALREADY_ACTIVE'; END IF;
  IF account.status<>'provisional' OR identity.status<>'provisional'
    OR account.activated_at IS NOT NULL OR identity.activated_at IS NOT NULL
  THEN RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'; END IF;

  SELECT count(*) INTO launch_count FROM public.public_account_launch_control;
  IF launch_count<>1 THEN RETURN 'SOCIAL_ACCOUNT_LAUNCH_CLOSED'; END IF;
  SELECT * INTO STRICT launch FROM public.public_account_launch_control FOR SHARE;
  IF launch.control_key IS DISTINCT FROM 'public_account'
    OR launch.state IS DISTINCT FROM 'open'
    OR launch.account_registration_enabled IS DISTINCT FROM true
    OR launch.private_profile_enabled IS DISTINCT FROM true
    OR launch.school_membership_enabled IS DISTINCT FROM true
    OR launch.emergency_stopped_at IS NOT NULL
  THEN RETURN 'SOCIAL_ACCOUNT_LAUNCH_CLOSED'; END IF;

  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET status='active',activated_at=activation_time WHERE id=account.id AND status='provisional';
  IF NOT FOUND THEN RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'; END IF;
  UPDATE private.social_identity_registry SET status='active',activated_at=activation_time
    WHERE broker_subject=identity.broker_subject AND account_id=account.id AND status='provisional';
  IF NOT FOUND THEN RAISE EXCEPTION 'SOCIAL_PRIMARY_IDENTITY_REQUIRED'; END IF;
  RETURN 'SOCIAL_ACCOUNT_ACTIVATED';
END $$;

-- /account "register later": reserve a delivery slot for an ACTIVE account
-- whose recovery custody is absent. Shares the 24h per-address budget and the
-- advisory lock domain with the sign-up recovery path. The server supplies the
-- Auth user id from a verified session and the account id it read for that user.
CREATE FUNCTION public.create_and_reserve_account_recovery_delivery(
  target_auth_user_id uuid,target_account_id uuid,requested_verification_id uuid,
  requested_hmac bytea,requested_hmac_key_version integer,
  requested_ciphertext bytea,requested_nonce bytea,requested_encryption_key_version integer,
  requested_otp_mac bytea,requested_otp_key_version integer
) RETURNS TABLE(outcome text,verification_id uuid,delivery_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  account private.private_accounts%ROWTYPE;
  issued_at timestamptz:=clock_timestamp();
  latest_reserved_at timestamptz;
  account_reservation_count integer;
  email_reservation_count integer;
  inserted_delivery_id uuid;
  existing_verification_id uuid;
  existing_delivery_id uuid;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_auth_user_id IS NULL OR target_account_id IS NULL OR requested_verification_id IS NULL
    OR requested_hmac IS NULL OR octet_length(requested_hmac)<>32 OR requested_hmac_key_version NOT BETWEEN 1 AND 32767
    OR requested_ciphertext IS NULL OR octet_length(requested_ciphertext)<=16
    OR requested_nonce IS NULL OR octet_length(requested_nonce)<>12 OR requested_encryption_key_version NOT BETWEEN 1 AND 32767
    OR requested_otp_mac IS NULL OR octet_length(requested_otp_mac)<>32 OR requested_otp_key_version NOT BETWEEN 1 AND 32767
  THEN RAISE EXCEPTION 'ACCOUNT_RECOVERY_CREATE_REJECTED'; END IF;
  SELECT * INTO account FROM private.private_accounts WHERE auth_user_id=target_auth_user_id FOR UPDATE;
  IF account.id IS NULL OR account.id<>target_account_id OR account.status<>'active'
    OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry r WHERE r.account_id=account.id AND r.status='active' AND r.auth_user_id=target_auth_user_id)
    OR EXISTS(SELECT 1 FROM public.account_deletion_requests d WHERE d.user_id=target_auth_user_id AND d.status IN ('pending','public_data_deleted','auth_deletion_pending','failed_safe'))
  THEN RETURN QUERY SELECT 'ACCOUNT_RECOVERY_UNAVAILABLE'::text,NULL::uuid,NULL::uuid; RETURN; END IF;
  IF NOT private.p2b_recovery_absent(account) THEN
    RETURN QUERY SELECT 'ACCOUNT_RECOVERY_ALREADY_REGISTERED'::text,NULL::uuid,NULL::uuid; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-i:recovery-delivery:v1:'||requested_hmac_key_version::text||':'||encode(requested_hmac,'hex'),0));
  issued_at:=clock_timestamp();

  SELECT v.id,d.id INTO existing_verification_id,existing_delivery_id
    FROM private.recovery_email_verifications v
    JOIN private.recovery_delivery_attempts d ON d.verification_id=v.id AND d.account_id=v.account_id
    WHERE v.account_id=account.id AND v.purpose='change' AND v.status='pending' AND v.expires_at>issued_at
      AND v.recovery_email_hmac=requested_hmac AND v.hmac_key_version=requested_hmac_key_version AND d.state='sent'
    ORDER BY v.created_at DESC,d.reserved_at DESC LIMIT 1;
  IF existing_verification_id IS NOT NULL AND existing_delivery_id IS NOT NULL THEN
    RETURN QUERY SELECT 'RECOVERY_DELIVERY_ALREADY_SENT'::text,existing_verification_id,existing_delivery_id; RETURN;
  END IF;

  SELECT max(reserved_at),count(*) INTO latest_reserved_at,account_reservation_count
    FROM private.recovery_delivery_attempts WHERE account_id=account.id AND reserved_at>issued_at-interval '24 hours';
  SELECT count(*) INTO email_reservation_count FROM private.recovery_delivery_attempts
    WHERE recovery_email_hmac=requested_hmac AND hmac_key_version=requested_hmac_key_version AND reserved_at>issued_at-interval '24 hours';
  IF (latest_reserved_at IS NOT NULL AND latest_reserved_at>issued_at-interval '60 seconds')
    OR account_reservation_count>=3 OR email_reservation_count>=5 THEN
    RETURN QUERY SELECT 'RECOVERY_DELIVERY_LIMITED'::text,NULL::uuid,NULL::uuid; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=requested_verification_id) THEN
    RAISE EXCEPTION 'ACCOUNT_RECOVERY_ID_RESERVATION_REJECTED';
  END IF;

  UPDATE private.recovery_delivery_attempts d SET state='failed',failed_at=issued_at
    FROM private.recovery_email_verifications v
    WHERE d.verification_id=v.id AND v.account_id=account.id AND v.purpose='change' AND v.status='pending' AND d.state='reserved';
  UPDATE private.recovery_email_verifications SET status='revoked',revoked_at=issued_at
    WHERE account_id=account.id AND purpose='change' AND status='pending';
  -- Bounded housekeeping: account-scoped ledger rows outside the 24h budget window
  -- (unsent ones were just failed above). Sign-up rows keep their own retention.
  DELETE FROM private.recovery_delivery_attempts
    WHERE account_id IS NOT NULL AND state<>'reserved' AND reserved_at<=issued_at-interval '24 hours';
  INSERT INTO private.recovery_email_verifications(
    id,account_id,purpose,recovery_email_hmac,hmac_key_version,destination_ciphertext,destination_nonce,encryption_key_version,otp_mac,otp_key_version,created_at,expires_at
  ) VALUES(
    requested_verification_id,account.id,'change',requested_hmac,requested_hmac_key_version,requested_ciphertext,requested_nonce,requested_encryption_key_version,requested_otp_mac,requested_otp_key_version,issued_at,issued_at+interval '10 minutes'
  );
  INSERT INTO private.recovery_delivery_attempts(verification_id,account_id,recovery_email_hmac,hmac_key_version,state,reserved_at)
    VALUES(requested_verification_id,account.id,requested_hmac,requested_hmac_key_version,'reserved',issued_at)
    RETURNING id INTO inserted_delivery_id;
  RETURN QUERY SELECT 'RECOVERY_DELIVERY_RESERVED'::text,requested_verification_id,inserted_delivery_id;
END $$;

-- /account "register later": consume the 8-digit OTP. Ownership of the address
-- is proven before the coarse "address unavailable" answer is ever returned.
CREATE FUNCTION public.consume_account_recovery_verification(
  target_auth_user_id uuid,target_verification_id uuid,submitted_otp_mac bytea
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  account private.private_accounts%ROWTYPE;
  verification private.recovery_email_verifications%ROWTYPE;
  delivery private.recovery_delivery_attempts%ROWTYPE;
  failed_count integer;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_auth_user_id IS NULL OR target_verification_id IS NULL OR submitted_otp_mac IS NULL OR octet_length(submitted_otp_mac)<>32
  THEN RETURN 'ACCOUNT_RECOVERY_REJECTED'; END IF;
  SELECT * INTO account FROM private.private_accounts WHERE auth_user_id=target_auth_user_id FOR UPDATE;
  SELECT * INTO verification FROM private.recovery_email_verifications WHERE id=target_verification_id FOR UPDATE;
  SELECT * INTO delivery FROM private.recovery_delivery_attempts WHERE verification_id=target_verification_id FOR UPDATE;
  IF account.id IS NULL OR account.status<>'active' OR verification.id IS NULL OR delivery.id IS NULL
    OR verification.account_id IS DISTINCT FROM account.id OR verification.purpose<>'change'
    OR delivery.account_id IS DISTINCT FROM account.id OR delivery.state<>'sent'
  THEN RETURN 'ACCOUNT_RECOVERY_REJECTED'; END IF;
  IF NOT private.p2b_recovery_absent(account) THEN RETURN 'ACCOUNT_RECOVERY_ALREADY_REGISTERED'; END IF;
  IF verification.status<>'pending' THEN RETURN CASE verification.status WHEN 'locked' THEN 'LOCKED' WHEN 'expired' THEN 'EXPIRED' ELSE 'ACCOUNT_RECOVERY_REJECTED' END; END IF;
  IF verification.expires_at<=clock_timestamp() THEN
    UPDATE private.recovery_email_verifications SET status='expired' WHERE id=verification.id;
    RETURN 'EXPIRED';
  END IF;
  IF verification.otp_mac<>submitted_otp_mac THEN
    failed_count:=verification.failed_attempts+1;
    UPDATE private.recovery_email_verifications SET failed_attempts=failed_count,
      status=CASE WHEN failed_count>=5 THEN 'locked' ELSE 'pending' END WHERE id=verification.id;
    RETURN CASE WHEN failed_count>=5 THEN 'LOCKED' ELSE 'OTP_REJECTED' END;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended('schoollove:10o-g:recovery-decision:v1:'||verification.hmac_key_version::text||':'||encode(verification.recovery_email_hmac,'hex'),0));
  IF EXISTS(SELECT 1 FROM private.private_accounts a WHERE a.id<>account.id
      AND a.recovery_email_hmac=verification.recovery_email_hmac AND a.recovery_email_hmac_key_version=verification.hmac_key_version
      AND a.recovery_email_verified_at IS NOT NULL AND a.status IN ('provisional','active','deletion_pending','cleanup_failed_safe'))
  THEN
    UPDATE private.recovery_email_verifications SET status='revoked',revoked_at=clock_timestamp() WHERE id=verification.id;
    RETURN 'RECOVERY_EMAIL_UNAVAILABLE';
  END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET recovery_email_hmac=verification.recovery_email_hmac,
    recovery_email_hmac_key_version=verification.hmac_key_version,recovery_email_ciphertext=verification.destination_ciphertext,
    recovery_email_nonce=verification.destination_nonce,recovery_email_encryption_key_version=verification.encryption_key_version,
    recovery_email_verified_at=clock_timestamp()
    WHERE id=account.id AND status='active' AND recovery_email_hmac IS NULL AND recovery_email_verified_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_RECOVERY_TARGET_CHANGED'; END IF;
  UPDATE private.recovery_email_verifications SET status='consumed',consumed_at=clock_timestamp() WHERE id=verification.id;
  RETURN 'RECOVERY_REGISTERED';
END $$;

REVOKE ALL ON FUNCTION private.p2b_recovery_absent(private.private_accounts) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.p2b_recovery_complete(private.private_accounts) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.record_verified_google_identity_recovery_optional(uuid,uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bind_social_auth_principal_from_attempt_recovery_optional(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activate_social_account_from_attempt_recovery_optional(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_and_reserve_account_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.consume_account_recovery_verification(uuid,uuid,bytea) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_google_identity_recovery_optional(uuid,uuid,text,text,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_social_auth_principal_from_attempt_recovery_optional(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_social_account_from_attempt_recovery_optional(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_and_reserve_account_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_account_recovery_verification(uuid,uuid,bytea) TO service_role;

COMMENT ON CONSTRAINT private_accounts_active_principal_recovery_atomic ON private.private_accounts IS
  'P2b E1: active requires Auth principal and activation; recovery custody is all-or-nothing (registered later from /account).';
COMMENT ON FUNCTION public.record_verified_google_identity_recovery_optional(uuid,uuid,text,text,bytea,integer) IS
  'P2b Google decision without a recovery step; delegates every non-owned case to the legacy wrapper before account/identity locks.';
COMMENT ON FUNCTION public.create_and_reserve_account_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer) IS
  'P2b /account later recovery registration; shares the 24h per-address budget with sign-up recovery.';
COMMIT;
