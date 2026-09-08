-- Disposable only, synthetic rows, real constraints and triggers enabled.
BEGIN;
DO $test$
DECLARE
  program uuid:=gen_random_uuid(); draft uuid:=gen_random_uuid(); school uuid:=gen_random_uuid();
  actor uuid:=gen_random_uuid(); other_actor uuid:=gen_random_uuid(); invite uuid; member uuid;
BEGIN
  INSERT INTO auth.users(id) VALUES(actor),(other_actor);
  INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
  VALUES(school,'Synthetic Audit School','high','Test','Test','LAUNCH-AUDIT','launch-audit');
  INSERT INTO public.beta_programs(id,program_key,name,status,starts_at,ends_at)
  VALUES(program,'launch_audit','Synthetic audit','active',now()-interval '1 day',now()+interval '13 days');
  INSERT INTO public.beta_setup_drafts(id,draft_key,name,starts_at,ends_at,max_users,target_scope,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,status,created_by)
  VALUES(draft,'launch_audit','Synthetic audit',now()-interval '1 day',now()+interval '13 days',20,'one_school',school,ARRAY['people_search','connection_request'],'{"maxUsesPerInvite":1,"expiresInDays":7}',true,'{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}','activated','local-test');
  INSERT INTO public.beta_program_setup_snapshots(program_id,source_draft_id,max_users,target_scope,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,created_by)
  VALUES(program,draft,20,'one_school',school,ARRAY['people_search','connection_request'],'{"maxUsesPerInvite":1,"expiresInDays":7}',true,'{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}','local-test');
  PERFORM public.admin_set_beta_operational_cap(program,1,'LOCAL_AUDIT','local-test');
  INSERT INTO public.beta_invites(program_id,token_hash,max_uses,expires_at,created_by)
  VALUES(program,repeat('a',64),1,now()+interval '1 day','local-test') RETURNING id INTO invite;
  IF private.beta_operational_occupancy(program)<>1 THEN RAISE EXCEPTION 'INVITE_NOT_RESERVED'; END IF;
  BEGIN
    INSERT INTO public.beta_invites(program_id,token_hash,max_uses,expires_at,created_by)
    VALUES(program,repeat('b',64),1,now()+interval '1 day','local-test');
    RAISE EXCEPTION 'CAP_OVERRUN';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PROGRAM_FULL' THEN RAISE; END IF; END;
  INSERT INTO public.beta_onboarding_invite_claims(program_id,invite_id,user_id,target_school_id,expires_at)
  VALUES(program,invite,actor,school,now()+interval '1 hour');
  IF private.beta_operational_occupancy(program)<>1 THEN RAISE EXCEPTION 'CLAIM_DOUBLE_COUNTED'; END IF;
  INSERT INTO public.beta_members(program_id,user_id,invite_id,target_school_id,status)
  VALUES(program,actor,invite,school,'pending_review') RETURNING id INTO member;
  UPDATE public.beta_invites SET use_count=1 WHERE id=invite;
  UPDATE public.beta_onboarding_invite_claims SET status='consumed',consumed_at=clock_timestamp() WHERE invite_id=invite;
  UPDATE public.beta_members SET status='active' WHERE id=member;
  UPDATE public.beta_members SET status='suspended' WHERE id=member;
  IF private.beta_operational_occupancy(program)<>1 THEN RAISE EXCEPTION 'MEMBER_RESERVATION_LOST'; END IF;
  BEGIN
    INSERT INTO public.beta_members(program_id,user_id,target_school_id,status) VALUES(program,other_actor,school,'active');
    RAISE EXCEPTION 'MEMBER_CAP_OVERRUN';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PROGRAM_FULL' THEN RAISE; END IF; END;
  PERFORM public.admin_set_beta_operational_cap(program,2,'LOCAL_AUDIT','local-test');
  INSERT INTO public.beta_invites(program_id,token_hash,max_uses,expires_at,created_by)
  VALUES(program,repeat('c',64),1,now()+interval '1 day','local-test');
  BEGIN
    PERFORM public.admin_set_beta_operational_cap(program,1,'LOCAL_AUDIT','local-test');
    RAISE EXCEPTION 'CAP_BELOW_OCCUPANCY';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PROGRAM_FULL' THEN RAISE; END IF; END;
  UPDATE public.beta_invites SET revoked_at=clock_timestamp() WHERE program_id=program AND use_count=0;
  PERFORM public.admin_set_beta_operational_cap(program,1,'LOCAL_AUDIT','local-test');
  IF has_function_privilege('authenticated','public.admin_set_beta_operational_cap(uuid,integer,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.admin_set_beta_operational_cap(uuid,integer,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.admin_set_beta_operational_cap(uuid,integer,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'CAP_PRIVILEGE_LEAK'; END IF;
  IF (SELECT max_users FROM public.beta_program_setup_snapshots WHERE program_id=program)<>20 THEN RAISE EXCEPTION 'SNAPSHOT_MUTATED'; END IF;
  RAISE NOTICE 'PASS: invite/claim/member capacity, suspension, revoke, narrowing, immutable snapshot, service-only admin';
END $test$;
ROLLBACK;
