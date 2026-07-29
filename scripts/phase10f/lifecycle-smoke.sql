\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email,created_at,updated_at)
VALUES
  ('10000000-0000-4000-8000-000000000001','alpha@example.invalid',now(),now()),
  ('10000000-0000-4000-8000-000000000002','beta@example.invalid',now(),now());

INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
VALUES('10000000-0000-4000-8000-000000000001',true,'self_attestation','phase10b-2026-07-28');
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT '10000000-0000-4000-8000-000000000001',consent_type,true,'phase10b-2026-07-28'
FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) consent_type;

DO $$
DECLARE v_program_id uuid; v_invite_id uuid; v_member_id uuid; result text; v_profile_id uuid; v_school_id uuid; v_export_id uuid; run1 jsonb; run2 jsonb;
BEGIN
  SELECT id INTO v_program_id FROM public.beta_programs WHERE program_key='limited_beta_2026';
  v_invite_id:=public.admin_issue_beta_invite(v_program_id,repeat('a',64),NULL,NULL,1,now()+interval '1 day','test:admin');
  result:=public.redeem_beta_invite('10000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),repeat('c',64));
  IF result<>'PENDING_REVIEW' THEN RAISE EXCEPTION 'unexpected redeem status %',result; END IF;
  IF public.has_beta_feature_access('10000000-0000-4000-8000-000000000001','private_profile') THEN RAISE EXCEPTION 'pending member received access'; END IF;
  SELECT id INTO v_member_id FROM public.beta_members WHERE invite_id=v_invite_id;
  PERFORM public.admin_review_beta_member(v_member_id,'active','SYNTHETIC_APPROVAL','test:admin');
  IF NOT public.has_beta_feature_access('10000000-0000-4000-8000-000000000001','private_profile') THEN RAISE EXCEPTION 'active member lacks access'; END IF;

  INSERT INTO public.private_profiles(owner_user_id,display_name) VALUES('10000000-0000-4000-8000-000000000001','Synthetic Adult') RETURNING id INTO v_profile_id;
  INSERT INTO public.schools(school_name,school_type,slug) VALUES('Synthetic School','high','synthetic-school') RETURNING id INTO v_school_id;
  INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
  VALUES(v_profile_id,'10000000-0000-4000-8000-000000000001',v_school_id,extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer);
  BEGIN
    INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
    VALUES(v_profile_id,'10000000-0000-4000-8000-000000000001',v_school_id,extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer+1);
    RAISE EXCEPTION 'future graduation year was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'FUTURE_GRADUATION_YEAR_NOT_ALLOWED' THEN RAISE; END IF;
  END;

  v_export_id:=public.request_own_data_export('10000000-0000-4000-8000-000000000001','json');
  run1:=public.run_phase10f_maintenance('synthetic:2026-07-29',now());
  run2:=public.run_phase10f_maintenance('synthetic:2026-07-29',now());
  IF COALESCE((run1->>'ok')::boolean,false) IS NOT true THEN RAISE EXCEPTION 'maintenance did not succeed: %',run1; END IF;
  IF COALESCE((run2->>'idempotent')::boolean,false) IS NOT true THEN RAISE EXCEPTION 'maintenance replay was not idempotent'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.data_export_jobs WHERE id=v_export_id AND status='ready') THEN RAISE EXCEPTION 'export did not become ready'; END IF;

  PERFORM public.admin_set_beta_emergency(v_program_id,true,'SYNTHETIC_EMERGENCY','test:admin');
  IF public.has_beta_feature_access('10000000-0000-4000-8000-000000000001','private_profile') THEN RAISE EXCEPTION 'emergency switch failed closed'; END IF;
  PERFORM public.admin_set_beta_emergency(v_program_id,false,'SYNTHETIC_RESTORE','test:admin');
  IF NOT public.has_beta_feature_access('10000000-0000-4000-8000-000000000001','private_profile') THEN RAISE EXCEPTION 'emergency restore failed'; END IF;
  IF (SELECT count(*) FROM public.beta_audit_logs)<4 THEN RAISE EXCEPTION 'audit log incomplete'; END IF;
END $$;

ROLLBACK;
SELECT 'PHASE10F_LIFECYCLE_OK' AS status;
