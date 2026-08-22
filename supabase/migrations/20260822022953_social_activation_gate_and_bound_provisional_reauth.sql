-- PHASE 10P: restore the durable public launch singleton fail-closed, harden
-- social activation, and permit exact bound-provisional same-provider reauth.
-- Forward-only. Existing valid launch state is preserved byte-for-byte.
BEGIN;

DO $phase10p_activation_preflight$
BEGIN
  IF to_regclass('public.public_account_launch_control') IS NULL
    OR to_regclass('public.public_account_launch_audit') IS NULL
    OR to_regclass('private.private_accounts') IS NULL
    OR to_regclass('private.social_identity_registry') IS NULL
    OR to_regclass('private.oauth_login_attempts') IS NULL
    OR to_regclass('private.upstream_login_legs') IS NULL
    OR to_regclass('private.downstream_authorization_transactions') IS NULL
    OR to_regprocedure('private.require_social_attempt_service()') IS NULL
    OR to_regprocedure('private.scrub_upstream_login_leg(uuid,text,timestamp with time zone)') IS NULL
    OR to_regprocedure('public.activate_social_account(uuid)') IS NULL
    OR to_regprocedure('public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)') IS NULL
    OR to_regprocedure('public.activate_social_account_from_attempt(uuid)') IS NOT NULL
    OR to_regprocedure('private.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'PHASE10P_SOCIAL_ACTIVATION_BASELINE_INVALID';
  END IF;
END
$phase10p_activation_preflight$;

LOCK TABLE public.public_account_launch_control IN SHARE ROW EXCLUSIVE MODE;

DO $phase10p_launch_singleton_repair$
DECLARE
  row_count integer;
  launch public.public_account_launch_control%ROWTYPE;
BEGIN
  SELECT count(*) INTO row_count FROM public.public_account_launch_control;
  IF row_count > 1 THEN
    RAISE EXCEPTION 'PHASE10P_LAUNCH_SINGLETON_AMBIGUOUS';
  ELSIF row_count = 0 THEN
    INSERT INTO public.public_account_launch_control(
      control_key,state,account_registration_enabled,private_profile_enabled,
      school_membership_enabled,emergency_stopped_at,last_reason_code,updated_by
    ) VALUES (
      'public_account','closed',false,false,false,NULL,
      'MISSING_SINGLETON_RESTORED_CLOSED','phase10p_migration'
    );
    INSERT INTO public.public_account_launch_audit(
      action,from_state,to_state,reason_code,actor_reference,metadata
    ) VALUES (
      'state_changed',NULL,'closed','MISSING_SINGLETON_RESTORED_CLOSED',
      'phase10p_migration',
      '{"repair":"missing_singleton","result":"closed"}'::jsonb
    );
    RETURN;
  END IF;

  SELECT * INTO STRICT launch FROM public.public_account_launch_control;
  IF launch.control_key IS DISTINCT FROM 'public_account'
    OR launch.state IS NULL
    OR launch.state NOT IN ('closed','internal_test','ready','open','emergency_stopped')
    OR launch.account_registration_enabled IS NULL
    OR launch.private_profile_enabled IS NULL
    OR launch.school_membership_enabled IS NULL
    OR launch.last_reason_code IS NULL
    OR launch.last_reason_code !~ '^[A-Z0-9_]{2,60}$'
    OR launch.updated_by IS NULL
    OR char_length(launch.updated_by) NOT BETWEEN 1 AND 100
    OR launch.updated_at IS NULL
    OR (CASE launch.state
      WHEN 'open' THEN NOT (
        launch.account_registration_enabled IS TRUE
        AND launch.private_profile_enabled IS TRUE
        AND launch.school_membership_enabled IS TRUE
        AND launch.emergency_stopped_at IS NULL
      )
      WHEN 'internal_test' THEN NOT (
        launch.account_registration_enabled IS FALSE
        AND launch.private_profile_enabled IS TRUE
        AND launch.school_membership_enabled IS TRUE
        AND launch.emergency_stopped_at IS NULL
      )
      WHEN 'emergency_stopped' THEN NOT (
        launch.account_registration_enabled IS FALSE
        AND launch.private_profile_enabled IS FALSE
        AND launch.school_membership_enabled IS FALSE
        AND launch.emergency_stopped_at IS NOT NULL
      )
      ELSE NOT (
        launch.account_registration_enabled IS FALSE
        AND launch.private_profile_enabled IS FALSE
        AND launch.school_membership_enabled IS FALSE
        AND launch.emergency_stopped_at IS NULL
      )
    END)
  THEN
    RAISE EXCEPTION 'PHASE10P_LAUNCH_SINGLETON_MALFORMED';
  END IF;
END
$phase10p_launch_singleton_repair$;

CREATE OR REPLACE FUNCTION public.activate_social_account(target_account_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  account private.private_accounts%ROWTYPE;
  identity private.social_identity_registry%ROWTYPE;
  launch public.public_account_launch_control%ROWTYPE;
  launch_count integer;
  identity_count integer;
  activation_time timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_service();
  IF target_account_id IS NULL THEN RAISE EXCEPTION 'SOCIAL_ACTIVATION_RECOVERY_REQUIRED'; END IF;
  SELECT * INTO account FROM private.private_accounts WHERE id=target_account_id FOR UPDATE;
  SELECT count(*) INTO identity_count FROM private.social_identity_registry WHERE account_id=target_account_id;
  IF identity_count=1 THEN
    SELECT * INTO identity FROM private.social_identity_registry WHERE account_id=target_account_id FOR UPDATE;
  END IF;
  SELECT count(*) INTO launch_count FROM public.public_account_launch_control;
  IF launch_count<>1 THEN RAISE EXCEPTION 'SOCIAL_ACCOUNT_LAUNCH_CLOSED'; END IF;
  SELECT * INTO STRICT launch FROM public.public_account_launch_control FOR SHARE;

  IF account.id IS NULL OR account.status<>'provisional' OR account.auth_user_id IS NULL
    OR account.recovery_email_hmac IS NULL OR account.recovery_email_hmac_key_version IS NULL
    OR account.recovery_email_ciphertext IS NULL OR account.recovery_email_nonce IS NULL
    OR account.recovery_email_encryption_key_version IS NULL OR account.recovery_email_verified_at IS NULL
    OR identity_count<>1 OR identity.broker_subject IS NULL OR identity.account_id IS DISTINCT FROM account.id
    OR identity.status IS DISTINCT FROM 'provisional' OR identity.auth_user_id IS DISTINCT FROM account.auth_user_id
    OR identity.provider IS DISTINCT FROM account.primary_provider
    OR identity.broker_subject IS DISTINCT FROM account.primary_broker_subject
  THEN RAISE EXCEPTION 'SOCIAL_ACTIVATION_RECOVERY_REQUIRED'; END IF;

  IF launch.control_key IS DISTINCT FROM 'public_account'
    OR launch.state IS DISTINCT FROM 'open'
    OR launch.account_registration_enabled IS DISTINCT FROM true
    OR launch.private_profile_enabled IS DISTINCT FROM true
    OR launch.school_membership_enabled IS DISTINCT FROM true
    OR launch.emergency_stopped_at IS NOT NULL
  THEN RAISE EXCEPTION 'SOCIAL_ACCOUNT_LAUNCH_CLOSED'; END IF;

  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET status='active',activated_at=activation_time WHERE id=account.id AND status='provisional';
  IF NOT FOUND THEN RAISE EXCEPTION 'SOCIAL_ACTIVATION_RECOVERY_REQUIRED'; END IF;
  UPDATE private.social_identity_registry SET status='active',activated_at=activation_time
    WHERE broker_subject=identity.broker_subject AND account_id=account.id AND status='provisional';
  IF NOT FOUND THEN RAISE EXCEPTION 'SOCIAL_PRIMARY_IDENTITY_REQUIRED'; END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.activate_social_account_from_attempt(target_attempt_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  attempt private.oauth_login_attempts%ROWTYPE;
  account private.private_accounts%ROWTYPE;
  identity private.social_identity_registry%ROWTYPE;
  auth_identity_count integer;
  auth_mapping_count integer;
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
    OR account.recovery_email_verified_at IS NULL OR account.recovery_email_hmac IS NULL
    OR account.recovery_email_hmac_key_version IS NULL OR account.recovery_email_ciphertext IS NULL
    OR account.recovery_email_nonce IS NULL OR account.recovery_email_encryption_key_version IS NULL
    OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=account.auth_user_id)
  THEN RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'; END IF;

  SELECT count(*) INTO auth_identity_count FROM auth.identities i
    WHERE i.user_id=account.auth_user_id
      AND i.provider='custom:schoollove-'||attempt.provider
      AND i.provider_id=attempt.broker_subject
      AND i.identity_data->>'sub'=attempt.broker_subject;
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

  BEGIN
    PERFORM public.activate_social_account(account.id);
    RETURN 'SOCIAL_ACCOUNT_ACTIVATED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RETURN 'SOCIAL_ACCOUNT_LAUNCH_CLOSED'; END IF;
    RETURN 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED';
  END;
END $$;

-- Keep the previous implementation as an unexposed helper so the new public
-- wrapper can add the exact bound-provisional branch without weakening any
-- earlier recovery/orphan/collision behavior.
ALTER FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)
  RENAME TO record_verified_identity_before_bound_reauth;
ALTER FUNCTION public.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)
  SET SCHEMA private;
REVOKE ALL ON FUNCTION private.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.record_verified_social_identity_from_upstream_leg(
  target_attempt_id uuid,target_leg_id uuid,requested_provider text,requested_broker_subject text,
  requested_subject_digest bytea,requested_subject_key_version integer
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tx private.downstream_authorization_transactions%ROWTYPE;
  attempt private.oauth_login_attempts%ROWTYPE;
  leg private.upstream_login_legs%ROWTYPE;
  account private.private_accounts%ROWTYPE;
  identity private.social_identity_registry%ROWTYPE;
  candidate_account_id uuid;
  auth_identity_count integer;
  auth_mapping_count integer;
  now_at timestamptz:=clock_timestamp();
  next_tx_status text;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_attempt_id IS NULL OR target_leg_id IS NULL OR requested_provider NOT IN ('google','kakao','naver')
    OR requested_broker_subject !~ ('^slb:v1:k[0-9]{2}:'||requested_provider||':[A-Za-z0-9_-]{43}$')
    OR requested_subject_digest IS NULL OR octet_length(requested_subject_digest)<>32
    OR requested_subject_key_version NOT BETWEEN 1 AND 99
    OR split_part(requested_broker_subject,':',3) IS DISTINCT FROM 'k'||lpad(requested_subject_key_version::text,2,'0')
    OR split_part(requested_broker_subject,':',5) IS DISTINCT FROM replace(replace(replace(encode(requested_subject_digest,'base64'),'+','-'),'/','_'),'=','')
  THEN
    RETURN private.record_verified_identity_before_bound_reauth(
      target_attempt_id,target_leg_id,requested_provider,requested_broker_subject,requested_subject_digest,requested_subject_key_version
    );
  END IF;

  -- Current mutable rows precede the broker authority. Candidate account and
  -- identity rows are not locked until a coarse bound-provisional read says
  -- this wrapper, rather than the legacy orphan/recovery helper, owns the case.
  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE login_attempt_id=target_attempt_id FOR UPDATE;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=target_leg_id AND login_attempt_id=target_attempt_id FOR UPDATE;
  IF tx.id IS NULL OR attempt.id IS NULL OR leg.id IS NULL
    OR tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM leg.id OR tx.expires_at<=now_at
    OR attempt.state<>'upstream_pending' OR attempt.provider IS DISTINCT FROM requested_provider OR attempt.expires_at<=now_at
    OR leg.status<>'callback_claimed' OR leg.provider IS DISTINCT FROM requested_provider OR leg.expires_at<=now_at
  THEN
    RETURN private.record_verified_identity_before_bound_reauth(
      target_attempt_id,target_leg_id,requested_provider,requested_broker_subject,requested_subject_digest,requested_subject_key_version
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'schoollove:10o-g:broker-decision:v1:'||requested_provider||':'||requested_subject_key_version::text||':'||encode(requested_subject_digest,'hex'),0
  ));
  now_at:=clock_timestamp();

  -- This is deliberately non-locking. Anything except one plausible exact
  -- bound provisional tuple delegates before account/identity row locks, so
  -- the legacy code -> attempt -> account -> identity order remains intact.
  SELECT r.account_id INTO candidate_account_id
    FROM private.social_identity_registry r
    JOIN private.private_accounts a ON a.id=r.account_id
    WHERE r.broker_subject=requested_broker_subject
      AND r.provider=requested_provider AND r.subject_digest=requested_subject_digest
      AND r.subject_key_version=requested_subject_key_version AND r.status='provisional'
      AND r.auth_user_id IS NOT NULL
      AND a.status='provisional' AND a.auth_user_id=r.auth_user_id
      AND a.primary_provider=requested_provider AND a.primary_broker_subject=requested_broker_subject
      AND a.recovery_email_verified_at IS NOT NULL AND a.recovery_email_hmac IS NOT NULL
      AND a.recovery_email_hmac_key_version IS NOT NULL AND a.recovery_email_ciphertext IS NOT NULL
      AND a.recovery_email_nonce IS NOT NULL AND a.recovery_email_encryption_key_version IS NOT NULL;
  IF candidate_account_id IS NULL THEN
    RETURN private.record_verified_identity_before_bound_reauth(
      target_attempt_id,target_leg_id,requested_provider,requested_broker_subject,requested_subject_digest,requested_subject_key_version
    );
  END IF;

  -- Canonical candidate lock order: account, then identity. No legacy helper
  -- call is permitted after either lock has been acquired.
  SELECT * INTO account FROM private.private_accounts WHERE id=candidate_account_id FOR UPDATE;
  SELECT * INTO identity FROM private.social_identity_registry WHERE broker_subject=requested_broker_subject FOR UPDATE;

  -- Account/identity waits may outlive every current-flow credential. Refresh
  -- wall-clock time after both candidate locks and give current-target expiry
  -- priority over either the provisional or concurrently activated candidate.
  now_at:=clock_timestamp();
  IF tx.id IS NULL OR tx.login_attempt_id IS DISTINCT FROM target_attempt_id
    OR tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS DISTINCT FROM target_leg_id OR tx.expires_at<=now_at
    OR attempt.id IS DISTINCT FROM target_attempt_id OR attempt.state<>'upstream_pending'
    OR attempt.provider IS DISTINCT FROM requested_provider OR attempt.expires_at<=now_at
    OR leg.id IS DISTINCT FROM target_leg_id OR leg.login_attempt_id IS DISTINCT FROM target_attempt_id
    OR leg.status<>'callback_claimed' OR leg.provider IS DISTINCT FROM requested_provider OR leg.expires_at<=now_at
  THEN
    next_tx_status:=CASE
      WHEN tx.expires_at<=now_at OR attempt.expires_at<=now_at OR leg.expires_at<=now_at THEN 'expired'
      ELSE 'rejected'
    END;
    IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,next_tx_status,now_at)
    THEN RETURN 'IDENTITY_REJECTED'; END IF;
    PERFORM private.scrub_upstream_login_leg(leg.id,next_tx_status,now_at);
    UPDATE private.oauth_login_attempts
      SET state=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,
          coarse_terminal_reason=CASE WHEN next_tx_status='expired' THEN 'expired' ELSE 'failed_safe' END,
          updated_at=now_at,version=version+1
      WHERE id=attempt.id AND state='upstream_pending';
    RETURN CASE WHEN next_tx_status='expired' THEN 'EXPIRED' ELSE 'IDENTITY_REJECTED' END;
  END IF;

  IF tx.status='upstream_bound' AND tx.upstream_login_leg_id=leg.id AND tx.expires_at>now_at
    AND attempt.state='upstream_pending' AND attempt.provider=requested_provider AND attempt.expires_at>now_at
    AND leg.status='callback_claimed' AND leg.provider=requested_provider AND leg.expires_at>now_at
    AND account.id=candidate_account_id AND account.status='provisional' AND account.auth_user_id IS NOT NULL
    AND account.recovery_email_verified_at IS NOT NULL AND account.recovery_email_hmac IS NOT NULL
    AND account.recovery_email_hmac_key_version IS NOT NULL AND account.recovery_email_ciphertext IS NOT NULL
    AND account.recovery_email_nonce IS NOT NULL AND account.recovery_email_encryption_key_version IS NOT NULL
    AND account.primary_provider=requested_provider AND account.primary_broker_subject=requested_broker_subject
    AND identity.account_id=account.id AND identity.status='provisional'
    AND identity.provider=requested_provider AND identity.broker_subject=requested_broker_subject
    AND identity.subject_digest=requested_subject_digest AND identity.subject_key_version=requested_subject_key_version
    AND identity.auth_user_id=account.auth_user_id
    AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=account.auth_user_id)
  THEN
    SELECT count(*) INTO auth_identity_count FROM auth.identities i
      WHERE i.user_id=account.auth_user_id AND i.provider='custom:schoollove-'||requested_provider
        AND i.provider_id=requested_broker_subject AND i.identity_data->>'sub'=requested_broker_subject;
    SELECT count(*) INTO auth_mapping_count FROM auth.identities i
      WHERE i.provider='custom:schoollove-'||requested_provider
        AND (i.user_id=account.auth_user_id OR i.provider_id=requested_broker_subject OR i.identity_data->>'sub'=requested_broker_subject);
    IF auth_identity_count=1 AND auth_mapping_count=1 THEN
      PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
      UPDATE private.oauth_login_attempts SET state='auth_principal_bound',broker_subject=requested_broker_subject,
        subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,
        account_id=account.id,updated_at=now_at,version=version+1
        WHERE id=attempt.id AND state='upstream_pending';
      IF FOUND THEN RETURN 'BOUND_PROVISIONAL_REAUTH_READY'; END IF;
    END IF;
  END IF;

  -- A concurrent legitimate activation may win while this wrapper waits for
  -- the account lock. Revalidate the complete immutable provider/subject/Auth
  -- tuple and return the trusted active result directly, without re-entering
  -- the legacy helper in the reverse lock order.
  IF tx.status='upstream_bound' AND tx.upstream_login_leg_id=leg.id AND tx.expires_at>now_at
    AND attempt.state='upstream_pending' AND attempt.provider=requested_provider AND attempt.expires_at>now_at
    AND leg.status='callback_claimed' AND leg.provider=requested_provider AND leg.expires_at>now_at
    AND account.id=candidate_account_id AND account.status='active' AND account.auth_user_id IS NOT NULL
    AND account.activated_at IS NOT NULL AND account.primary_provider=requested_provider
    AND account.primary_broker_subject=requested_broker_subject
    AND identity.account_id=account.id AND identity.status='active' AND identity.activated_at IS NOT NULL
    AND identity.provider=requested_provider AND identity.broker_subject=requested_broker_subject
    AND identity.subject_digest=requested_subject_digest AND identity.subject_key_version=requested_subject_key_version
    AND identity.auth_user_id=account.auth_user_id
    AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=account.auth_user_id)
  THEN
    SELECT count(*) INTO auth_identity_count FROM auth.identities i
      WHERE i.user_id=account.auth_user_id AND i.provider='custom:schoollove-'||requested_provider
        AND i.provider_id=requested_broker_subject AND i.identity_data->>'sub'=requested_broker_subject;
    SELECT count(*) INTO auth_mapping_count FROM auth.identities i
      WHERE i.provider='custom:schoollove-'||requested_provider
        AND (i.user_id=account.auth_user_id OR i.provider_id=requested_broker_subject OR i.identity_data->>'sub'=requested_broker_subject);
    IF auth_identity_count=1 AND auth_mapping_count=1 THEN
      PERFORM private.scrub_upstream_login_leg(leg.id,'verified',now_at);
      UPDATE private.oauth_login_attempts SET state='existing_primary',broker_subject=requested_broker_subject,
        subject_digest=requested_subject_digest,subject_key_version=requested_subject_key_version,
        account_id=account.id,updated_at=now_at,version=version+1
        WHERE id=attempt.id AND state='upstream_pending';
      IF FOUND THEN RETURN 'EXISTING_PRIMARY'; END IF;
    END IF;
  END IF;

  IF NOT private.terminalize_bound_downstream_authorization_transaction(attempt.id,leg.id,'rejected',now_at)
  THEN RETURN 'IDENTITY_REJECTED'; END IF;
  PERFORM private.scrub_upstream_login_leg(leg.id,'rejected',now_at);
  UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',updated_at=now_at,version=version+1
    WHERE id=attempt.id AND state='upstream_pending';
  RETURN 'IDENTITY_DECISION_IN_PROGRESS';
END $$;

-- A same-account activation may commit after a reauth attempt reaches
-- auth_principal_bound but before its transaction-bound code is issued. Both
-- issuance boundaries therefore accept the exact provisional-bound OR exact
-- active-bound shape for that state, while preserving all other P contracts.
CREATE OR REPLACE FUNCTION public.issue_transaction_bound_broker_authorization_code(
  target_transaction_id uuid,requested_code_id uuid,requested_code_digest bytea,
  requested_authentication_time bigint,requested_downstream_nonce text DEFAULT NULL,
  requested_downstream_nonce_digest bytea DEFAULT NULL,requested_downstream_nonce_ciphertext bytea DEFAULT NULL,
  requested_downstream_nonce_iv bytea DEFAULT NULL,requested_downstream_nonce_key_version integer DEFAULT NULL
) RETURNS TABLE(outcome text,code_id uuid,expires_at timestamptz,downstream_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tx private.downstream_authorization_transactions%ROWTYPE;
  attempt private.oauth_login_attempts%ROWTYPE;
  leg private.upstream_login_legs%ROWTYPE;
  issued_at timestamptz:=clock_timestamp(); final_expiry timestamptz; nonce_digest bytea;
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_transaction_id IS NULL OR requested_code_id IS NULL
    OR requested_code_digest IS NULL OR octet_length(requested_code_digest)<>32
    OR requested_authentication_time IS NULL OR requested_authentication_time<0
    OR requested_authentication_time>floor(extract(epoch FROM issued_at))::bigint
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_ciphertext IS NULL))
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_iv IS NULL))
    OR ((requested_downstream_nonce_digest IS NULL) <> (requested_downstream_nonce_key_version IS NULL))
    OR (requested_downstream_nonce_digest IS NOT NULL AND (octet_length(requested_downstream_nonce_digest)<>32 OR octet_length(requested_downstream_nonce_ciphertext)<=16 OR octet_length(requested_downstream_nonce_iv)<>12 OR requested_downstream_nonce_key_version NOT BETWEEN 1 AND 32767))
  THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;

  SELECT * INTO tx FROM private.downstream_authorization_transactions WHERE id=target_transaction_id FOR UPDATE;
  IF tx.id IS NULL OR tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS NULL
  THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=tx.login_attempt_id FOR UPDATE;
  SELECT * INTO leg FROM private.upstream_login_legs WHERE id=tx.upstream_login_leg_id FOR UPDATE;
  IF tx.expires_at<=issued_at OR attempt.id IS NULL OR attempt.expires_at<=issued_at OR leg.id IS NULL OR leg.expires_at<=issued_at THEN
    UPDATE private.downstream_authorization_transactions SET status='expired',downstream_nonce=NULL,downstream_state=NULL,terminal_at=issued_at,version=version+1 WHERE id=tx.id AND status='upstream_bound';
    UPDATE private.oauth_login_attempts SET state='expired',coarse_terminal_reason='expired',updated_at=issued_at,version=version+1 WHERE id=tx.login_attempt_id AND state IN ('account_decided','auth_principal_bound','existing_primary');
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_EXPIRED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN;
  END IF;
  IF leg.login_attempt_id<>tx.login_attempt_id OR leg.status<>'verified' OR attempt.state NOT IN ('account_decided','auth_principal_bound','existing_primary')
  THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM private.private_accounts a JOIN private.social_identity_registry r ON r.account_id=a.id
    WHERE a.id=attempt.account_id AND a.primary_provider=attempt.provider AND a.primary_broker_subject=attempt.broker_subject
      AND r.broker_subject=attempt.broker_subject AND r.provider=attempt.provider
      AND ((attempt.state='account_decided' AND a.status='provisional' AND a.auth_user_id IS NULL AND r.status='provisional' AND r.auth_user_id IS NULL)
        OR (attempt.state='auth_principal_bound' AND (
             (a.status='provisional' AND a.auth_user_id IS NOT NULL AND r.status='provisional' AND r.auth_user_id=a.auth_user_id AND r.activated_at IS NULL)
          OR (a.status='active' AND a.auth_user_id IS NOT NULL AND a.activated_at IS NOT NULL AND r.status='active' AND r.auth_user_id=a.auth_user_id AND r.activated_at IS NOT NULL)
        )) OR (attempt.state='existing_primary' AND a.status='active' AND a.auth_user_id IS NOT NULL AND a.activated_at IS NOT NULL AND r.status='active' AND r.auth_user_id=a.auth_user_id AND r.activated_at IS NOT NULL))
  ) THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;

  IF tx.downstream_nonce IS NULL THEN
    IF requested_downstream_nonce IS NOT NULL OR requested_downstream_nonce_digest IS NOT NULL
    THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  ELSE
    nonce_digest:=extensions.digest(convert_to('schoollove:broker-code-downstream-nonce-digest:v1','UTF8') || decode('00','hex') || convert_to(tx.downstream_nonce,'UTF8'),'sha256');
    IF requested_downstream_nonce IS DISTINCT FROM tx.downstream_nonce OR requested_downstream_nonce_digest IS NULL OR requested_downstream_nonce_digest<>nonce_digest
    THEN RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE authorization_transaction_id=tx.id)
  THEN RETURN QUERY SELECT 'REPLAY_REJECTED'::text,NULL::uuid,NULL::timestamptz,NULL::text; RETURN; END IF;
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

CREATE OR REPLACE FUNCTION public.get_transaction_bound_broker_code_issuance_context(target_attempt_id uuid)
RETURNS TABLE(authorization_transaction_id uuid,login_attempt_id uuid,client_id text,redirect_uri text,pkce_s256_challenge text,downstream_nonce text,downstream_state text,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tx private.downstream_authorization_transactions%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; leg private.upstream_login_legs%ROWTYPE; now_at timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.require_social_attempt_service();
  IF target_attempt_id IS NULL THEN RETURN; END IF;
  SELECT t.* INTO tx FROM private.downstream_authorization_transactions t WHERE t.login_attempt_id=target_attempt_id;
  SELECT a.* INTO attempt FROM private.oauth_login_attempts a WHERE a.id=target_attempt_id;
  IF tx.id IS NULL OR attempt.id IS NULL OR tx.status<>'upstream_bound' OR tx.upstream_login_leg_id IS NULL OR tx.expires_at<=now_at OR attempt.expires_at<=now_at OR attempt.state NOT IN ('account_decided','auth_principal_bound','existing_primary') THEN RETURN; END IF;
  SELECT l.* INTO leg FROM private.upstream_login_legs l WHERE l.id=tx.upstream_login_leg_id;
  IF leg.id IS NULL OR leg.login_attempt_id<>target_attempt_id OR leg.status<>'verified' OR leg.expires_at<=now_at THEN RETURN; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM private.private_accounts a JOIN private.social_identity_registry r ON r.account_id=a.id
    WHERE a.id=attempt.account_id AND a.primary_provider=attempt.provider AND a.primary_broker_subject=attempt.broker_subject
      AND r.broker_subject=attempt.broker_subject AND r.provider=attempt.provider
      AND ((attempt.state='account_decided' AND a.status='provisional' AND a.auth_user_id IS NULL AND r.status='provisional' AND r.auth_user_id IS NULL)
        OR (attempt.state='auth_principal_bound' AND (
             (a.status='provisional' AND a.auth_user_id IS NOT NULL AND r.status='provisional' AND r.auth_user_id=a.auth_user_id AND r.activated_at IS NULL)
          OR (a.status='active' AND a.auth_user_id IS NOT NULL AND a.activated_at IS NOT NULL AND r.status='active' AND r.auth_user_id=a.auth_user_id AND r.activated_at IS NOT NULL)
        )) OR (attempt.state='existing_primary' AND a.status='active' AND a.auth_user_id IS NOT NULL AND a.activated_at IS NOT NULL AND r.status='active' AND r.auth_user_id=a.auth_user_id AND r.activated_at IS NOT NULL))
  ) THEN RETURN; END IF;
  RETURN QUERY SELECT tx.id,tx.login_attempt_id,tx.client_id,tx.redirect_uri,tx.pkce_s256_challenge,tx.downstream_nonce,tx.downstream_state,tx.expires_at;
END $$;

REVOKE ALL ON FUNCTION public.activate_social_account(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activate_social_account_from_attempt(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_social_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_social_account_from_attempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) TO service_role;

COMMENT ON FUNCTION public.activate_social_account_from_attempt(uuid) IS
  'PHASE 10P trusted consumed-attempt activation; exact Auth identity and launch singleton required.';
COMMENT ON FUNCTION public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer) IS
  'PHASE 10P exact bound-provisional same-provider reauth wrapper; legacy recovery and collision paths remain fail-closed.';

COMMIT;
