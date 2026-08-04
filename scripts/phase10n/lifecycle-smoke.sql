\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.public_account_launch_control WHERE control_key='public_account' AND state='closed'
    AND NOT account_registration_enabled AND NOT private_profile_enabled AND NOT school_membership_enabled)
    OR (SELECT count(*) FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid=relation.relnamespace WHERE namespace.nspname='public' AND relation.relkind='r')<>71
  THEN RAISE EXCEPTION 'migration default or table contract failed'; END IF;
END $$;

INSERT INTO auth.users(id,email,raw_app_meta_data,created_at,updated_at) VALUES
('61000000-0000-4000-8000-000000000001','phase10n-a@example.invalid','{}',now(),now()),
('61000000-0000-4000-8000-000000000002','phase10n-b@example.invalid','{}',now(),now());

SELECT set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.private_profiles(owner_user_id,display_name)
    VALUES('61000000-0000-4000-8000-000000000001','DIRECT WRITE');
    RAISE EXCEPTION 'direct private-profile insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
    VALUES('61000000-0000-4000-8000-000000000001','terms',true,'phase10b-2026-07-28');
    RAISE EXCEPTION 'direct consent insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.account_deletion_requests(user_id,reason,status)
    VALUES('61000000-0000-4000-8000-000000000001','attacker text','pending');
    RAISE EXCEPTION 'direct deletion insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT public.admin_set_public_account_launch_state('internal_test','LOCAL_AUTH_TEST','test:admin');
SELECT public.admin_complete_own_adult_eligibility('61000000-0000-4000-8000-000000000001','phase10b-2026-07-28');

SET LOCAL ROLE authenticated;
SELECT public.record_own_required_consents('phase10b-2026-07-28');
SELECT public.record_own_required_consents('phase10b-2026-07-28');
SELECT public.upsert_own_private_profile('Ａlice','Alice.Handle','hello');
SELECT public.upsert_own_private_profile('Alice','alice.handle','edited');
SELECT public.add_own_school_membership(md5('phase10l-school-1')::uuid,2020,NULL);
SELECT public.add_own_school_membership(md5('phase10l-school-2')::uuid,2019,2);
SELECT public.add_own_school_membership(md5('phase10l-school-3')::uuid,2018,NULL);
DO $$ BEGIN
  BEGIN
    PERFORM public.add_own_school_membership(md5('phase10l-school-4')::uuid,2017,NULL);
    RAISE EXCEPTION 'fourth public school accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PUBLIC_ACCOUNT_SCHOOL_LIMIT_REACHED' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.add_own_school_membership(md5('phase10l-school-1')::uuid,2020,NULL);
    RAISE EXCEPTION 'duplicate school accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PUBLIC_ACCOUNT_SCHOOL_DUPLICATE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.add_own_school_membership(md5('phase10l-school-4')::uuid,2200,NULL);
    RAISE EXCEPTION 'future school year accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_SCHOOL_MEMBERSHIP' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.consent_records WHERE user_id='61000000-0000-4000-8000-000000000001')<>4
    OR (SELECT count(*) FROM public.private_profiles WHERE owner_user_id='61000000-0000-4000-8000-000000000001')<>1
    OR (SELECT display_name FROM public.private_profiles WHERE owner_user_id='61000000-0000-4000-8000-000000000001')<>'Alice'
    OR (SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id='61000000-0000-4000-8000-000000000001')<>3
    OR (SELECT event_count FROM public.public_account_daily_funnel WHERE event_key='required_consents_completed')<>1
    OR (SELECT event_count FROM public.public_account_daily_funnel WHERE event_key='private_profile_created')<>1
    OR (SELECT event_count FROM public.public_account_daily_funnel WHERE event_key='first_school_membership_created')<>1
    OR (SELECT event_count FROM public.public_account_daily_funnel WHERE event_key='onboarding_completed')<>1
  THEN RAISE EXCEPTION 'owner RPC or milestone idempotency failed'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT public.request_own_account_deletion();
SELECT public.request_own_account_deletion();
RESET ROLE;

CREATE FUNCTION public.phase10n_force_delete_failure() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'TEST_FORCED_DELETE_FAILURE'; END$$;
CREATE TRIGGER phase10n_force_delete_failure BEFORE DELETE ON public.private_profiles
FOR EACH STATEMENT EXECUTE FUNCTION public.phase10n_force_delete_failure();
DO $$ DECLARE request_id uuid; BEGIN
  SELECT id INTO request_id FROM public.account_deletion_requests
    WHERE user_id='61000000-0000-4000-8000-000000000001' AND status='pending';
  BEGIN
    PERFORM public.admin_prepare_public_account_deletion(request_id,'USER_REQUEST_VERIFIED','test:admin');
    RAISE EXCEPTION 'forced deletion failure accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TEST_FORCED_DELETE_FAILURE' THEN RAISE; END IF; END;
  IF NOT EXISTS(SELECT 1 FROM public.private_profiles WHERE owner_user_id='61000000-0000-4000-8000-000000000001')
    OR NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE id=request_id AND status='pending')
    OR EXISTS(SELECT 1 FROM public.public_account_launch_audit WHERE target_id=request_id AND action='deletion_prepared')
  THEN RAISE EXCEPTION 'deletion preparation rollback failed'; END IF;
END $$;
DROP TRIGGER phase10n_force_delete_failure ON public.private_profiles;
DROP FUNCTION public.phase10n_force_delete_failure();

DO $$ DECLARE request_id uuid; prepared jsonb; auth_pending jsonb; BEGIN
  SELECT id INTO request_id FROM public.account_deletion_requests
    WHERE user_id='61000000-0000-4000-8000-000000000001' AND status='pending';
  prepared:=public.admin_prepare_public_account_deletion(request_id,'USER_REQUEST_VERIFIED','test:admin');
  IF prepared->>'public_data_deleted'<>'true'
    OR EXISTS(SELECT 1 FROM public.private_profiles WHERE owner_user_id='61000000-0000-4000-8000-000000000001')
    OR EXISTS(SELECT 1 FROM public.adult_eligibility_records WHERE user_id='61000000-0000-4000-8000-000000000001')
    OR NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE id=request_id AND status='public_data_deleted')
  THEN RAISE EXCEPTION 'deletion preparation failed'; END IF;
  auth_pending:=public.admin_begin_public_account_auth_deletion(request_id,'test:admin');
  IF auth_pending->>'user_id'<>'61000000-0000-4000-8000-000000000001'
    OR NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE id=request_id AND status='auth_deletion_pending')
  THEN RAISE EXCEPTION 'Auth deletion handoff failed'; END IF;
  DELETE FROM auth.users WHERE id='61000000-0000-4000-8000-000000000001';
  PERFORM public.admin_finalize_public_account_auth_deletion(request_id,'USER_REQUEST_VERIFIED','test:admin');
  IF NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE id=request_id AND status='done'
      AND user_id IS NULL AND purge_after IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM public.public_account_launch_audit WHERE target_id=request_id AND action='deletion_completed')
  THEN RAISE EXCEPTION 'actual Auth deletion finalization failed'; END IF;
END $$;

SELECT public.admin_set_public_account_launch_state('emergency_stopped','PRIVACY_SAFETY_STOP','test:admin');
DO $$ BEGIN
  BEGIN
    PERFORM public.admin_set_public_account_launch_state('internal_test','GENERIC_RESTORE','test:admin');
    RAISE EXCEPTION 'emergency restore bypass accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'EMERGENCY_STOP_REQUIRES_CLOSED' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_set_public_account_launch_state('open','GENERIC_OPEN','test:admin');
    RAISE EXCEPTION 'generic open accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_LAUNCH_CHANGE' THEN RAISE; END IF; END;
END $$;
SELECT public.admin_set_public_account_launch_state('closed','POST_EMERGENCY_CLOSED','test:admin');
DO $$ DECLARE stale_id uuid; BEGIN
  BEGIN
    PERFORM public.admin_record_public_account_readiness('INCOMPLETE_READINESS','test:admin',repeat('a',40),repeat('B',64),0,'{"preview":true}'::jsonb);
    RAISE EXCEPTION 'incomplete readiness accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_READINESS_EVIDENCE' THEN RAISE; END IF; END;
  INSERT INTO public.public_account_launch_audit(action,from_state,to_state,reason_code,actor_reference,metadata,created_at)
  VALUES('readiness_recorded','closed','ready','STALE_READINESS','test:admin',
    jsonb_build_object('commit_sha',repeat('a',40),'migration_sha256',repeat('B',64),'blocker_count',0),
    clock_timestamp()-interval '2 days') RETURNING id INTO stale_id;
  UPDATE public.public_account_launch_control SET state='ready',account_registration_enabled=false,
    private_profile_enabled=false,school_membership_enabled=false WHERE control_key='public_account';
  BEGIN
    PERFORM public.admin_open_public_account_launch(stale_id,'STALE_OPEN_ATTEMPT','test:admin',repeat('a',40),repeat('B',64));
    RAISE EXCEPTION 'stale readiness opened launch';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FRESH_AFFIRMATIVE_READINESS_REQUIRED' THEN RAISE; END IF; END;
  UPDATE public.public_account_launch_control SET state='closed' WHERE control_key='public_account';
  DELETE FROM public.public_account_launch_audit WHERE id=stale_id;
END $$;
DO $$ DECLARE readiness_id uuid; BEGIN
  readiness_id:=public.admin_record_public_account_readiness('PREVIEW_READINESS_VERIFIED','test:admin',
    repeat('a',40),repeat('B',64),0,'{"migration_version":"20260803120000","operator_decision":"affirmative","blocker_codes":[],"preview":true,"health":true,"rls_grants":true,"auth_smtp":true,"deletion_operator":true,"runtime_logs":true,"isolated_db":true,"permissions":true}'::jsonb);
  PERFORM public.admin_open_public_account_launch(readiness_id,'SEPARATE_OPEN_APPROVAL','test:admin',repeat('a',40),repeat('B',64));
END $$;

SELECT public.record_public_account_activity('public_home_view','direct');
SELECT public.record_public_account_activity('public_home_view','direct');
SELECT set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
SELECT public.record_own_otp_verified_milestone();
SELECT public.record_own_otp_verified_milestone();
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.public_account_daily_funnel WHERE event_key='public_home_view'
      AND event_kind='activity' AND event_count=2)
    OR NOT EXISTS(SELECT 1 FROM public.public_account_daily_funnel WHERE event_key='otp_verify_succeeded'
      AND event_kind='milestone' AND event_count=1)
    OR NOT EXISTS(SELECT 1 FROM public.get_public_account_funnel() WHERE event_key='public_home_view'
      AND event_kind='activity' AND masked AND event_count IS NULL)
  THEN RAISE EXCEPTION 'activity/milestone funnel contract failed'; END IF;
END $$;

ROLLBACK;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.public_account_launch_control WHERE state='closed')
    OR EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'phase10n-%@example.invalid')
  THEN RAISE EXCEPTION 'lifecycle rollback failed'; END IF;
END $$;
SELECT 'PHASE10N_LIFECYCLE_OK' status;
