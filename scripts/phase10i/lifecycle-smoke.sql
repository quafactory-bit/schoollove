\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
('30000000-0000-4000-8000-000000000001','test-beta-user-a@example.invalid',now(),now()),
('30000000-0000-4000-8000-000000000002','test-beta-user-b@example.invalid',now(),now());

DO $$
DECLARE base_program uuid; draft_id uuid; paused_program uuid; task_id uuid; note_id uuid; campaign_id uuid; readiness_id uuid; audit_count integer; invites_before integer;
BEGIN
  SELECT id INTO base_program FROM public.beta_programs WHERE program_key='limited_beta_2026';
  INSERT INTO public.beta_members(program_id,user_id,status,reviewed_at,reviewed_by,reason_code)
  VALUES(base_program,'30000000-0000-4000-8000-000000000001','active',now(),'test:admin','SYNTHETIC_APPROVAL');
  SELECT count(*) INTO invites_before FROM public.beta_invites;
  draft_id:=public.admin_save_beta_setup(NULL,'synthetic_ops_10i','TEST Controlled Beta',now(),now()+interval '7 days',20,'adult graduates',ARRAY['account_registration','private_profile'],jsonb_build_object('maxUsesPerInvite',1,'expiresInDays',7),true,jsonb_build_object('RLS_FAILURE',true),'TEST operator memo','validated','test:admin');
  paused_program:=public.admin_activate_beta_setup(draft_id,'test:admin');
  IF (SELECT status FROM public.beta_programs WHERE id=paused_program)<>'paused' OR (SELECT count(*) FROM public.beta_invites)<>invites_before THEN RAISE EXCEPTION 'setup activation was not paused and invite-free'; END IF;
  task_id:=public.admin_create_beta_task(base_program,'feedback','high','TEST safe task',now()+interval '1 day','test:admin');
  PERFORM public.admin_update_beta_task(task_id,'resolved','high','test:admin','TEST_RESOLVED','test:admin');
  note_id:=public.admin_create_beta_note(base_program,'program',base_program,'TEST safe operator note','test:admin');
  campaign_id:=public.admin_create_beta_campaign(base_program,NULL,'synthetic_school_10i','instagram',NULL,'TEST next action','test:admin');
  INSERT INTO public.beta_campaign_aggregates(campaign_id,metric_date,metric_key,segment_key,metric_count,masked) VALUES(campaign_id,current_date,'approved','all',NULL,true);
  BEGIN
    INSERT INTO public.beta_campaign_aggregates(campaign_id,metric_date,metric_key,segment_key,metric_count,masked) VALUES(campaign_id,current_date,'accepted','unsafe',2,false);
    RAISE EXCEPTION 'small exact aggregate accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  readiness_id:=public.admin_record_beta_readiness(base_program,'limited_beta',jsonb_build_object('health',true,'rls',true),ARRAY[]::text[],true,'test:admin');
  BEGIN
    PERFORM public.admin_record_beta_readiness(base_program,'launch_candidate','{}'::jsonb,ARRAY[]::text[],false,'test:admin');
    RAISE EXCEPTION 'launch candidate accepted without operator decision';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'OPERATOR_DECISION_REQUIRED' THEN RAISE; END IF;
  END;
  INSERT INTO public.beta_feedback(program_id,owner_user_id,kind,description,page_path,coarse_browser,coarse_device)
  VALUES(base_program,'30000000-0000-4000-8000-000000000001','error','TEST button remains disabled','/account','chrome','desktop');
  PERFORM public.admin_controlled_beta_stop('people_search','TEST_EMERGENCY','test:admin');
  IF EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id IS NULL AND user_id IS NULL AND feature_key='people_search' AND enabled) THEN RAISE EXCEPTION 'emergency stop failed'; END IF;
  SELECT count(*) INTO audit_count FROM public.beta_audit_logs WHERE actor_reference='test:admin';
  IF audit_count<7 THEN RAISE EXCEPTION 'atomic admin audit missing'; END IF;
  IF task_id IS NULL OR note_id IS NULL OR campaign_id IS NULL OR readiness_id IS NULL THEN RAISE EXCEPTION 'operations lifecycle incomplete'; END IF;
END $$;
ROLLBACK;
SELECT 'PHASE10I_LIFECYCLE_OK' status;
