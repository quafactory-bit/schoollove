\set ON_ERROR_STOP on
-- Run ONLY in the schema-only disposable clone. All rows are synthetic.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claim.sub','e8000000-0000-4000-8000-000000000001',true);
INSERT INTO public.public_account_launch_control
  (control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,last_reason_code,updated_by)
VALUES ('public_account','open',true,true,true,'DISPOSABLE_ONLY','isolated_test');
INSERT INTO auth.users(id) VALUES ('e8000000-0000-4000-8000-000000000001');
INSERT INTO private.private_accounts
  (id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,
   recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,
   recovery_email_encryption_key_version,recovery_email_verified_at,activated_at)
VALUES ('e8000000-0000-4000-8000-000000000002','e8000000-0000-4000-8000-000000000001',
  'active','google','slb:v1:k01:google:'||repeat('A',43),decode(repeat('a1',32),'hex'),1,
  decode(repeat('a2',32),'hex'),decode(repeat('a3',12),'hex'),1,now(),now());
INSERT INTO private.social_identity_registry
  (broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status,activated_at)
VALUES ('slb:v1:k01:google:'||repeat('A',43),'google',decode(repeat('a4',32),'hex'),1,
  'e8000000-0000-4000-8000-000000000002','e8000000-0000-4000-8000-000000000001','active',now());
INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data)
VALUES ('e8000000-0000-4000-8000-000000000003','e8000000-0000-4000-8000-000000000001',
  'slb:v1:k01:google:'||repeat('A',43),'custom:schoollove-google',
  jsonb_build_object('sub','slb:v1:k01:google:'||repeat('A',43)));
SELECT public.admin_complete_own_adult_eligibility('e8000000-0000-4000-8000-000000000001','phase10b-2026-07-28');
SELECT public.record_own_required_consents('phase10b-2026-07-28');
DO $$ BEGIN
  PERFORM public.upsert_own_private_profile('Disposable launch account',NULL,NULL);
END $$;
INSERT INTO public.account_deletion_requests(id,user_id,status)
VALUES ('e8000000-0000-4000-8000-000000000004','e8000000-0000-4000-8000-000000000001','pending');
DO $$
DECLARE job_id uuid;
BEGIN
  PERFORM public.admin_prepare_public_account_deletion('e8000000-0000-4000-8000-000000000004','DISPOSABLE_AUDIT','isolated_test');
  IF NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE status='deletion_pending')
    OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry WHERE status='revoked')
    OR NOT EXISTS(SELECT 1 FROM private.auth_principal_cleanup_jobs WHERE status='queued')
    THEN RAISE EXCEPTION 'SOCIAL_DELETE_PREPARATION_MISSING'; END IF;
  SELECT id INTO job_id FROM private.auth_principal_cleanup_jobs;
  PERFORM public.admin_begin_public_account_auth_deletion('e8000000-0000-4000-8000-000000000004','isolated_test');
  -- Simulate provider failure first: no deletion, no false completion, same job on retry.
  PERFORM public.admin_mark_public_account_auth_deletion_failed('e8000000-0000-4000-8000-000000000004','DISPOSABLE_FAILURE','isolated_test');
  PERFORM public.admin_prepare_public_account_deletion('e8000000-0000-4000-8000-000000000004','DISPOSABLE_RETRY','isolated_test');
  IF (SELECT count(*) FROM private.auth_principal_cleanup_jobs)<>1 THEN RAISE EXCEPTION 'DUPLICATE_CLEANUP_JOB'; END IF;
  PERFORM public.admin_begin_public_account_auth_deletion('e8000000-0000-4000-8000-000000000004','isolated_test');
  DELETE FROM auth.users WHERE id='e8000000-0000-4000-8000-000000000001';
  PERFORM public.admin_finalize_public_account_auth_deletion('e8000000-0000-4000-8000-000000000004','DISPOSABLE_COMPLETE','isolated_test');
  IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM auth.identities)
    OR EXISTS(SELECT 1 FROM public.private_profiles)
    OR NOT EXISTS(SELECT 1 FROM private.auth_principal_cleanup_jobs WHERE id=job_id AND status='completed')
    OR NOT EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE status='done' AND user_id IS NULL)
    OR NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE status='deletion_pending' AND auth_user_id IS NULL)
    OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry WHERE status='revoked' AND auth_user_id IS NULL)
    THEN RAISE EXCEPTION 'SOCIAL_DELETE_FINALIZATION_FAILED'; END IF;
  RAISE NOTICE 'PUBLIC_SOCIAL_DELETION_POSTFLIGHT_PASS failure_retry=pass auth=0/0 cleanup=completed tombstones=preserved';
END $$;
ROLLBACK;
