\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,created_at,updated_at)
VALUES('20000000-0000-4000-8000-000000000001','phase10h@example.invalid',now(),now());

DO $$
DECLARE
  state jsonb;
  program_id uuid;
  created_invite_id uuid;
  created_member_id uuid;
  profile_id uuid;
  school_id uuid;
  funnel jsonb;
  run1 jsonb;
  run2 jsonb;
BEGIN
  SELECT id INTO program_id FROM public.beta_programs WHERE program_key='limited_beta_2026';
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

  created_invite_id:=public.admin_issue_beta_invite(program_id,repeat('d',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  IF public.redeem_beta_invite('20000000-0000-4000-8000-000000000001',repeat('d',64),repeat('e',64),repeat('f',64))<>'PENDING_REVIEW'
    THEN RAISE EXCEPTION 'invite redemption failed'; END IF;
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

  UPDATE public.beta_programs SET status='paused' WHERE id=program_id;
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'access_paused' THEN RAISE EXCEPTION 'paused program did not fail closed %',state; END IF;
  UPDATE public.beta_programs SET status='active' WHERE id=program_id;

  UPDATE public.beta_feature_flags f SET enabled=false,reason_code='EMERGENCY_DISABLED'
  WHERE f.program_id IS NULL AND f.user_id IS NULL AND f.feature_key='people_search';
  state:=public.sync_own_beta_onboarding_state('20000000-0000-4000-8000-000000000001','direct');
  IF state->>'stage'<>'access_paused' THEN RAISE EXCEPTION 'disabled discovery did not fail closed %',state; END IF;
  UPDATE public.beta_feature_flags f SET enabled=true,reason_code='LIMITED_BETA_DEFAULT_ENABLED'
  WHERE f.program_id IS NULL AND f.user_id IS NULL AND f.feature_key='people_search';

  funnel:=public.admin_get_limited_launch_funnel((now() AT TIME ZONE 'Asia/Seoul')::date,(now() AT TIME ZONE 'Asia/Seoul')::date);
  IF jsonb_array_length(funnel->'currentStages')<1 OR jsonb_array_length(funnel->'dailyEntries')<1 THEN RAISE EXCEPTION 'funnel unavailable'; END IF;
  run1:=public.run_phase10h_maintenance('phase10h:synthetic:1',now());
  run2:=public.run_phase10h_maintenance('phase10h:synthetic:1',now());
  IF COALESCE((run1->>'ok')::boolean,false) IS NOT true OR COALESCE((run2->>'idempotent')::boolean,false) IS NOT true
    THEN RAISE EXCEPTION 'maintenance idempotency failed'; END IF;
END $$;

ROLLBACK;
SELECT 'PHASE10H_LIFECYCLE_OK' AS status;
