\set ON_ERROR_STOP on
-- Run only against the schema-only disposable clone, never a linked database.

SET session_replication_role = replica;
INSERT INTO public.public_account_launch_control(control_key,state,private_profile_enabled,school_membership_enabled,last_reason_code,updated_by)
VALUES ('public_account','internal_test',true,true,'DISPOSABLE_TEST','local-test');
INSERT INTO auth.users(id) SELECT ('aa100001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,4) n;
INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
SELECT ('aa000001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic School '||n,t,'Test','Test','CH-'||n,'class-history-fixture-'||n
FROM (VALUES(1,'high'),(2,'middle'),(3,'elementary'),(4,'university')) v(n,t);
INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
SELECT id,true,'self_attestation','phase10b-2026-07-28' FROM auth.users;
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT id,t,true,'phase10b-2026-07-28' FROM auth.users CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) t;
INSERT INTO public.private_profiles(id,owner_user_id,display_name)
SELECT id,id,'Synthetic '||right(id::text,1) FROM auth.users;
INSERT INTO public.profile_school_memberships(id,profile_id,owner_user_id,school_id,graduation_year)
SELECT id,id,id,'aa000001-0000-4000-8000-000000000001',2010 FROM auth.users;
INSERT INTO public.connection_requests(id,sender_user_id,receiver_user_id,target_school_membership_id,relationship_type,message,status)
VALUES('bb000001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000002','aa100001-0000-4000-8000-000000000002','same_school','Hello','accepted');
INSERT INTO public.connections(request_id,user_low_id,user_high_id)
VALUES('bb000001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000002');
SET session_replication_role = origin;

-- Included inside disposable-matrix's rollback transaction, after base fixtures.
SET session_replication_role=replica;
INSERT INTO public.beta_programs(id,program_key,name,status,starts_at,ends_at)
VALUES('cc000001-0000-4000-8000-000000000001','class_history_disposable','Local People Discovery','active',now()-interval '1 day',now()+interval '13 days');
INSERT INTO public.beta_setup_drafts(id,draft_key,name,starts_at,ends_at,max_users,target_scope,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,status,created_by)
VALUES('cc000002-0000-4000-8000-000000000001','class_history_disposable','Local People Discovery',now()-interval '1 day',now()+interval '13 days',20,'one_school','aa000001-0000-4000-8000-000000000001',ARRAY['people_search','connection_request'],'{"maxUsesPerInvite":1,"expiresInDays":7}',true,'{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}','activated','local-test');
INSERT INTO public.beta_program_setup_snapshots(id,program_id,source_draft_id,max_users,target_scope,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,created_by)
VALUES('cc000003-0000-4000-8000-000000000001','cc000001-0000-4000-8000-000000000001','cc000002-0000-4000-8000-000000000001',20,'one_school','aa000001-0000-4000-8000-000000000001',ARRAY['people_search','connection_request'],'{"maxUsesPerInvite":1,"expiresInDays":7}',true,'{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}','local-test');
INSERT INTO public.beta_program_schools(program_id,school_id,source_snapshot_id,created_by)
VALUES('cc000001-0000-4000-8000-000000000001','aa000001-0000-4000-8000-000000000001','cc000003-0000-4000-8000-000000000001','local-test');
INSERT INTO public.beta_feature_flags(program_id,feature_key,enabled,reason_code,updated_by)
SELECT 'cc000001-0000-4000-8000-000000000001',f,f IN ('people_search','connection_request'),'LOCAL_TEST','local-test'
FROM unnest(ARRAY['account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations']) f;
INSERT INTO public.beta_members(program_id,user_id,target_school_id,status)
SELECT 'cc000001-0000-4000-8000-000000000001',id,'aa000001-0000-4000-8000-000000000001','active' FROM auth.users WHERE right(id::text,1) IN ('3','4');
SET session_replication_role=origin;

SET session_replication_role=replica;
UPDATE public.public_account_launch_control SET state='closed',account_registration_enabled=false,private_profile_enabled=false,school_membership_enabled=false;
INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject)
SELECT id,id,'provisional','google','slb:v1:k01:google:'||repeat(right(id::text,1),43) FROM auth.users;
INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status)
SELECT primary_broker_subject,'google',decode(repeat(right(id::text,1),64),'hex'),1,id,auth_user_id,'provisional' FROM private.private_accounts;
INSERT INTO auth.identities(id,user_id,provider,provider_id,identity_data)
SELECT id,id,'custom:schoollove-google',primary_broker_subject,jsonb_build_object('sub',primary_broker_subject) FROM private.private_accounts;
SET session_replication_role=origin;
SET request.jwt.claim.role='service_role';
SET request.jwt.claim.sub='aa100001-0000-4000-8000-000000000003';
SELECT public.replace_own_school_class_history('aa100001-0000-4000-8000-000000000003','[{"grade_number":2,"class_number":3}]') IS NOT NULL AS actor_ready;
SET request.jwt.claim.sub='aa100001-0000-4000-8000-000000000004';
SELECT public.replace_own_school_class_history('aa100001-0000-4000-8000-000000000004','[{"grade_number":2,"class_number":3}]') IS NOT NULL AS receiver_ready;
