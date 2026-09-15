-- Approved privacy retention release. Forward-only; no Auth user deletion here.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ BEGIN
  IF to_regprocedure('public.admin_finalize_public_account_auth_deletion(uuid,text,text)') IS NULL
    OR to_regclass('private.recovery_delivery_attempts') IS NULL
    OR to_regclass('auth.sessions') IS NULL
  THEN RAISE EXCEPTION 'PRIVACY_RETENTION_BASELINE_MISSING'; END IF;
END $$;

-- The rolling abuse budget outlives its authentication challenge, never its 24h window.
ALTER TABLE private.recovery_delivery_attempts ALTER COLUMN verification_id DROP NOT NULL;
ALTER TABLE private.recovery_delivery_attempts ALTER COLUMN login_attempt_id DROP NOT NULL;
ALTER TABLE private.recovery_delivery_attempts DROP CONSTRAINT recovery_delivery_attempts_verification_id_fkey;
ALTER TABLE private.recovery_delivery_attempts ADD CONSTRAINT recovery_delivery_attempts_verification_id_fkey
  FOREIGN KEY(verification_id) REFERENCES private.recovery_email_verifications(id) ON DELETE SET NULL;
ALTER TABLE private.recovery_delivery_attempts DROP CONSTRAINT recovery_delivery_attempts_login_attempt_id_fkey;
ALTER TABLE private.recovery_delivery_attempts ADD CONSTRAINT recovery_delivery_attempts_login_attempt_id_fkey
  FOREIGN KEY(login_attempt_id) REFERENCES private.oauth_login_attempts(id) ON DELETE SET NULL;
ALTER TABLE private.recovery_delivery_attempts ADD CONSTRAINT recovery_delivery_reserved_requires_owner
  CHECK(state<>'reserved' OR (verification_id IS NOT NULL AND login_attempt_id IS NOT NULL));

-- Existing safety decisions are not erased by the voluntary-deletion cleanup.
ALTER TABLE private.private_accounts ADD COLUMN deletion_safety_hold boolean NOT NULL DEFAULT false;

CREATE TABLE private.privacy_deletion_daily_totals (
  day date PRIMARY KEY,
  completed_count bigint NOT NULL CHECK(completed_count>0)
);
ALTER TABLE private.privacy_deletion_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.privacy_deletion_daily_totals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.privacy_deletion_daily_totals FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.require_privacy_retention_service() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF session_user<>'postgres' AND auth.role() IS DISTINCT FROM 'service_role'
    THEN RAISE EXCEPTION 'PRIVACY_RETENTION_SERVICE_REQUIRED'; END IF;
END $$;

-- Delete leaf objects in dependency order. Rate-budget rows are detached, not cascaded away.
CREATE FUNCTION private.purge_expired_login_attempt(target_attempt_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE attempt private.oauth_login_attempts%ROWTYPE; at_time timestamptz:=clock_timestamp();
BEGIN
  PERFORM private.lock_downstream_authorization_transaction_for_attempt(target_attempt_id);
  SELECT * INTO attempt FROM private.oauth_login_attempts WHERE id=target_attempt_id FOR UPDATE;
  IF attempt.id IS NULL OR attempt.expires_at>at_time THEN RETURN false; END IF;
  -- An unfinished Auth cleanup must keep its durable source until the Auth step completes.
  IF EXISTS(SELECT 1 FROM private.auth_principal_cleanup_jobs
    WHERE source_attempt_id=attempt.id AND status<>'completed') THEN RETURN false; END IF;
  UPDATE private.recovery_delivery_attempts SET state='failed',failed_at=at_time
    WHERE login_attempt_id=attempt.id AND state='reserved';
  DELETE FROM private.broker_authorization_codes WHERE login_attempt_id=attempt.id;
  DELETE FROM private.downstream_authorization_transactions WHERE login_attempt_id=attempt.id;
  DELETE FROM private.upstream_login_legs WHERE login_attempt_id=attempt.id;
  DELETE FROM private.oauth_login_attempts WHERE id=attempt.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_prepare_public_account_deletion(
  target_request_id uuid,requested_reason text,admin_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.account_deletion_requests%ROWTYPE; social_account_id uuid; cleanup_job_id uuid;
BEGIN
  PERFORM private.require_privacy_retention_service();
  IF requested_reason IS NULL OR requested_reason !~ '^[A-Z0-9_]{2,60}$'
    OR admin_actor IS NULL OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_DELETION_PREPARATION'; END IF;
  SELECT * INTO request FROM public.account_deletion_requests WHERE id=target_request_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'DELETION_REQUEST_NOT_FOUND'; END IF;
  IF request.status IN ('public_data_deleted','auth_deletion_pending','done') THEN
    RETURN jsonb_build_object('request_id',request.id,'public_data_deleted',true,'already_done',request.status='done');
  END IF;
  IF request.status NOT IN ('pending','failed_safe') OR request.user_id IS NULL
    THEN RAISE EXCEPTION 'DELETION_REQUEST_NOT_PREPARABLE'; END IF;
  SELECT id INTO social_account_id FROM private.private_accounts WHERE auth_user_id=request.user_id FOR UPDATE;
  IF social_account_id IS NOT NULL THEN
    UPDATE private.private_accounts SET deletion_safety_hold=deletion_safety_hold OR EXISTS(
      SELECT 1 FROM public.safety_account_restrictions WHERE user_id=request.user_id
    ) WHERE id=social_account_id;
    PERFORM public.revoke_social_identity_for_deletion(social_account_id);
    cleanup_job_id:=public.enqueue_auth_principal_cleanup(social_account_id,NULL);
  END IF;
  DELETE FROM public.beta_onboarding_progress WHERE user_id=request.user_id;
  DELETE FROM public.private_profiles WHERE owner_user_id=request.user_id;
  DELETE FROM public.consent_records WHERE user_id=request.user_id;
  DELETE FROM public.adult_eligibility_records WHERE user_id=request.user_id;
  UPDATE auth.users SET banned_until='9999-12-31 23:59:59+00'::timestamptz,updated_at=clock_timestamp()
    WHERE id=request.user_id;
  -- Refresh sessions cannot outlive a verified deletion request. Old JWTs retain an old UUID only.
  DELETE FROM auth.sessions WHERE user_id=request.user_id;
  UPDATE public.account_deletion_requests SET status='public_data_deleted',reason=NULL,resolved_at=NULL
    WHERE id=request.id;
  INSERT INTO public.public_account_launch_audit(action,reason_code,actor_reference,target_id,metadata)
  VALUES('deletion_prepared',requested_reason,admin_actor,request.id,
    jsonb_build_object('public_data_deleted',true,'auth_deletion_required',true,'cleanup_job_id',cleanup_job_id));
  RETURN jsonb_build_object('request_id',request.id,'public_data_deleted',true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_begin_public_account_auth_deletion(target_request_id uuid,admin_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.account_deletion_requests%ROWTYPE;
BEGIN
  PERFORM private.require_privacy_retention_service();
  IF admin_actor IS NULL OR char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_AUTH_DELETION_ACTOR'; END IF;
  SELECT * INTO request FROM public.account_deletion_requests WHERE id=target_request_id FOR UPDATE;
  IF request.id IS NULL OR request.status NOT IN ('public_data_deleted','auth_deletion_pending','done')
    THEN RAISE EXCEPTION 'PUBLIC_DATA_DELETION_NOT_COMPLETE'; END IF;
  IF request.status<>'done' THEN
    UPDATE public.account_deletion_requests SET status='auth_deletion_pending' WHERE id=request.id;
  END IF;
  RETURN jsonb_build_object('request_id',request.id,'user_id',request.user_id,'already_done',request.status='done');
END $$;

CREATE OR REPLACE FUNCTION public.admin_finalize_public_account_auth_deletion(
  target_request_id uuid,requested_reason text,admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request public.account_deletion_requests%ROWTYPE;
BEGIN
  PERFORM private.require_privacy_retention_service();
  IF requested_reason IS NULL OR requested_reason !~ '^[A-Z0-9_]{2,60}$'
    OR admin_actor IS NULL OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_AUTH_DELETION_FINALIZATION'; END IF;
  SELECT * INTO request FROM public.account_deletion_requests WHERE id=target_request_id FOR UPDATE;
  IF request.status='done' THEN RETURN true; END IF;
  IF request.id IS NULL OR request.status<>'auth_deletion_pending' OR request.user_id IS NOT NULL
    THEN RAISE EXCEPTION 'AUTH_IDENTITY_STILL_LINKED'; END IF;
  IF EXISTS(
    SELECT 1 FROM private.auth_principal_cleanup_jobs job
    JOIN public.public_account_launch_audit audit ON audit.metadata->>'cleanup_job_id'=job.id::text
    WHERE audit.target_id=target_request_id AND audit.action='deletion_prepared'
      AND (EXISTS(SELECT 1 FROM auth.users WHERE id=job.auth_user_id)
        OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=job.auth_user_id))
  ) THEN RAISE EXCEPTION 'AUTH_IDENTITY_STILL_LINKED'; END IF;
  UPDATE private.auth_principal_cleanup_jobs job
    SET status='completed',completed_at=clock_timestamp(),next_retry_at=NULL,coarse_error_code=NULL
    WHERE EXISTS(SELECT 1 FROM public.public_account_launch_audit audit
      WHERE audit.target_id=target_request_id AND audit.action='deletion_prepared'
        AND audit.metadata->>'cleanup_job_id'=job.id::text) AND job.status<>'completed';
  UPDATE public.account_deletion_requests SET status='done',reason=NULL,resolved_at=clock_timestamp(),
    purge_after=clock_timestamp()+interval '15 minutes' WHERE id=target_request_id;
  INSERT INTO public.public_account_launch_audit(action,reason_code,actor_reference,target_id,metadata)
  VALUES('deletion_completed',requested_reason,admin_actor,target_request_id,
    jsonb_build_object('auth_identity_deleted',true,'identity_cleanup_grace_minutes',15));
  RETURN true;
END $$;

CREATE FUNCTION public.run_privacy_retention_cleanup() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE item record; account_row private.private_accounts%ROWTYPE; attempt_id uuid;
  at_time timestamptz:=clock_timestamp(); removed integer:=0; expired integer:=0; deferred integer:=0;
BEGIN
  PERFORM private.require_privacy_retention_service();
  IF NOT pg_try_advisory_xact_lock(hashtextextended('schoollove:privacy-retention:v1',0))
    THEN RETURN jsonb_build_object('ok',true,'busy',true); END IF;
  -- Small independent subtransactions prevent a locked record from starving all expiry work.
  FOR item IN SELECT id FROM private.recovery_email_verifications
    WHERE status='pending' AND expires_at<=at_time ORDER BY expires_at LIMIT 200
  LOOP BEGIN
    UPDATE private.recovery_delivery_attempts SET state='failed',failed_at=at_time
      WHERE verification_id=item.id AND state='reserved';
    UPDATE private.recovery_email_verifications SET status='expired' WHERE id=item.id AND status='pending' AND expires_at<=at_time;
  EXCEPTION WHEN lock_not_available OR deadlock_detected THEN deferred:=deferred+1;
  END; END LOOP;
  FOR item IN SELECT id FROM private.oauth_login_attempts WHERE expires_at<=at_time ORDER BY expires_at LIMIT 200
  LOOP BEGIN
    IF private.purge_expired_login_attempt(item.id) THEN expired:=expired+1; END IF;
  EXCEPTION WHEN lock_not_available OR deadlock_detected THEN deferred:=deferred+1;
  END; END LOOP;
  DELETE FROM private.recovery_delivery_attempts WHERE id IN (
    SELECT id FROM private.recovery_delivery_attempts WHERE reserved_at<=at_time-interval '24 hours'
    ORDER BY reserved_at LIMIT 500
  );
  DELETE FROM private.recovery_email_verifications WHERE id IN (
    SELECT id FROM private.recovery_email_verifications WHERE status<>'pending' AND expires_at<=at_time
    ORDER BY expires_at LIMIT 200
  );
  FOR item IN SELECT id,resolved_at FROM public.account_deletion_requests
    WHERE status='done' AND user_id IS NULL AND resolved_at<=at_time-interval '15 minutes'
    ORDER BY resolved_at LIMIT 100
  LOOP BEGIN
    PERFORM 1 FROM public.account_deletion_requests WHERE id=item.id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM private.auth_principal_cleanup_jobs job
      JOIN public.public_account_launch_audit audit ON audit.metadata->>'cleanup_job_id'=job.id::text
      WHERE audit.target_id=item.id AND audit.action='deletion_prepared'
        AND (job.status<>'completed' OR EXISTS(SELECT 1 FROM auth.users WHERE id=job.auth_user_id)
          OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=job.auth_user_id)))
    THEN RAISE EXCEPTION 'PRIVACY_JOB_NOT_READY' USING ERRCODE='P0002'; END IF;
    FOR account_row IN
      SELECT account.* FROM private.private_accounts account
      JOIN private.auth_principal_cleanup_jobs job ON job.account_id=account.id
      WHERE EXISTS(SELECT 1 FROM public.public_account_launch_audit audit
        WHERE audit.target_id=item.id AND audit.action='deletion_prepared'
          AND audit.metadata->>'cleanup_job_id'=job.id::text)
      FOR UPDATE OF account
    LOOP
      IF account_row.auth_user_id IS NOT NULL OR account_row.status NOT IN ('deletion_pending','cleanup_failed_safe')
        OR account_row.deletion_safety_hold
        OR EXISTS(SELECT 1 FROM private.auth_principal_cleanup_jobs job WHERE job.account_id=account_row.id
          AND (job.status<>'completed' OR EXISTS(SELECT 1 FROM auth.users WHERE id=job.auth_user_id)
            OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=job.auth_user_id)))
      THEN RAISE EXCEPTION 'PRIVACY_IDENTITY_NOT_READY' USING ERRCODE='P0002'; END IF;
      FOR attempt_id IN SELECT id FROM private.oauth_login_attempts WHERE account_id=account_row.id LOOP
        IF NOT private.purge_expired_login_attempt(attempt_id) THEN
          RAISE EXCEPTION 'PRIVACY_ATTEMPT_NOT_READY' USING ERRCODE='P0002';
        END IF;
      END LOOP;
      DELETE FROM private.auth_principal_cleanup_jobs WHERE account_id=account_row.id AND status='completed';
      DELETE FROM private.private_accounts WHERE id=account_row.id;
    END LOOP;
    -- Also remove a completed, detached job whose account was previously removed.
    DELETE FROM private.auth_principal_cleanup_jobs job WHERE job.status='completed'
      AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=job.auth_user_id)
      AND NOT EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=job.auth_user_id)
      AND EXISTS(SELECT 1 FROM public.public_account_launch_audit audit WHERE audit.target_id=item.id
        AND audit.action='deletion_prepared' AND audit.metadata->>'cleanup_job_id'=job.id::text);
    INSERT INTO private.privacy_deletion_daily_totals(day,completed_count)
      VALUES((item.resolved_at AT TIME ZONE 'Asia/Seoul')::date,1)
      ON CONFLICT(day) DO UPDATE SET completed_count=private.privacy_deletion_daily_totals.completed_count+1;
    DELETE FROM public.public_account_launch_audit WHERE target_id=item.id AND action LIKE 'deletion_%';
    DELETE FROM public.account_deletion_requests WHERE id=item.id;
    removed:=removed+1;
  EXCEPTION WHEN no_data_found OR lock_not_available OR deadlock_detected THEN deferred:=deferred+1;
  END; END LOOP;
  DELETE FROM private.privacy_deletion_daily_totals WHERE day<=(at_time AT TIME ZONE 'Asia/Seoul')::date-90;
  RETURN jsonb_build_object('ok',true,'expired_attempts',expired,'completed_deletions',removed,'deferred',deferred);
END $$;

-- Keep the old maintenance entry point from discarding the only identity-cleanup linkage.
CREATE OR REPLACE FUNCTION public.admin_purge_expired_public_account_deletion_audit(admin_actor text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.require_privacy_retention_service();
  IF admin_actor IS NULL OR char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PURGE_ACTOR'; END IF;
  result:=public.run_privacy_retention_cleanup();
  RETURN coalesce((result->>'completed_deletions')::integer,0);
END $$;

REVOKE ALL ON FUNCTION private.require_privacy_retention_service(),private.purge_expired_login_attempt(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.run_privacy_retention_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_privacy_retention_cleanup() TO service_role;
REVOKE ALL ON FUNCTION public.admin_prepare_public_account_deletion(uuid,text,text),public.admin_begin_public_account_auth_deletion(uuid,text),
  public.admin_finalize_public_account_auth_deletion(uuid,text,text),public.admin_purge_expired_public_account_deletion_audit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_public_account_deletion(uuid,text,text),public.admin_begin_public_account_auth_deletion(uuid,text),
  public.admin_finalize_public_account_auth_deletion(uuid,text,text),public.admin_purge_expired_public_account_deletion_audit(text) TO service_role;
COMMIT;
