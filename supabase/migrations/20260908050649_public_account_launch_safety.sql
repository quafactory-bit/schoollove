-- Public launch safety: no existing account, relationship, flag or launch-state mutation.
-- Additive operational ceiling; existing snapshots stay immutable.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public-account-launch-safety-v1',0));
DO $$ BEGIN
  IF to_regprocedure('public.revoke_social_identity_for_deletion(uuid)') IS NULL
    OR to_regprocedure('public.enqueue_auth_principal_cleanup(uuid,uuid)') IS NULL
    OR to_regprocedure('public.consume_broker_authorization_code(bytea,text,text,text)') IS NULL
    OR to_regclass('public.beta_onboarding_invite_claims') IS NULL
  THEN RAISE EXCEPTION 'PUBLIC_LAUNCH_SAFETY_BASELINE_MISSING'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_prepare_public_account_deletion(
  target_request_id uuid,requested_reason text,admin_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.account_deletion_requests%ROWTYPE; social_account_id uuid; cleanup_job_id uuid;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_DELETION_PREPARATION'; END IF;
  SELECT * INTO request FROM public.account_deletion_requests WHERE id=target_request_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'DELETION_REQUEST_NOT_FOUND'; END IF;
  IF request.status NOT IN ('pending','failed_safe') OR request.user_id IS NULL
    THEN RAISE EXCEPTION 'DELETION_REQUEST_NOT_PREPARABLE'; END IF;
  -- Prepare the social lifecycle before any irreversible public-data removal.
  SELECT id INTO social_account_id FROM private.private_accounts WHERE auth_user_id=request.user_id FOR UPDATE;
  IF social_account_id IS NOT NULL THEN
    PERFORM public.revoke_social_identity_for_deletion(social_account_id);
    cleanup_job_id:=public.enqueue_auth_principal_cleanup(social_account_id,NULL);
  END IF;
  DELETE FROM public.beta_onboarding_progress WHERE user_id=request.user_id;
  DELETE FROM public.private_profiles WHERE owner_user_id=request.user_id;
  DELETE FROM public.consent_records WHERE user_id=request.user_id;
  DELETE FROM public.adult_eligibility_records WHERE user_id=request.user_id;
  UPDATE auth.users SET banned_until='9999-12-31 23:59:59+00'::timestamptz,updated_at=clock_timestamp()
    WHERE id=request.user_id;
  UPDATE public.account_deletion_requests SET status='public_data_deleted',reason=NULL,resolved_at=NULL
    WHERE id=request.id;
  INSERT INTO public.public_account_launch_audit(action,reason_code,actor_reference,target_id,metadata)
  VALUES('deletion_prepared',requested_reason,admin_actor,request.id,
    jsonb_build_object('public_data_deleted',true,'auth_deletion_required',true,'cleanup_job_id',cleanup_job_id));
  RETURN jsonb_build_object('request_id',request.id,'public_data_deleted',true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_finalize_public_account_auth_deletion(
  target_request_id uuid,requested_reason text,admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_AUTH_DELETION_FINALIZATION'; END IF;
  UPDATE public.account_deletion_requests SET status='done',reason=NULL,resolved_at=clock_timestamp(),
    purge_after=clock_timestamp()+interval '90 days'
    WHERE id=target_request_id AND status='auth_deletion_pending' AND user_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_IDENTITY_STILL_LINKED'; END IF;
  -- The preparation record owns the exact cleanup job; never complete another account's job.
  UPDATE private.auth_principal_cleanup_jobs job
  SET status='completed',completed_at=clock_timestamp(),next_retry_at=NULL,coarse_error_code=NULL
  WHERE job.id IN (
    SELECT (audit.metadata->>'cleanup_job_id')::uuid
    FROM public.public_account_launch_audit audit
    WHERE audit.target_id=target_request_id AND audit.action='deletion_prepared'
      AND audit.metadata->>'cleanup_job_id' IS NOT NULL
  ) AND job.status<>'completed'
    AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=job.auth_user_id);
  INSERT INTO public.public_account_launch_audit(action,reason_code,actor_reference,target_id,metadata)
  VALUES('deletion_completed',requested_reason,admin_actor,target_request_id,
    jsonb_build_object('auth_identity_deleted',true,'deidentified_request_purge_days',90));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.consume_broker_authorization_code(
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
DECLARE code private.broker_authorization_codes%ROWTYPE; attempt private.oauth_login_attempts%ROWTYPE; now_at timestamptz:=clock_timestamp(); launch public.public_account_launch_control%ROWTYPE; login_allowed boolean;
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
  -- Serialize a fresh token exchange with registration close / emergency stop.
  -- Existing bound principals may return while merely closed; new principals may not.
  SELECT * INTO launch FROM public.public_account_launch_control
    WHERE control_key='public_account' FOR SHARE;
  login_allowed:=launch.control_key IS NOT NULL
    AND launch.state IN ('closed','internal_test','ready','open')
    AND launch.emergency_stopped_at IS NULL
    AND EXISTS (
      SELECT 1 FROM private.private_accounts account
      JOIN private.social_identity_registry identity ON identity.account_id=account.id
      WHERE account.id=attempt.account_id AND account.primary_broker_subject=attempt.broker_subject
        AND identity.broker_subject=attempt.broker_subject
        AND account.status IN ('provisional','active') AND identity.status IN ('provisional','active')
        AND (
          (account.auth_user_id IS NOT NULL AND identity.auth_user_id=account.auth_user_id
            AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=account.auth_user_id))
          OR (launch.state='open' AND launch.account_registration_enabled
            AND launch.private_profile_enabled AND launch.school_membership_enabled)
        )
    );
  IF login_allowed IS DISTINCT FROM true THEN
    UPDATE private.broker_authorization_codes SET state='rejected',rejected_at=now_at WHERE id=code.id;
    UPDATE private.oauth_login_attempts SET state='failed_safe',coarse_terminal_reason='failed_safe',
      updated_at=now_at,version=version+1 WHERE id=attempt.id;
    RETURN QUERY SELECT 'AUTHORIZATION_CODE_REJECTED'::text,NULL::text,NULL::bigint,NULL::text,NULL::bytea,NULL::bytea,NULL::bytea,NULL::integer,NULL::uuid;
    RETURN;
  END IF;
  UPDATE private.broker_authorization_codes SET state='consumed',consumed_at=now_at WHERE id=code.id;
  UPDATE private.oauth_login_attempts SET state='consumed',consumed_at=now_at,updated_at=now_at,version=version+1 WHERE id=attempt.id;
  RETURN QUERY SELECT 'AUTHORIZATION_CODE_CONSUMED'::text,attempt.broker_subject,code.authentication_time,code.client_id,code.downstream_nonce_digest,code.downstream_nonce_ciphertext,code.downstream_nonce_iv,code.downstream_nonce_key_version::integer,code.id;
END $$;

-- The immutable snapshot is the contract ceiling; this nullable operational ceiling
-- can only narrow it. NULL preserves pre-existing programs until explicitly configured.
ALTER TABLE public.beta_programs ADD COLUMN operational_max_users integer
  CHECK (operational_max_users BETWEEN 1 AND 20);

CREATE FUNCTION private.beta_operational_occupancy(target_program_id uuid)
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT (
    SELECT count(DISTINCT user_id) FROM (
      SELECT user_id FROM public.beta_members
        WHERE program_id=target_program_id AND status IN ('pending_review','active','suspended')
      UNION
      SELECT user_id FROM public.beta_onboarding_invite_claims
        WHERE program_id=target_program_id AND status='claimed' AND expires_at>clock_timestamp()
    ) occupants
  ) + (
    SELECT coalesce(sum(invite.max_uses-invite.use_count),0)
    FROM public.beta_invites invite
    WHERE invite.program_id=target_program_id AND invite.revoked_at IS NULL
      AND invite.expires_at>clock_timestamp() AND invite.use_count<invite.max_uses
      AND NOT EXISTS (
        SELECT 1 FROM public.beta_members member
        WHERE member.invite_id=invite.id AND member.status IN ('pending_review','active','suspended')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.beta_onboarding_invite_claims claim
        WHERE claim.invite_id=invite.id AND claim.status='claimed' AND claim.expires_at>clock_timestamp()
      )
  );
$$;

CREATE FUNCTION private.enforce_beta_operational_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cap integer;
BEGIN
  IF TG_OP='UPDATE' AND NEW.program_id IS DISTINCT FROM OLD.program_id
    THEN RAISE EXCEPTION 'BETA_PROGRAM_IMMUTABLE'; END IF;
  SELECT operational_max_users INTO cap FROM public.beta_programs WHERE id=NEW.program_id FOR UPDATE;
  IF TG_WHEN='AFTER' AND cap IS NOT NULL
    AND private.beta_operational_occupancy(NEW.program_id)>cap
    THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER beta_invites_operational_lock BEFORE INSERT OR UPDATE ON public.beta_invites
FOR EACH ROW EXECUTE FUNCTION private.enforce_beta_operational_capacity();
CREATE TRIGGER beta_invites_operational_capacity AFTER INSERT OR UPDATE ON public.beta_invites
FOR EACH ROW EXECUTE FUNCTION private.enforce_beta_operational_capacity();
CREATE TRIGGER beta_members_operational_lock BEFORE INSERT OR UPDATE ON public.beta_members
FOR EACH ROW EXECUTE FUNCTION private.enforce_beta_operational_capacity();
CREATE TRIGGER beta_members_operational_capacity AFTER INSERT OR UPDATE ON public.beta_members
FOR EACH ROW EXECUTE FUNCTION private.enforce_beta_operational_capacity();
CREATE TRIGGER beta_claims_operational_lock BEFORE INSERT OR UPDATE ON public.beta_onboarding_invite_claims
FOR EACH ROW EXECUTE FUNCTION private.enforce_beta_operational_capacity();
CREATE TRIGGER beta_claims_operational_capacity AFTER INSERT OR UPDATE ON public.beta_onboarding_invite_claims
FOR EACH ROW EXECUTE FUNCTION private.enforce_beta_operational_capacity();

CREATE FUNCTION public.admin_set_beta_operational_cap(
  target_program_id uuid,requested_max_users integer,requested_reason text,admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE program public.beta_programs%ROWTYPE; ceiling integer;
BEGIN
  IF requested_max_users IS NULL OR requested_max_users NOT BETWEEN 1 AND 20
    OR requested_reason IS NULL OR requested_reason !~ '^[A-Z0-9_]{2,60}$'
    OR admin_actor IS NULL OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_OPERATIONAL_CAP'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  SELECT max_users INTO ceiling FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  IF program.id IS NULL OR ceiling IS NULL OR requested_max_users>ceiling
    THEN RAISE EXCEPTION 'PROGRAM_SETUP_CONTRACT_INVALID'; END IF;
  IF private.beta_operational_occupancy(program.id)>requested_max_users
    THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  UPDATE public.beta_programs SET operational_max_users=requested_max_users WHERE id=program.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'operational_cap_set','beta_program',program.id,requested_reason,
    jsonb_build_object('before',program.operational_max_users,'after',requested_max_users,'snapshot_ceiling',ceiling));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.beta_operational_occupancy(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.enforce_beta_operational_capacity() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_set_beta_operational_cap(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_beta_operational_cap(uuid,integer,text,text) TO service_role;

COMMIT;
