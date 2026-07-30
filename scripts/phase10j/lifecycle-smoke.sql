\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,address,school_code,slug)
VALUES
('40000000-0000-4000-8000-000000000001','TEST First Beta School','high','TEST','TEST','','TEST-1','test-first-beta-school'),
('40000000-0000-4000-8000-000000000002','TEST Other School','high','TEST','TEST','','TEST-2','test-other-school');

INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
('41000000-0000-4000-8000-000000000001','phase10j-a@example.invalid',now(),now()),
('41000000-0000-4000-8000-000000000002','phase10j-b@example.invalid',now(),now());

INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
VALUES
('41000000-0000-4000-8000-000000000001',true,'self_attestation','phase10b-2026-07-28'),
('41000000-0000-4000-8000-000000000002',true,'self_attestation','phase10b-2026-07-28');

INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT user_id,consent_type,true,'phase10b-2026-07-28'
FROM unnest(ARRAY['41000000-0000-4000-8000-000000000001'::uuid,'41000000-0000-4000-8000-000000000002'::uuid]) user_id
CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) consent_type;

DO $$
DECLARE
  target_school uuid:='40000000-0000-4000-8000-000000000001'; other_school uuid:='40000000-0000-4000-8000-000000000002';
  draft_id uuid; controlled_program uuid; retried_program uuid; invite_id uuid; member_id uuid; second_member_id uuid; profile_id uuid;
  no_snapshot_program uuid; missing_school_program uuid; missing_school_draft uuid; missing_school_snapshot uuid;
  start_at timestamptz:=date_trunc('second',now()-interval '1 minute'); end_at timestamptz;
  required_stops jsonb:='{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb;
  invite_policy jsonb:='{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb;
  audit_before integer; audit_after integer; invite_number integer;
BEGIN
  end_at:=start_at+interval '14 days';
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'phase10j_missing_school','TEST Missing School',start_at,end_at,20,'adult graduates',NULL,ARRAY['account_registration','private_profile'],invite_policy,true,required_stops,'','validated','test:admin');
    RAISE EXCEPTION 'validated draft without school accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TARGET_SCHOOL_REQUIRED' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.beta_setup_drafts WHERE draft_key='phase10j_missing_school') THEN RAISE EXCEPTION 'failed draft partially persisted'; END IF;
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'phase10j_unknown_school','TEST Unknown School',start_at,end_at,20,'adult graduates','49999999-0000-4000-8000-000000000099',ARRAY['account_registration','private_profile'],invite_policy,true,required_stops,'','validated','test:admin');
    RAISE EXCEPTION 'unknown school accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TARGET_SCHOOL_NOT_FOUND' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'phase10j_wrong_capacity','TEST Wrong Capacity',start_at,end_at,19,'adult graduates',target_school,ARRAY['account_registration','private_profile'],invite_policy,true,required_stops,'','validated','test:admin');
    RAISE EXCEPTION 'wrong capacity accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_FIRST_BETA_CONTRACT' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'phase10j_wrong_window','TEST Wrong Window',start_at,start_at+interval '13 days',20,'adult graduates',target_school,ARRAY['account_registration','private_profile'],invite_policy,true,required_stops,'','validated','test:admin');
    RAISE EXCEPTION 'wrong time window accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_FIRST_BETA_CONTRACT' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'phase10j_wrong_stops','TEST Wrong Stops',start_at,end_at,20,'adult graduates',target_school,ARRAY['account_registration','private_profile'],invite_policy,true,'{"PRIVACY_EXPOSURE":true}'::jsonb,'','validated','test:admin');
    RAISE EXCEPTION 'missing mandatory stops accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REQUIRED_STOP_CONDITION_MISSING' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'phase10j_wrong_features','TEST Wrong Features',start_at,end_at,20,'adult graduates',target_school,ARRAY['account_registration','private_profile','people_search'],invite_policy,true,required_stops,'','validated','test:admin');
    RAISE EXCEPTION 'overbroad setup features accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_FIRST_BETA_FEATURE_SET' THEN RAISE; END IF; END;

  INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at,ends_at)
  VALUES('phase10j_no_snapshot','TEST No Snapshot','paused',true,start_at,end_at) RETURNING id INTO no_snapshot_program;
  BEGIN
    PERFORM public.admin_start_controlled_beta_program(no_snapshot_program,'OPERATOR_APPROVED_START','test:admin');
    RAISE EXCEPTION 'snapshotless program started';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_SETUP_SNAPSHOT_REQUIRED' THEN RAISE; END IF; END;

  missing_school_draft:=public.admin_save_beta_setup(NULL,'phase10j_missing_allowlist','TEST Missing Allowlist',start_at,end_at,20,'adult graduates',target_school,ARRAY['account_registration','private_profile'],invite_policy,true,required_stops,'','validated','test:admin');
  INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at,ends_at)
  VALUES('phase10j_missing_allowlist','TEST Missing Allowlist','paused',true,start_at,end_at) RETURNING id INTO missing_school_program;
  INSERT INTO public.beta_program_setup_snapshots(program_id,source_draft_id,max_users,target_scope,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,created_by)
  VALUES(missing_school_program,missing_school_draft,20,'adult graduates',target_school,ARRAY['account_registration','private_profile'],invite_policy,true,required_stops,'test:admin')
  RETURNING id INTO missing_school_snapshot;
  BEGIN
    PERFORM public.admin_start_controlled_beta_program(missing_school_program,'OPERATOR_APPROVED_START','test:admin');
    RAISE EXCEPTION 'program without school allowlist started';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_SCHOOL_CONTRACT_INVALID' THEN RAISE; END IF; END;

  draft_id:=public.admin_save_beta_setup(NULL,'phase10j_first_beta','TEST First Controlled Beta',start_at,end_at,20,'verified adult graduates',target_school,ARRAY['account_registration','private_profile'],invite_policy,true,required_stops,'','validated','test:admin');
  controlled_program:=public.admin_activate_beta_setup(draft_id,'test:admin');
  retried_program:=public.admin_activate_beta_setup(draft_id,'test:admin');
  IF retried_program<>controlled_program THEN RAISE EXCEPTION 'setup activation retry was not idempotent'; END IF;
  IF (SELECT status FROM public.beta_programs WHERE id=controlled_program)<>'paused' THEN RAISE EXCEPTION 'program did not start paused'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.beta_program_setup_snapshots snapshot WHERE snapshot.program_id=controlled_program AND snapshot.target_school_id=target_school) THEN RAISE EXCEPTION 'selected school not copied to snapshot'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.beta_program_schools allowed WHERE allowed.program_id=controlled_program AND allowed.school_id=target_school) THEN RAISE EXCEPTION 'one-school allowlist not created'; END IF;
  BEGIN
    INSERT INTO public.beta_program_schools(program_id,school_id,source_snapshot_id,created_by)
    SELECT controlled_program,other_school,snapshot.id,'test:admin' FROM public.beta_program_setup_snapshots snapshot WHERE snapshot.program_id=controlled_program;
    RAISE EXCEPTION 'second school allowlist row accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE public.beta_program_schools SET school_id=other_school WHERE program_id=controlled_program;
    RAISE EXCEPTION 'immutable allowlist update accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_SCHOOL_IMMUTABLE' THEN RAISE; END IF; END;

  PERFORM public.admin_record_beta_readiness(controlled_program,'limited_beta','{"health":true,"rls":true}'::jsonb,ARRAY[]::text[],true,'test:admin');
  BEGIN
    PERFORM public.admin_start_controlled_beta_program(controlled_program,'OPERATOR_APPROVED_START','test:admin');
    RAISE EXCEPTION 'start accepted incomplete flags';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_FEATURE_SET_INCOMPLETE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_configure_controlled_beta_features(controlled_program,ARRAY['account_registration','people_search'],'test:admin');
    RAISE EXCEPTION 'overbroad feature set accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_FIRST_BETA_FEATURE_SET' THEN RAISE; END IF; END;
  PERFORM public.admin_configure_controlled_beta_features(controlled_program,ARRAY['account_registration','private_profile'],'test:admin');
  SELECT count(*) INTO audit_before FROM public.beta_audit_logs WHERE target_id=controlled_program AND action='controlled_beta_started';
  PERFORM public.admin_start_controlled_beta_program(controlled_program,'OPERATOR_APPROVED_START','test:admin');
  PERFORM public.admin_start_controlled_beta_program(controlled_program,'OPERATOR_APPROVED_START','test:admin');
  SELECT count(*) INTO audit_after FROM public.beta_audit_logs WHERE target_id=controlled_program AND action='controlled_beta_started';
  IF audit_after-audit_before<>1 OR (SELECT status FROM public.beta_programs WHERE id=controlled_program)<>'active' THEN RAISE EXCEPTION 'start was not atomic and idempotent'; END IF;

  BEGIN
    PERFORM public.admin_issue_beta_invite((SELECT id FROM public.beta_programs WHERE program_key='limited_beta_2026'),repeat('a',64),NULL,NULL,1,now()+interval '1 day','test:admin');
    RAISE EXCEPTION 'legacy invite accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN ('PROGRAM_SCHOOL_CONTRACT_INVALID','PROGRAM_UNAVAILABLE') THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_issue_beta_invite(controlled_program,repeat('b',64),NULL,NULL,2,now()+interval '1 day','test:admin');
    RAISE EXCEPTION 'multi-use invite accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_FIRST_BETA_INVITE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_issue_beta_invite(controlled_program,repeat('c',64),NULL,NULL,1,now()+interval '8 days','test:admin');
    RAISE EXCEPTION 'overlong invite accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_FIRST_BETA_INVITE' THEN RAISE; END IF; END;
  invite_id:=public.admin_issue_beta_invite(controlled_program,repeat('d',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  IF public.redeem_beta_invite('41000000-0000-4000-8000-000000000001',repeat('d',64),repeat('e',64),repeat('f',64))<>'PENDING_REVIEW' THEN RAISE EXCEPTION 'valid invite redemption failed'; END IF;
  SELECT id INTO member_id FROM public.beta_members member WHERE member.program_id=controlled_program AND member.user_id='41000000-0000-4000-8000-000000000001';
  IF NOT EXISTS(SELECT 1 FROM public.beta_members WHERE id=member_id AND target_school_id=target_school) THEN RAISE EXCEPTION 'member school contract missing'; END IF;
  PERFORM public.admin_review_beta_member(member_id,'active','ADMIN_APPROVED','test:admin');

  invite_id:=public.admin_issue_beta_invite(controlled_program,repeat('8',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  IF public.redeem_beta_invite('41000000-0000-4000-8000-000000000002',repeat('8',64),repeat('7',64),repeat('6',64))<>'PENDING_REVIEW' THEN RAISE EXCEPTION 'second valid invite redemption failed'; END IF;
  SELECT id INTO second_member_id FROM public.beta_members member WHERE member.program_id=controlled_program AND member.user_id='41000000-0000-4000-8000-000000000002';

  FOR invite_number IN 1..18 LOOP
    PERFORM public.admin_issue_beta_invite(
      controlled_program,lpad(invite_number::text,64,'0'),NULL,NULL,1,now()+interval '1 day','test:admin'
    );
  END LOOP;
  BEGIN
    PERFORM public.admin_issue_beta_invite(controlled_program,repeat('9',64),NULL,NULL,1,now()+interval '1 day','test:admin');
    RAISE EXCEPTION 'capacity overflow invite accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_FULL' THEN RAISE; END IF; END;

  INSERT INTO public.private_profiles(owner_user_id,display_name) VALUES('41000000-0000-4000-8000-000000000001','TEST USER') RETURNING id INTO profile_id;
  PERFORM set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  PERFORM set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('role','authenticated',true);
  BEGIN
    INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
    VALUES(profile_id,'41000000-0000-4000-8000-000000000001',other_school,2020);
    RAISE EXCEPTION 'out-of-scope school accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SCHOOL_OUTSIDE_BETA_SCOPE' THEN RAISE; END IF; END;
  INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
  VALUES(profile_id,'41000000-0000-4000-8000-000000000001',target_school,2020);
  BEGIN
    INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
    VALUES(profile_id,'41000000-0000-4000-8000-000000000001',target_school,2019);
    RAISE EXCEPTION 'second school history accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SECOND_SCHOOL_NOT_ALLOWED' THEN RAISE; END IF; END;
  PERFORM set_config('role','none',true);

  PERFORM public.admin_controlled_beta_stop('account_registration','PRIVACY_EXPOSURE','test:admin');
  IF public.has_beta_feature_access('41000000-0000-4000-8000-000000000001','account_registration')
    THEN RAISE EXCEPTION 'global fail-closed stop did not narrow program access'; END IF;
  PERFORM public.admin_set_beta_feature(NULL,NULL,'account_registration',true,'INCIDENT_RESOLVED','test:admin');

  PERFORM public.admin_set_beta_emergency(controlled_program,true,'PRIVACY_EXPOSURE','test:admin');
  IF NOT EXISTS(SELECT 1 FROM public.beta_programs WHERE id=controlled_program AND status='paused' AND emergency_disabled_at IS NOT NULL) THEN RAISE EXCEPTION 'emergency stop did not pause access'; END IF;
  BEGIN
    PERFORM public.admin_review_beta_member(second_member_id,'active','ADMIN_APPROVED','test:admin');
    RAISE EXCEPTION 'member approved while program unavailable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_UNAVAILABLE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_set_beta_emergency(controlled_program,false,'ADMIN_RESTORE','test:admin');
    RAISE EXCEPTION 'generic emergency clear restored access';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REACTIVATION_REQUIRED' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_reactivate_controlled_beta_program(controlled_program,'OPERATOR_APPROVED_REACTIVATION','INCIDENT_RESOLVED','test:admin');
    RAISE EXCEPTION 'reactivation without fresh readiness accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FRESH_READINESS_REQUIRED' THEN RAISE; END IF; END;
  PERFORM public.admin_record_beta_readiness(controlled_program,'limited_beta','{"health":true,"rls":true,"incidentResolved":true}'::jsonb,ARRAY[]::text[],true,'test:admin');
  PERFORM public.admin_reactivate_controlled_beta_program(controlled_program,'OPERATOR_APPROVED_REACTIVATION','INCIDENT_RESOLVED','test:admin');
  IF NOT EXISTS(SELECT 1 FROM public.beta_programs WHERE id=controlled_program AND status='active' AND emergency_disabled_at IS NULL) THEN RAISE EXCEPTION 'approved reactivation failed'; END IF;
END $$;

ROLLBACK;
SELECT 'PHASE10J_LIFECYCLE_OK' status;
