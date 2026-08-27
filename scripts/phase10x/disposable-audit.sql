\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA phase10x_audit;
CREATE OR REPLACE FUNCTION phase10x_audit.assert(condition boolean,message text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'PHASE10X_ASSERT: %',message; END IF;
END;
$$;

INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,address,school_code,slug) VALUES
  ('50000000-0000-4000-8000-000000000001','TEST People Beta School','high','TEST','TEST','','PHASE10X-1','phase10x-school'),
  ('50000000-0000-4000-8000-000000000002','TEST Outside School','high','TEST','TEST','','PHASE10X-2','phase10x-outside');

INSERT INTO auth.users(id,email,raw_app_meta_data,created_at,updated_at)
SELECT user_id,'phase10x-'||ordinality||'@example.invalid',
  '{"provider":"custom:schoollove-google","providers":["custom:schoollove-google"]}'::jsonb,now(),now()
FROM unnest(ARRAY[
  '51000000-0000-4000-8000-000000000001'::uuid,
  '51000000-0000-4000-8000-000000000002'::uuid,
  '51000000-0000-4000-8000-000000000003'::uuid,
  '51000000-0000-4000-8000-000000000004'::uuid
]) WITH ORDINALITY AS fixture(user_id,ordinality);

INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
SELECT id,true,'self_attestation','phase10b-2026-07-28' FROM auth.users WHERE email LIKE 'phase10x-%@example.invalid';
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT account.id,consent_type,true,'phase10b-2026-07-28'
FROM auth.users account
CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) consent_type
WHERE account.email LIKE 'phase10x-%@example.invalid';

-- Seed pre-existing private account data. This is fixture setup, not a beta product path.
ALTER TABLE public.private_profiles DISABLE TRIGGER USER;
ALTER TABLE public.profile_school_memberships DISABLE TRIGGER USER;
INSERT INTO public.private_profiles(owner_user_id,display_name)
SELECT id,CASE right(id::text,1) WHEN '1' THEN 'PeopleActor' WHEN '2' THEN 'PeopleTarget'
  WHEN '3' THEN 'SuspendedActor' ELSE 'OutsideActor' END
FROM auth.users WHERE email LIKE 'phase10x-%@example.invalid';
INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
SELECT profile.id,profile.owner_user_id,
  CASE WHEN profile.owner_user_id='51000000-0000-4000-8000-000000000004' THEN '50000000-0000-4000-8000-000000000002'::uuid
    ELSE '50000000-0000-4000-8000-000000000001'::uuid END,2005
FROM public.private_profiles profile WHERE profile.owner_user_id::text LIKE '51000000-%';
ALTER TABLE public.private_profiles ENABLE TRIGGER USER;
ALTER TABLE public.profile_school_memberships ENABLE TRIGGER USER;

INSERT INTO public.beta_feature_flags(program_id,user_id,feature_key,enabled,reason_code,updated_by)
SELECT NULL,NULL,feature,true,'PHASE10X_DISPOSABLE_ONLY','phase10x:audit'
FROM unnest(ARRAY['people_search','connection_request']) feature
ON CONFLICT(feature_key) WHERE program_id IS NULL AND user_id IS NULL
DO UPDATE SET enabled=true,reason_code=excluded.reason_code,updated_by=excluded.updated_by,updated_at=now();
SELECT public.admin_set_public_account_launch_state('internal_test','PHASE10X_DISPOSABLE_ONLY','phase10x:audit');

DO $$
DECLARE
  target_school uuid:='50000000-0000-4000-8000-000000000001';
  outside_school uuid:='50000000-0000-4000-8000-000000000002';
  starts timestamptz:=date_trunc('second',now()-interval '1 minute');
  ends timestamptz;
  stops jsonb:='{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb;
  invite_policy jsonb:='{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb;
  features text[];
  draft_id uuid; people_program uuid; member_id uuid; token_index integer;
  before_programs integer; before_members integer; matched record; requested record; responded record;
  negative_program uuid; mismatch_legacy uuid; mismatch_people uuid;
  invalid_school_program uuid; invalid_school_draft uuid; invalid_school_snapshot uuid;
BEGIN
  ends:=starts+interval '14 days';

  FOR features IN
    SELECT ARRAY(SELECT jsonb_array_elements_text(feature_set))
    FROM jsonb_array_elements('[
      ["people_search"], ["connection_request"],
      ["people_search","messaging"], ["people_search","instagram_permission"],
      ["account_registration","people_search"], ["private_profile","connection_request"],
      ["people_search","connection_request","messaging"]
    ]'::jsonb) feature_set
  LOOP
    BEGIN
      PERFORM public.admin_save_beta_setup(NULL,'phase10x_invalid_'||substr(md5(array_to_string(features,',')),1,12),'TEST Invalid',starts,ends,20,'one school',target_school,features,invite_policy,true,stops,'','validated','phase10x:audit');
      RAISE EXCEPTION 'invalid feature set accepted: %',features;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT IN ('INVALID_CONTROLLED_BETA_FEATURE_SET','INVALID_FIRST_BETA_FEATURE_SET') THEN RAISE; END IF;
    END;
  END LOOP;

  mismatch_legacy:=public.admin_activate_beta_setup(public.admin_save_beta_setup(NULL,'phase10x_mismatch_legacy','TEST Legacy Mismatch',starts,ends,20,'one school',target_school,ARRAY['account_registration','private_profile'],invite_policy,true,stops,'','validated','phase10x:audit'),'phase10x:audit');
  BEGIN
    PERFORM public.admin_configure_controlled_beta_features(mismatch_legacy,ARRAY['people_search','connection_request'],'phase10x:audit');
    RAISE EXCEPTION 'legacy snapshot changed to people contract';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_SETUP_CONTRACT_INVALID' THEN RAISE; END IF; END;

  mismatch_people:=public.admin_activate_beta_setup(public.admin_save_beta_setup(NULL,'phase10x_mismatch_people','TEST People Mismatch',starts,ends,20,'one school',target_school,ARRAY['people_search','connection_request'],invite_policy,true,stops,'','validated','phase10x:audit'),'phase10x:audit');
  BEGIN
    PERFORM public.admin_configure_controlled_beta_features(mismatch_people,ARRAY['account_registration','private_profile'],'phase10x:audit');
    RAISE EXCEPTION 'people snapshot changed to legacy contract';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_SETUP_CONTRACT_INVALID' THEN RAISE; END IF; END;

  negative_program:=public.admin_activate_beta_setup(public.admin_save_beta_setup(NULL,'phase10x_start_matrix','TEST Start Matrix',starts,ends,20,'one school',target_school,ARRAY['people_search','connection_request'],invite_policy,true,stops,'','validated','phase10x:audit'),'phase10x:audit');
  PERFORM public.admin_configure_controlled_beta_features(negative_program,ARRAY['people_search','connection_request'],'phase10x:audit');
  BEGIN
    PERFORM public.admin_start_controlled_beta_program(negative_program,'OPERATOR_APPROVED_START','phase10x:audit');
    RAISE EXCEPTION 'program started before readiness';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FRESH_READINESS_REQUIRED' THEN RAISE; END IF; END;
  PERFORM public.admin_record_beta_readiness(negative_program,'limited_beta','{"health":true,"rls":true}'::jsonb,ARRAY[]::text[],true,'phase10x:audit');
  DELETE FROM public.beta_feature_flags flag WHERE flag.program_id=negative_program AND flag.feature_key='promotion_operations';
  BEGIN
    PERFORM public.admin_start_controlled_beta_program(negative_program,'OPERATOR_APPROVED_START','phase10x:audit');
    RAISE EXCEPTION 'program started with incomplete flag inventory';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_FEATURE_SET_INCOMPLETE' THEN RAISE; END IF; END;
  PERFORM public.admin_configure_controlled_beta_features(negative_program,ARRAY['people_search','connection_request'],'phase10x:audit');
  UPDATE public.beta_feature_flags flag SET enabled=true WHERE flag.program_id=negative_program AND flag.feature_key='messaging';
  BEGIN
    PERFORM public.admin_start_controlled_beta_program(negative_program,'OPERATOR_APPROVED_START','phase10x:audit');
    RAISE EXCEPTION 'program started with unexpected enabled feature';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_FEATURE_SET_INCOMPLETE' THEN RAISE; END IF; END;

  invalid_school_draft:=public.admin_save_beta_setup(NULL,'phase10x_invalid_school','TEST Invalid School',starts,ends,20,'one school',target_school,ARRAY['people_search','connection_request'],invite_policy,true,stops,'','validated','phase10x:audit');
  INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at,ends_at)
  VALUES('phase10x_invalid_school','TEST Invalid School','paused',true,starts,ends) RETURNING id INTO invalid_school_program;
  INSERT INTO public.beta_program_setup_snapshots(program_id,source_draft_id,max_users,target_scope,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,created_by)
  VALUES(invalid_school_program,invalid_school_draft,20,'one school',target_school,ARRAY['people_search','connection_request'],invite_policy,true,stops,'phase10x:audit') RETURNING id INTO invalid_school_snapshot;
  INSERT INTO public.beta_program_schools(program_id,school_id,source_snapshot_id,created_by)
  VALUES(invalid_school_program,outside_school,invalid_school_snapshot,'phase10x:audit');
  BEGIN
    PERFORM public.admin_start_controlled_beta_program(invalid_school_program,'OPERATOR_APPROVED_START','phase10x:audit');
    RAISE EXCEPTION 'program started with invalid school contract';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_SCHOOL_CONTRACT_INVALID' THEN RAISE; END IF; END;

  draft_id:=public.admin_save_beta_setup(NULL,'phase10x_people_beta','TEST People Discovery Beta',starts,ends,20,'one school',target_school,ARRAY['connection_request','people_search'],invite_policy,true,stops,'','validated','phase10x:audit');
  people_program:=public.admin_activate_beta_setup(draft_id,'phase10x:audit');
  PERFORM phase10x_audit.assert((SELECT program.status='paused' FROM public.beta_programs program WHERE program.id=people_program),'activation must stay paused');
  PERFORM phase10x_audit.assert((SELECT snapshot.enabled_features @> ARRAY['people_search','connection_request']::text[] AND snapshot.enabled_features <@ ARRAY['people_search','connection_request']::text[] FROM public.beta_program_setup_snapshots snapshot WHERE snapshot.program_id=people_program),'snapshot exact pair');
  PERFORM phase10x_audit.assert((SELECT count(*)=1 AND bool_and(allowed.school_id=target_school) FROM public.beta_program_schools allowed WHERE allowed.program_id=people_program),'one exact school');
  PERFORM public.admin_configure_controlled_beta_features(people_program,ARRAY['people_search','connection_request'],'phase10x:audit');
  PERFORM phase10x_audit.assert((SELECT count(*)=8 AND count(*) FILTER(WHERE flag.enabled)=2 AND bool_and((flag.feature_key=ANY(ARRAY['people_search','connection_request']))=flag.enabled) FROM public.beta_feature_flags flag WHERE flag.program_id=people_program),'full exact feature inventory');
  PERFORM public.admin_record_beta_readiness(people_program,'limited_beta','{"health":true,"rls":true}'::jsonb,ARRAY[]::text[],true,'phase10x:audit');
  PERFORM public.admin_start_controlled_beta_program(people_program,'OPERATOR_APPROVED_START','phase10x:audit');

  FOR token_index IN 1..3 LOOP
    PERFORM public.admin_issue_beta_invite(people_program,repeat(token_index::text,64),NULL,NULL,1,now()+interval '1 day','phase10x:audit');
    PERFORM phase10x_audit.assert(public.redeem_beta_invite(('51000000-0000-4000-8000-'||lpad(token_index::text,12,'0'))::uuid,repeat(token_index::text,64),repeat((token_index+3)::text,64),repeat((token_index+6)::text,64))='PENDING_REVIEW','invite redemption pending');
    SELECT member.id INTO member_id FROM public.beta_members member WHERE member.program_id=people_program AND member.user_id=('51000000-0000-4000-8000-'||lpad(token_index::text,12,'0'))::uuid;
    PERFORM phase10x_audit.assert((SELECT member.status='pending_review' FROM public.beta_members member WHERE member.id=member_id),'member approval required');
    PERFORM public.admin_review_beta_member(member_id,'active','ADMIN_APPROVED','phase10x:audit');
  END LOOP;

  PERFORM phase10x_audit.assert(public.has_beta_feature_access('51000000-0000-4000-8000-000000000001','people_search'),'people search access');
  PERFORM phase10x_audit.assert(public.has_beta_feature_access('51000000-0000-4000-8000-000000000001','connection_request'),'connection request access');
  PERFORM phase10x_audit.assert(NOT public.has_beta_feature_access('51000000-0000-4000-8000-000000000001','messaging'),'messaging closed');
  PERFORM phase10x_audit.assert(NOT public.has_beta_feature_access('51000000-0000-4000-8000-000000000001','instagram_permission'),'instagram closed');
  INSERT INTO public.beta_members(program_id,user_id,status,target_school_id,reviewed_at,reviewed_by,reason_code)
  VALUES(people_program,'51000000-0000-4000-8000-000000000004','active',outside_school,now(),'phase10x:audit','NEGATIVE_FIXTURE');
  PERFORM phase10x_audit.assert(NOT public.has_beta_feature_access('51000000-0000-4000-8000-000000000004','people_search'),'wrong school denied');
  PERFORM phase10x_audit.assert(NOT public.has_beta_feature_access('51999999-0000-4000-8000-000000000099','people_search'),'invalid member denied');
  INSERT INTO public.safety_account_restrictions(user_id,status) VALUES('51000000-0000-4000-8000-000000000003','suspended');
  PERFORM phase10x_audit.assert(NOT public.has_beta_feature_access('51000000-0000-4000-8000-000000000003','people_search'),'suspended member denied');

  SELECT * INTO matched FROM public.find_exact_private_profile_match('51000000-0000-4000-8000-000000000001',target_school,2005,'PeopleTarget');
  PERFORM phase10x_audit.assert(matched.match_state='match_available' AND matched.match_token IS NOT NULL,'10V exact search');
  SELECT * INTO requested FROM public.create_connection_request('51000000-0000-4000-8000-000000000001',matched.match_token,'same_school','오랜만이야.');
  PERFORM phase10x_audit.assert(requested.created AND requested.request_state='pending','10V request');
  SELECT * INTO responded FROM public.respond_connection_request('51000000-0000-4000-8000-000000000002',requested.request_id,'accept',NULL);
  PERFORM phase10x_audit.assert(responded.handled AND responded.request_state='accepted','10V accept');

  PERFORM public.admin_controlled_beta_stop('people_search','PRIVACY_EXPOSURE','phase10x:audit');
  PERFORM phase10x_audit.assert(NOT public.has_beta_feature_access('51000000-0000-4000-8000-000000000001','people_search'),'people stop closes search');
  PERFORM phase10x_audit.assert(NOT public.has_beta_feature_access('51000000-0000-4000-8000-000000000001','connection_request'),'people stop dominates expansion');
  SELECT * INTO matched FROM public.find_exact_private_profile_match('51000000-0000-4000-8000-000000000001',target_school,2005,'PeopleTarget');
  PERFORM phase10x_audit.assert(matched.match_state='unavailable' AND matched.match_token IS NULL,'10V search fail closed after stop');

  PERFORM public.admin_set_beta_feature(NULL,NULL,'people_search',true,'INCIDENT_RESOLVED','phase10x:audit');
  PERFORM public.admin_set_beta_emergency(people_program,true,'PRIVACY_EXPOSURE','phase10x:audit');
  PERFORM phase10x_audit.assert(NOT public.has_beta_feature_access('51000000-0000-4000-8000-000000000001','people_search'),'emergency fail closed');
END $$;

ROLLBACK;
SELECT 'PHASE10X_DISPOSABLE_AUDIT_OK legacy_separate=phase10j people_lifecycle=PASS negative_matrix=PASS phase10v_search_request_accept=PASS stop_emergency=PASS' status;
