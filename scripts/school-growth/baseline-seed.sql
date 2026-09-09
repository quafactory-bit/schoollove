\set ON_ERROR_STOP on
-- Disposable schema45 only, BEFORE applying migration46.
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO public.public_account_launch_control(control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,last_reason_code,updated_by)
VALUES('public_account','open',true,true,true,'DISPOSABLE','local');
INSERT INTO auth.users(id) VALUES('ef100001-0000-4000-8000-000000000001');
INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
VALUES('ef000001-0000-4000-8000-000000000001','Existing Fixture','high','Fixture','Fixture','BASELINE-GROWTH','baseline-growth');
INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
SELECT id,true,'self_attestation','phase10b-2026-07-28' FROM auth.users;
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT id,t,true,'phase10b-2026-07-28' FROM auth.users CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default'])t;
INSERT INTO public.private_profiles(id,owner_user_id,display_name) SELECT id,id,'Existing Fixture' FROM auth.users;
INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
SELECT id,id,'ef000001-0000-4000-8000-000000000001',2010 FROM auth.users;
COMMIT;
