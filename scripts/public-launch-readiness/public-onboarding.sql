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
INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
VALUES('e8000000-0000-4000-8000-000000000004','Synthetic Public School','high','Test','Test','PUBLIC-LAUNCH','public-launch-audit');
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT public.upsert_own_private_profile('Synthetic Owner',NULL,NULL);
SELECT public.add_own_school_membership_with_class_history('e8000000-0000-4000-8000-000000000004',2018,'[]'::jsonb);
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.private_profiles)<>1
    OR (SELECT count(*) FROM public.profile_school_memberships)<>1
    OR (SELECT count(*) FROM public.profile_school_class_histories)<>0
    OR (SELECT count(*) FROM public.beta_members)<>0
    OR (SELECT count(*) FROM public.beta_invites)<>0
  THEN RAISE EXCEPTION 'PUBLIC_ONBOARDING_DEPENDENCY_FAILED'; END IF;
  IF public.has_beta_feature_access('e8000000-0000-4000-8000-000000000001','people_search')
    OR public.has_beta_feature_access('e8000000-0000-4000-8000-000000000001','connection_request')
    OR public.has_beta_feature_access('e8000000-0000-4000-8000-000000000001','messaging')
    OR public.has_beta_feature_access('e8000000-0000-4000-8000-000000000001','instagram_permission')
  THEN RAISE EXCEPTION 'PUBLIC_REGISTRATION_GRANTED_BETA_FEATURE'; END IF;
  RAISE NOTICE 'PASS: public onboarding without invite or class history; no discovery/messaging/Instagram access';
END $test$;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT public.admin_set_public_account_launch_state('emergency_stopped','DISPOSABLE_STOP','isolated_test');
DO $test$
DECLARE denied boolean:=false;
BEGIN
  IF public.public_account_access_active('e8000000-0000-4000-8000-000000000001')
    OR public.public_account_feature_enabled('private_profile')
    OR public.public_account_feature_enabled('school_membership')
  THEN RAISE EXCEPTION 'EMERGENCY_ACCESS_NOT_STOPPED'; END IF;
  BEGIN
    PERFORM public.upsert_own_private_profile('Should not save',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'EMERGENCY_WRITE_NOT_STOPPED'; END IF;
  IF (SELECT display_name FROM public.private_profiles)<>'Synthetic Owner'
    OR (SELECT count(*) FROM public.profile_school_memberships)<>1
  THEN RAISE EXCEPTION 'EMERGENCY_DESTROYED_OWNER_DATA'; END IF;
  RAISE NOTICE 'PASS: official emergency stop closes writes and preserves existing owner data';
END $test$;
ROLLBACK;
