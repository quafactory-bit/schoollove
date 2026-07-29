\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
  ('20000000-0000-4000-8000-000000000001','test-beta-user-a@example.invalid',now(),now()),
  ('20000000-0000-4000-8000-000000000002','test-beta-user-b@example.invalid',now(),now()),
  ('20000000-0000-4000-8000-000000000003','test-waitlist-user@example.invalid',now(),now()),
  ('20000000-0000-4000-8000-000000000004','test-rejected-user@example.invalid',now(),now()),
  ('20000000-0000-4000-8000-000000000005','test-beta-admin@example.invalid',now(),now());

DO $$
DECLARE
  state jsonb;
  primary_program_id uuid;
  other_program_id uuid;
  created_invite_id uuid;
  created_member_id uuid;
  profile_id uuid;
  school_id uuid;
  funnel jsonb;
  run1 jsonb;
  run2 jsonb;
BEGIN
  SELECT id INTO primary_program_id FROM public.beta_programs WHERE program_key='limited_beta_2026';
  INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at)
  VALUES('synthetic_beta_10h','TEST Other Program','active',true,now()) RETURNING id INTO other_program_id;

  INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
  SELECT id,true,'self_attestation','phase10b-2026-07-28' FROM auth.users
  WHERE id IN (
    '20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004'
  );
  INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
  SELECT u.id,kind,true,'phase10b-2026-07-28' FROM auth.users u
  CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) kind
  WHERE u.id IN (
    '20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004'
  );

  PERFORM public.admin_issue_beta_invite(primary_program_id,repeat('9',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  IF public.redeem_beta_invite('20000000-0000-4000-8000-000000000005',repeat('9',64),repeat('1',64),repeat('2',64))<>'ADULT_CONSENT_REQUIRED'
    OR EXISTS(SELECT 1 FROM public.beta_members m WHERE m.user_id='20000000-0000-4000-8000-000000000005')
    THEN RAISE EXCEPTION 'non-adult invite redemption was not blocked'; END IF;
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','organic_social');
  IF state->>'stage'<>'adult_required' THEN RAISE EXCEPTION 'unexpected initial stage %',state; END IF;

  INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
  VALUES('20000000-0000-4000-8000-000000000001',true,'self_attestation','phase10b-2026-07-28');
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'consent_required' THEN RAISE EXCEPTION 'adult stage failed %',state; END IF;

  INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
  SELECT '20000000-0000-4000-8000-000000000001',kind,true,'phase10b-2026-07-28'
  FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) kind;
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'invite_required' THEN RAISE EXCEPTION 'consent stage failed %',state; END IF;

  created_invite_id:=public.admin_issue_beta_invite(primary_program_id,repeat('d',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  IF public.redeem_beta_invite('20000000-0000-4000-8000-000000000001',repeat('d',64),repeat('e',64),repeat('f',64))<>'PENDING_REVIEW'
    THEN RAISE EXCEPTION 'invite redemption failed'; END IF;
  IF public.redeem_beta_invite('20000000-0000-4000-8000-000000000001',repeat('d',64),repeat('e',64),repeat('f',64))<>'ALREADY_REDEEMED'
    OR (SELECT use_count FROM public.beta_invites WHERE id=created_invite_id)<>1
    THEN RAISE EXCEPTION 'duplicate invite redemption was not idempotently blocked'; END IF;
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'approval_pending' THEN RAISE EXCEPTION 'approval stage failed %',state; END IF;

  SELECT id INTO created_member_id FROM public.beta_members WHERE invite_id=created_invite_id;
  PERFORM public.admin_review_beta_member(created_member_id,'active','SYNTHETIC_APPROVAL','test:admin');
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'profile_required' THEN RAISE EXCEPTION 'profile stage failed %',state; END IF;

  INSERT INTO public.private_profiles(owner_user_id,display_name)
  VALUES('20000000-0000-4000-8000-000000000001','Synthetic Adult') RETURNING id INTO profile_id;
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'school_required' THEN RAISE EXCEPTION 'school stage failed %',state; END IF;

  INSERT INTO public.schools(school_name,school_type,slug)
  VALUES('Synthetic Launch School','high','synthetic-launch-school') RETURNING id INTO school_id;
  INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
  VALUES(profile_id,'20000000-0000-4000-8000-000000000001',school_id,2020);
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'ready' OR (state->>'discoveryReady')::boolean IS NOT true THEN RAISE EXCEPTION 'ready stage failed %',state; END IF;
  PERFORM public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','paid_social');
  IF (SELECT count(*) FROM public.beta_onboarding_stage_events WHERE progress_id IN (
    SELECT id FROM public.beta_onboarding_progress WHERE user_id='20000000-0000-4000-8000-000000000001'))<>7
    THEN RAISE EXCEPTION 'stage deduplication failed'; END IF;
  IF (SELECT source_channel FROM public.beta_onboarding_progress WHERE user_id='20000000-0000-4000-8000-000000000001')<>'organic_social'
    THEN RAISE EXCEPTION 'first coarse source was not preserved'; END IF;

  -- Another program token must bind the user to that program and win onboarding selection.
  PERFORM public.admin_issue_beta_invite(other_program_id,repeat('a',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  IF public.redeem_beta_invite('20000000-0000-4000-8000-000000000002',repeat('a',64),repeat('1',64),repeat('2',64))<>'PENDING_REVIEW'
    THEN RAISE EXCEPTION 'other program invite failed'; END IF;
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000002','community');
  IF state->>'stage'<>'approval_pending' OR NOT EXISTS(
    SELECT 1 FROM public.beta_onboarding_progress p WHERE p.user_id='20000000-0000-4000-8000-000000000002' AND p.program_id=other_program_id
  ) THEN RAISE EXCEPTION 'membership program selection failed %',state; END IF;

  -- Pending and rejected users remain non-active.
  PERFORM public.admin_issue_beta_invite(primary_program_id,repeat('b',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  IF public.redeem_beta_invite('20000000-0000-4000-8000-000000000003',repeat('b',64),repeat('1',64),repeat('2',64))<>'PENDING_REVIEW'
    THEN RAISE EXCEPTION 'waitlist invite failed'; END IF;
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000003','referral');
  IF state->>'stage'<>'approval_pending' THEN RAISE EXCEPTION 'waitlist stage failed %',state; END IF;

  PERFORM public.admin_issue_beta_invite(primary_program_id,repeat('c',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  IF public.redeem_beta_invite('20000000-0000-4000-8000-000000000004',repeat('c',64),repeat('1',64),repeat('2',64))<>'PENDING_REVIEW'
    THEN RAISE EXCEPTION 'rejected-user invite failed'; END IF;
  SELECT m.id INTO created_member_id FROM public.beta_members m
  WHERE m.user_id='20000000-0000-4000-8000-000000000004' AND m.program_id=primary_program_id;
  PERFORM public.admin_review_beta_member(created_member_id,'rejected','SYNTHETIC_REJECTION','test:admin');
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000004','direct');
  IF state->>'stage'<>'access_paused' THEN RAISE EXCEPTION 'rejected user was not blocked %',state; END IF;

  -- Expired and exhausted tokens fail without a membership mutation.
  INSERT INTO public.beta_invites(program_id,token_hash,max_uses,use_count,expires_at,created_at,created_by)
  VALUES(primary_program_id,repeat('e',64),1,0,now()-interval '1 minute',now()-interval '1 hour','test:admin'),
        (primary_program_id,repeat('f',64),1,1,now()+interval '1 hour',now()-interval '1 hour','test:admin');
  IF public.redeem_beta_invite('20000000-0000-4000-8000-000000000002',repeat('e',64),repeat('1',64),repeat('2',64))<>'UNAVAILABLE'
    OR public.redeem_beta_invite('20000000-0000-4000-8000-000000000002',repeat('f',64),repeat('1',64),repeat('2',64))<>'UNAVAILABLE'
    THEN RAISE EXCEPTION 'expired or exhausted invite was accepted'; END IF;

  UPDATE public.beta_programs SET status='paused' WHERE id=primary_program_id;
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'access_paused' THEN RAISE EXCEPTION 'paused program did not fail closed %',state; END IF;
  UPDATE public.beta_programs SET status='active' WHERE id=primary_program_id;

  UPDATE public.beta_feature_flags f SET enabled=false,reason_code='EMERGENCY_DISABLED'
  WHERE f.program_id IS NULL AND f.user_id IS NULL AND f.feature_key='people_search';
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'access_paused' THEN RAISE EXCEPTION 'disabled discovery did not fail closed %',state; END IF;
  UPDATE public.beta_feature_flags f SET enabled=true,reason_code='LIMITED_BETA_DEFAULT_ENABLED'
  WHERE f.program_id IS NULL AND f.user_id IS NULL AND f.feature_key='people_search';

  funnel:=public.admin_get_limited_launch_funnel((now() AT TIME ZONE 'Asia/Seoul')::date,(now() AT TIME ZONE 'Asia/Seoul')::date);
  IF jsonb_array_length(funnel->'currentStages')<1 OR jsonb_array_length(funnel->'dailyEntries')<1 THEN RAISE EXCEPTION 'funnel unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(funnel->'currentStages') item
    WHERE COALESCE((item->>'masked')::boolean,false)=false OR item->'count'<>'null'::jsonb)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(funnel->'dailyEntries') item
    WHERE COALESCE((item->>'masked')::boolean,false)=false OR item->'count'<>'null'::jsonb)
    THEN RAISE EXCEPTION 'small funnel segment leaked an exact count %',funnel; END IF;
  IF (SELECT count(*) FROM public.beta_audit_logs WHERE actor_reference='test:admin')<5
    THEN RAISE EXCEPTION 'admin audit trail missing'; END IF;
  run1:=public.run_phase10h_maintenance('phase10h:synthetic:1',now());
  run2:=public.run_phase10h_maintenance('phase10h:synthetic:1',now());
  IF COALESCE((run1->>'ok')::boolean,false) IS NOT true OR COALESCE((run2->>'idempotent')::boolean,false) IS NOT true
    THEN RAISE EXCEPTION 'maintenance idempotency failed'; END IF;
END $$;

ROLLBACK;
SELECT 'PHASE10H_LIFECYCLE_OK' AS status;
