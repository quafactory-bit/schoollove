\set ON_ERROR_STOP on

DO $fixture$
DECLARE
  actor uuid := '20000000-0000-4000-8000-000000000001';
  peer uuid := '20000000-0000-4000-8000-000000000002';
  approval_peer uuid := '20000000-0000-4000-8000-000000000003';
  target_school uuid;
  draft_id uuid;
  v_program_id uuid;
  invite_id uuid;
  member_id uuid;
  request_id uuid := '40000000-0000-4000-8000-000000000001';
  connection_id uuid := '41000000-0000-4000-8000-000000000001';
  approval_request_id uuid := '40000000-0000-4000-8000-000000000002';
  approval_connection_id uuid := '41000000-0000-4000-8000-000000000002';
  token_hash text := repeat('b',64);
  claim_count_before integer;
  result text;
  passed integer := 0;
BEGIN
  SELECT membership.school_id INTO target_school
  FROM public.profile_school_memberships membership
  WHERE membership.owner_user_id=actor;
  IF target_school IS NULL THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_TARGET_SCHOOL_MISSING'; END IF;
  INSERT INTO auth.users(id,email) VALUES(approval_peer,NULL);

  BEGIN
    PERFORM public.admin_save_beta_setup(
      NULL,'connected_instagram_mixed','Invalid mixed contract',now()-interval '1 hour',now()+interval '13 days 23 hours',3,
      'local school',target_school,ARRAY['instagram_permission','messaging'],
      '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb,true,
      '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb,
      'local negative fixture','validated','local-admin'
    );
    RAISE EXCEPTION 'MIXED_CONTRACT_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_CONTROLLED_BETA_FEATURE_SET%' THEN RAISE; END IF;
  END;
  passed:=passed+1;

  draft_id:=public.admin_save_beta_setup(
    NULL,'connected_instagram_local','Connected Instagram local',now()-interval '1 hour',now()+interval '13 days 23 hours',3,
    'local school',target_school,ARRAY['instagram_permission'],
    '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb,true,
    '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb,
    'local disposable fixture','validated','local-admin'
  );
  v_program_id:=public.admin_activate_beta_setup(draft_id,'local-admin');
  IF NOT public.admin_configure_controlled_beta_features(v_program_id,ARRAY['instagram_permission'],'local-admin')
    THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_CONFIGURE_FAILED'; END IF;
  PERFORM public.admin_record_beta_readiness(
    v_program_id,'limited_beta','{"snapshotValid":true,"schoolContract":true,"featureContract":true}'::jsonb,
    '{}'::text[],true,'local-admin'
  );
  IF NOT public.admin_start_controlled_beta_program(v_program_id,'LOCAL_READY','local-admin')
    THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_START_FAILED'; END IF;

  IF (SELECT status FROM public.beta_programs WHERE id=v_program_id)<>'active'
    OR (SELECT max_users FROM public.beta_program_setup_snapshots WHERE program_id=v_program_id)<>3
    OR (SELECT cardinality(enabled_features) FROM public.beta_program_setup_snapshots WHERE program_id=v_program_id)<>1
    OR (SELECT enabled_features FROM public.beta_program_setup_snapshots WHERE program_id=v_program_id)
      IS DISTINCT FROM ARRAY['instagram_permission']::text[]
  THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_PROGRAM_CONTRACT_FAILED'; END IF;
  passed:=passed+1;
  IF (SELECT invite_policy FROM public.beta_program_setup_snapshots WHERE beta_program_setup_snapshots.program_id=v_program_id)
      IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR (SELECT approval_waitlist_enabled FROM public.beta_program_setup_snapshots WHERE beta_program_setup_snapshots.program_id=v_program_id) IS DISTINCT FROM true
    OR (SELECT stop_conditions FROM public.beta_program_setup_snapshots WHERE beta_program_setup_snapshots.program_id=v_program_id)
      IS DISTINCT FROM '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb
    OR (SELECT ends_at-starts_at FROM public.beta_programs WHERE id=v_program_id)<>interval '14 days'
  THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_ENVELOPE_FAILED'; END IF;
  passed:=passed+1;
  IF (SELECT count(*) FROM public.beta_program_schools WHERE beta_program_schools.program_id=v_program_id)<>1
    THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_SCHOOL_SCOPE_FAILED'; END IF;
  passed:=passed+1;
  IF (SELECT count(*) FROM public.beta_feature_flags WHERE beta_feature_flags.program_id=v_program_id AND user_id IS NULL)<>8
    OR (SELECT count(*) FROM public.beta_feature_flags WHERE beta_feature_flags.program_id=v_program_id AND user_id IS NULL AND enabled)<>1
  THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_FLAGS_FAILED'; END IF;
  passed:=passed+1;

  invite_id:=public.admin_issue_beta_invite(v_program_id,token_hash,NULL,NULL,1,now()+interval '1 day','local-admin');
  SELECT count(*) INTO claim_count_before FROM public.beta_onboarding_invite_claims;
  result:=public.redeem_beta_invite(actor,token_hash,NULL,NULL);
  IF result<>'CONNECTED_INSTAGRAM_PREREQUISITES_REQUIRED'
    THEN RAISE EXCEPTION 'ACTIVE_CONNECTION_PREREQUISITE_FAILED:%',result; END IF;
  passed:=passed+1;
  IF (SELECT use_count FROM public.beta_invites WHERE id=invite_id)<>0
    OR EXISTS(SELECT 1 FROM public.beta_members WHERE beta_members.program_id=v_program_id AND user_id=actor)
  THEN RAISE EXCEPTION 'REJECTED_REDEEM_MUTATED'; END IF;
  passed:=passed+1;

  INSERT INTO public.connection_requests(
    id,sender_user_id,receiver_user_id,relationship_type,message,status,responded_at
  ) VALUES(request_id,actor,peer,'other','Local hello','accepted',now());
  INSERT INTO public.connections(id,request_id,user_low_id,user_high_id,status)
  VALUES(connection_id,request_id,actor,peer,'active');

  result:=public.redeem_beta_invite(actor,token_hash,NULL,NULL);
  IF result<>'PENDING_REVIEW' THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_REDEEM_FAILED:%',result; END IF;
  passed:=passed+1;
  SELECT id INTO member_id FROM public.beta_members
  WHERE beta_members.program_id=v_program_id AND user_id=actor;
  IF member_id IS NULL OR (SELECT use_count FROM public.beta_invites WHERE id=invite_id)<>1
    OR public.has_beta_feature_access(actor,'instagram_permission')
  THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_PENDING_SEMANTICS_FAILED'; END IF;
  passed:=passed+1;
  IF (SELECT count(*) FROM public.beta_onboarding_invite_claims)<>claim_count_before
    THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_PROVISIONAL_CLAIM_CREATED'; END IF;
  passed:=passed+1;

  UPDATE public.connections SET status='disconnected',disconnected_at=now(),disconnected_by_user_id=actor
  WHERE id=connection_id;
  BEGIN
    PERFORM public.admin_review_beta_member(member_id,'active','ADMIN_APPROVED','local-admin');
    RAISE EXCEPTION 'APPROVAL_WITHOUT_CONNECTION_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CONNECTED_INSTAGRAM_APPROVAL_PREREQUISITES_REQUIRED%' THEN RAISE; END IF;
  END;
  passed:=passed+1;
  IF (SELECT status FROM public.beta_members WHERE id=member_id)<>'pending_review'
    THEN RAISE EXCEPTION 'FAILED_APPROVAL_MUTATED_MEMBER'; END IF;
  passed:=passed+1;
  INSERT INTO public.connection_requests(
    id,sender_user_id,receiver_user_id,relationship_type,message,status,responded_at
  ) VALUES(approval_request_id,actor,approval_peer,'other','Local approval prerequisite','accepted',now());
  INSERT INTO public.connections(id,request_id,user_low_id,user_high_id,status)
  VALUES(approval_connection_id,approval_request_id,actor,approval_peer,'active');

  IF NOT public.admin_review_beta_member(member_id,'active','ADMIN_APPROVED','local-admin')
    THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_APPROVAL_FAILED'; END IF;
  passed:=passed+1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF NOT public.has_beta_feature_access(actor,'instagram_permission')
    THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_ACCESS_FAILED'; END IF;
  passed:=passed+1;
  IF NOT public.has_beta_feature_access(actor,'people_search')
    OR NOT public.has_beta_feature_access(actor,'connection_request')
  THEN RAISE EXCEPTION 'PEOPLE_DISCOVERY_ACCESS_REGRESSED'; END IF;
  passed:=passed+1;
  IF public.has_beta_feature_access(actor,'messaging')
    THEN RAISE EXCEPTION 'MESSAGING_ACCESS_LEAKED'; END IF;
  passed:=passed+1;
  IF public.has_beta_feature_access(actor,'account_registration')
    OR public.has_beta_feature_access(actor,'private_profile')
    OR public.has_beta_feature_access(actor,'promotion_application')
    OR public.has_beta_feature_access(actor,'promotion_operations')
  THEN RAISE EXCEPTION 'UNRELATED_FEATURE_ACCESS_LEAKED'; END IF;
  passed:=passed+1;
  IF (SELECT count(*) FROM public.beta_members WHERE user_id=actor)<>2
    OR (SELECT count(DISTINCT beta_members.program_id) FROM public.beta_members WHERE user_id=actor)<>2
  THEN RAISE EXCEPTION 'MULTI_PROGRAM_MEMBERSHIP_FAILED'; END IF;
  passed:=passed+1;

  IF public.redeem_beta_invite(actor,token_hash,NULL,NULL)<>'ALREADY_REDEEMED'
    OR (SELECT use_count FROM public.beta_invites WHERE id=invite_id)<>1
  THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_ONE_USE_FAILED'; END IF;
  passed:=passed+1;

  UPDATE public.beta_feature_flags SET enabled=false,reason_code='LOCAL_STOP',updated_by='local-admin'
  WHERE program_id IS NULL AND user_id IS NULL AND feature_key='instagram_permission';
  IF public.has_beta_feature_access(actor,'instagram_permission')
    THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_GLOBAL_STOP_FAILED'; END IF;
  passed:=passed+1;
  UPDATE public.beta_feature_flags SET enabled=true,reason_code='LOCAL_RESTORE',updated_by='local-admin'
  WHERE program_id IS NULL AND user_id IS NULL AND feature_key='instagram_permission';

  IF (SELECT state FROM public.public_account_launch_control WHERE control_key='public_account')<>'closed'
    THEN RAISE EXCEPTION 'PUBLIC_LAUNCH_CHANGED'; END IF;
  IF passed<>20 THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_MATRIX_COUNT_FAILED:%',passed; END IF;
END
$fixture$;

SELECT 'CONNECTED_INSTAGRAM_BETA_LIFECYCLE_OK' AS status;
