DO $fixture$
DECLARE
  actor uuid := '20000000-0000-4000-8000-000000000001';
  other_actor uuid := '20000000-0000-4000-8000-000000000002';
  account_id uuid := '21000000-0000-4000-8000-000000000001';
  auth_identity_id uuid := '22000000-0000-4000-8000-000000000001';
  program_id uuid := '10000000-0000-4000-8000-000000000001';
  draft_id uuid := '11000000-0000-4000-8000-000000000001';
  snapshot_id uuid := '12000000-0000-4000-8000-000000000001';
  invite_id uuid := '30000000-0000-4000-8000-000000000001';
  target_school uuid;
  other_school uuid;
  broker text := 'slb:v1:k01:google:' || repeat('A',43);
  result text;
  member_id uuid;
BEGIN
  SELECT id INTO target_school FROM public.schools WHERE school_type='high' ORDER BY id LIMIT 1;
  SELECT id INTO other_school FROM public.schools WHERE id<>target_school ORDER BY id LIMIT 1;
  IF target_school IS NULL OR other_school IS NULL THEN RAISE EXCEPTION 'FIXTURE_SCHOOLS_MISSING'; END IF;

  INSERT INTO auth.users(id,email) VALUES(actor,NULL),(other_actor,NULL);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data)
  VALUES(auth_identity_id,actor,broker,'custom:schoollove-google',jsonb_build_object('sub',broker));
  INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject)
  VALUES(account_id,actor,'provisional','google',broker);
  INSERT INTO private.social_identity_registry(
    broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status
  ) VALUES(broker,'google',decode(repeat('11',32),'hex'),1,account_id,actor,'provisional');

  INSERT INTO public.beta_setup_drafts(
    id,draft_key,name,starts_at,ends_at,max_users,target_scope,target_school_id,
    enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,
    operator_memo,status,created_by
  ) VALUES(
    draft_id,'pd_onboarding_local','People Discovery local',now()-interval '1 day',now()+interval '13 days',20,
    'local school',target_school,ARRAY['people_search','connection_request'],
    '{"maxUsesPerInvite":1,"expiresInDays":7}',true,
    '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}',
    'local disposable fixture','activated','local-test'
  );
  INSERT INTO public.beta_programs(id,program_key,name,status,requires_admin_approval,starts_at,ends_at)
  VALUES(program_id,'pd_onboarding_local','People Discovery local','active',true,now()-interval '1 day',now()+interval '13 days');
  INSERT INTO public.beta_program_setup_snapshots(
    id,program_id,source_draft_id,max_users,target_scope,target_school_id,enabled_features,
    invite_policy,approval_waitlist_enabled,stop_conditions,created_by
  ) VALUES(
    snapshot_id,program_id,draft_id,20,'local school',target_school,
    ARRAY['people_search','connection_request'],'{"maxUsesPerInvite":1,"expiresInDays":7}',true,
    '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}','local-test'
  );
  INSERT INTO public.beta_program_schools(program_id,school_id,source_snapshot_id,created_by)
  VALUES(program_id,target_school,snapshot_id,'local-test');
  INSERT INTO public.beta_feature_flags(program_id,user_id,feature_key,enabled,reason_code,updated_by)
  SELECT program_id,NULL,feature,feature IN ('people_search','connection_request'),'PEOPLE_DISCOVERY_BETA','local-test'
  FROM unnest(ARRAY['account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations']) feature;
  UPDATE public.beta_feature_flags SET enabled=true,reason_code='LOCAL_TEST',updated_by='local-test'
  WHERE beta_feature_flags.program_id IS NULL
    AND beta_feature_flags.user_id IS NULL
    AND beta_feature_flags.feature_key IN ('people_search','connection_request');
  INSERT INTO public.beta_invites(id,program_id,token_hash,max_uses,use_count,expires_at,created_by)
  VALUES(invite_id,program_id,repeat('a',64),1,0,now()+interval '1 day','local-test');

  IF public.has_beta_onboarding_access(actor,'adult_eligibility') THEN
    RAISE EXCEPTION 'ACCESS_WITHOUT_CLAIM';
  END IF;
  result:=public.claim_beta_invite_for_onboarding(actor,repeat('f',64),NULL,NULL);
  IF result<>'UNAVAILABLE' OR EXISTS(SELECT 1 FROM public.beta_onboarding_invite_claims) THEN
    RAISE EXCEPTION 'INVALID_CLAIM_MUTATED';
  END IF;
  result:=public.claim_beta_invite_for_onboarding(actor,repeat('a',64),NULL,NULL);
  IF result<>'ONBOARDING_CLAIMED' THEN RAISE EXCEPTION 'VALID_CLAIM_FAILED:%',result; END IF;
  IF (SELECT count(*) FROM public.beta_onboarding_invite_claims claims WHERE claims.user_id=actor AND claims.status='claimed')<>1
    OR (SELECT count(*) FROM public.beta_members members WHERE members.user_id=actor)<>0
    OR (SELECT use_count FROM public.beta_invites invites WHERE invites.id=invite_id)<>0
  THEN RAISE EXCEPTION 'CLAIM_SEMANTICS_FAILED'; END IF;

  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF NOT public.has_beta_onboarding_access(actor,'adult_eligibility')
    OR public.has_beta_onboarding_access(other_actor,'adult_eligibility')
    OR public.has_beta_onboarding_access(actor,'people_search')
    OR public.has_beta_feature_access(actor,'people_search')
    OR public.has_beta_feature_access(actor,'connection_request')
  THEN RAISE EXCEPTION 'CLAIM_ACCESS_SEPARATION_FAILED'; END IF;

  IF public.finalize_beta_onboarding_claim(actor)<>'ONBOARDING_REQUIRED' THEN RAISE EXCEPTION 'ADULT_GATE_FAILED'; END IF;
  PERFORM public.admin_complete_own_adult_eligibility(actor,'phase10b-2026-07-28');
  IF public.finalize_beta_onboarding_claim(actor)<>'ONBOARDING_REQUIRED' THEN RAISE EXCEPTION 'CONSENT_GATE_FAILED'; END IF;
  INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
  SELECT actor,consent_type,true,'phase10b-2026-07-28'
  FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation']) consent_type;
  IF public.finalize_beta_onboarding_claim(actor)<>'ONBOARDING_REQUIRED' THEN RAISE EXCEPTION 'THREE_OF_FOUR_GATE_FAILED'; END IF;
  PERFORM public.record_own_required_consents('phase10b-2026-07-28');
  IF public.finalize_beta_onboarding_claim(actor)<>'ONBOARDING_REQUIRED' THEN RAISE EXCEPTION 'PROFILE_GATE_FAILED'; END IF;
  PERFORM public.upsert_own_private_profile('Local Owner',NULL,NULL);
  IF public.finalize_beta_onboarding_claim(actor)<>'ONBOARDING_REQUIRED' THEN RAISE EXCEPTION 'MEMBERSHIP_GATE_FAILED'; END IF;

  BEGIN
    PERFORM public.add_own_school_membership_with_class_history(other_school,2020,'[]'::jsonb);
    RAISE EXCEPTION 'OUTSIDE_SCHOOL_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SCHOOL_OUTSIDE_BETA_SCOPE%' THEN RAISE; END IF;
  END;
  PERFORM public.add_own_school_membership_with_class_history(
    target_school,2020,'[{"grade_number":1,"class_number":2},{"grade_number":3,"class_number":4}]'::jsonb
  );
  BEGIN
    PERFORM public.add_own_school_membership_with_class_history(target_school,2019,'[]'::jsonb);
    RAISE EXCEPTION 'SECOND_SCHOOL_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SECOND_SCHOOL_NOT_ALLOWED%' THEN RAISE; END IF;
  END;

  result:=public.finalize_beta_onboarding_claim(actor);
  IF result<>'PENDING_REVIEW' THEN RAISE EXCEPTION 'FINALIZE_FAILED:%',result; END IF;
  IF (SELECT count(*) FROM public.beta_members members WHERE members.user_id=actor AND members.status='pending_review')<>1
    OR (SELECT use_count FROM public.beta_invites invites WHERE invites.id=invite_id)<>1
    OR (SELECT count(*) FROM public.beta_onboarding_invite_claims claims WHERE claims.user_id=actor AND claims.status='consumed')<>1
  THEN RAISE EXCEPTION 'FINALIZE_SEMANTICS_FAILED'; END IF;
  IF public.finalize_beta_onboarding_claim(actor)<>'PENDING_REVIEW'
    OR (SELECT count(*) FROM public.beta_members members WHERE members.user_id=actor)<>1
  THEN RAISE EXCEPTION 'FINALIZE_IDEMPOTENCE_FAILED'; END IF;
  IF public.has_beta_feature_access(actor,'people_search') OR public.has_beta_feature_access(actor,'connection_request')
  THEN RAISE EXCEPTION 'PENDING_FEATURE_LEAK'; END IF;

  SELECT members.id INTO member_id FROM public.beta_members members WHERE members.user_id=actor;
  IF NOT public.admin_review_beta_member(member_id,'active','ADMIN_APPROVED','local-admin')
  THEN RAISE EXCEPTION 'APPROVAL_FAILED'; END IF;
  IF NOT public.has_beta_feature_access(actor,'people_search')
    OR NOT public.has_beta_feature_access(actor,'connection_request')
    OR public.has_beta_feature_access(actor,'messaging')
    OR public.has_beta_feature_access(actor,'instagram_permission')
    OR public.has_beta_feature_access(actor,'promotion_application')
    OR public.has_beta_feature_access(actor,'promotion_operations')
  THEN RAISE EXCEPTION 'ACTIVE_FEATURE_CONTRACT_FAILED'; END IF;
  IF (SELECT state FROM public.public_account_launch_control WHERE control_key='public_account')<>'closed'
  THEN RAISE EXCEPTION 'LAUNCH_STATE_CHANGED'; END IF;
END
$fixture$;

SELECT 'CONTROLLED_BETA_ONBOARDING_LIFECYCLE_OK' AS status;
