\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.public_account_launch_control WHERE control_key='public_account' AND state='closed'
    AND NOT account_registration_enabled AND NOT private_profile_enabled AND NOT school_membership_enabled)
  THEN RAISE EXCEPTION 'migration did not default closed'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='public' AND relation.relkind='r')<>71
  THEN RAISE EXCEPTION 'post-launch public table contract drifted'; END IF;
END $$;

INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
('61000000-0000-4000-8000-000000000001','phase10n-a@example.invalid',now(),now()),
('61000000-0000-4000-8000-000000000002','phase10n-b@example.invalid',now(),now()),
('61000000-0000-4000-8000-000000000003','phase10n-c@example.invalid',now(),now());

INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version) VALUES
('61000000-0000-4000-8000-000000000001',true,'self_attestation','phase10b-2026-07-28'),
('61000000-0000-4000-8000-000000000003',true,'self_attestation','phase10b-2026-07-28');
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT user_id,consent_type,true,'phase10b-2026-07-28'
FROM unnest(ARRAY['61000000-0000-4000-8000-000000000001'::uuid,'61000000-0000-4000-8000-000000000003'::uuid]) user_id
CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) consent_type;

SELECT set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.private_profiles(id,owner_user_id,display_name)
    VALUES('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','TEST CLOSED');
    RAISE EXCEPTION 'closed profile write accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'BETA_ACCESS_REQUIRED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;

SELECT public.admin_set_public_account_launch_state('internal_test','LOCAL_AUTH_TEST','test:admin');
SET LOCAL ROLE authenticated;
INSERT INTO public.private_profiles(id,owner_user_id,display_name,profile_visibility,status)
VALUES('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','ＴＥＳＴ A','private','active');
INSERT INTO public.profile_school_memberships(id,profile_id,owner_user_id,school_id,graduation_year) VALUES
('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
 '61000000-0000-4000-8000-000000000001',md5('phase10l-school-1')::uuid,2020),
('63000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001',
 '61000000-0000-4000-8000-000000000001',md5('phase10l-school-2')::uuid,2019),
('63000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000001',
 '61000000-0000-4000-8000-000000000001',md5('phase10l-school-3')::uuid,2018);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
    VALUES('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',md5('phase10l-school-4')::uuid,2017);
    RAISE EXCEPTION 'fourth public school accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'PUBLIC_ACCOUNT_SCHOOL_LIMIT_REACHED' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
    VALUES('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',md5('phase10l-school-1')::uuid,2020);
    RAISE EXCEPTION 'duplicate school history accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'PUBLIC_ACCOUNT_SCHOOL_DUPLICATE' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
    VALUES('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',md5('phase10l-school-4')::uuid,2200);
    RAISE EXCEPTION 'future graduation year accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'FUTURE_GRADUATION_YEAR_NOT_ALLOWED' THEN RAISE; END IF;
  END;
END $$;
SELECT public.request_own_account_deletion(NULL);
DO $$ DECLARE affected integer; BEGIN
  UPDATE public.private_profiles SET display_name='TEST BLOCKED'
  WHERE owner_user_id='61000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'write after deletion request accepted'; END IF;
END $$;
RESET ROLE;

CREATE FUNCTION public.phase10n_force_delete_failure() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'TEST_FORCED_DELETE_FAILURE'; END$$;
CREATE TRIGGER phase10n_force_delete_failure BEFORE DELETE ON public.private_profiles
FOR EACH STATEMENT EXECUTE FUNCTION public.phase10n_force_delete_failure();
DO $$ DECLARE request_id uuid; BEGIN
  SELECT id INTO request_id FROM public.account_deletion_requests
  WHERE user_id='61000000-0000-4000-8000-000000000001' AND status='pending';
  BEGIN
    PERFORM public.admin_complete_public_account_deletion(request_id,'USER_REQUEST_VERIFIED','test:admin');
    RAISE EXCEPTION 'forced deletion failure accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'TEST_FORCED_DELETE_FAILURE' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.private_profiles WHERE owner_user_id='61000000-0000-4000-8000-000000000001')
    OR NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE id=request_id AND status='pending')
    OR EXISTS(SELECT 1 FROM public.public_account_launch_audit WHERE target_id=request_id AND action='deletion_completed')
  THEN RAISE EXCEPTION 'deletion partial failure did not roll back'; END IF;
END $$;
DROP TRIGGER phase10n_force_delete_failure ON public.private_profiles;
DROP FUNCTION public.phase10n_force_delete_failure();

DO $$ DECLARE request_id uuid; BEGIN
  SELECT id INTO request_id FROM public.account_deletion_requests
  WHERE user_id='61000000-0000-4000-8000-000000000001' AND status='pending';
  PERFORM public.admin_complete_public_account_deletion(request_id,'USER_REQUEST_VERIFIED','test:admin');
  PERFORM public.admin_complete_public_account_deletion(request_id,'USER_REQUEST_VERIFIED','test:admin');
  IF EXISTS(SELECT 1 FROM public.private_profiles WHERE owner_user_id='61000000-0000-4000-8000-000000000001')
    OR EXISTS(SELECT 1 FROM public.profile_school_memberships WHERE owner_user_id='61000000-0000-4000-8000-000000000001')
    OR NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE id=request_id AND status='done')
    OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id='61000000-0000-4000-8000-000000000001' AND banned_until='9999-12-31 23:59:59+00'::timestamptz)
  THEN RAISE EXCEPTION 'deletion completion contract failed'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.public_account_access_active('61000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'completed deletion account retained app access';
  END IF;
END $$;
RESET ROLE;

SELECT public.admin_set_public_account_launch_state('emergency_stopped','PRIVACY_SAFETY_STOP','test:admin');
DO $$ BEGIN
  BEGIN
    PERFORM public.admin_set_public_account_launch_state('internal_test','GENERIC_RESTORE','test:admin');
    RAISE EXCEPTION 'generic emergency restore accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'POST_EMERGENCY_READINESS_REQUIRED' THEN RAISE; END IF; END;
END $$;
SELECT public.admin_set_public_account_launch_state('closed','POST_EMERGENCY_READINESS_REVIEWED','test:admin');
DO $$ BEGIN
  BEGIN
    PERFORM public.admin_set_public_account_launch_state('open','UNREVIEWED_OPEN','test:admin');
    RAISE EXCEPTION 'open without ready accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OPEN_REQUIRES_READY_STATE' THEN RAISE; END IF; END;
END $$;
SELECT public.admin_set_public_account_launch_state('ready','PREVIEW_READINESS_VERIFIED','test:admin');
SELECT public.admin_set_public_account_launch_state('open','SEPARATE_OPEN_APPROVAL','test:admin');

SELECT public.record_public_account_event('public_home_view','direct');
SELECT public.record_public_account_event('public_home_view','direct');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.public_account_daily_funnel WHERE event_key='public_home_view' AND source_channel='direct' AND event_count=2)
    OR NOT EXISTS(SELECT 1 FROM public.get_public_account_funnel() WHERE event_key='public_home_view' AND masked AND event_count IS NULL)
  THEN RAISE EXCEPTION 'privacy-safe funnel failed'; END IF;
  IF (SELECT count(*) FROM public.profiles)<>0 OR (SELECT count(*) FROM public.reports)<>0
    OR (SELECT count(*) FROM public.traces)<>0 OR (SELECT count(*) FROM public.search_logs)<>0
    OR (SELECT count(*) FROM public.schools)<>10006
  THEN RAISE EXCEPTION 'post-reset baseline drifted'; END IF;
END $$;

ROLLBACK;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.public_account_launch_control WHERE state='closed')
    OR EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'phase10n-%@example.invalid')
  THEN RAISE EXCEPTION 'lifecycle rollback failed'; END IF;
END $$;
SELECT 'PHASE10N_LIFECYCLE_OK' status;
