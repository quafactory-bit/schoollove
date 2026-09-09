\set ON_ERROR_STOP on
-- Disposable clone only. Destroy the owning container after this committed fixture.
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO public.public_account_launch_control(control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,last_reason_code,updated_by)
VALUES('public_account','open',true,true,true,'DISPOSABLE','local');
INSERT INTO auth.users(id) VALUES('ed100001-0000-4000-8000-000000000001');
INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
VALUES('ed000001-0000-4000-8000-000000000001','Concurrent Fixture','high','Fixture','Fixture','CONCURRENT-GROWTH','concurrent-growth');
INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
VALUES('ed100001-0000-4000-8000-000000000001',true,'self_attestation','phase10b-2026-07-28');
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT 'ed100001-0000-4000-8000-000000000001',t,true,'phase10b-2026-07-28' FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default'])t;
INSERT INTO public.private_profiles(id,owner_user_id,display_name)
VALUES('ed100001-0000-4000-8000-000000000001','ed100001-0000-4000-8000-000000000001','Concurrent Fixture');
COMMIT;
