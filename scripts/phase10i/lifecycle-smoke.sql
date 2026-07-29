\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
('30000000-0000-4000-8000-000000000001','test-beta-user-a@example.invalid',now(),now()),
('30000000-0000-4000-8000-000000000002','test-beta-user-b@example.invalid',now(),now());

DO $$
DECLARE
  base_program uuid; draft_id uuid; other_draft_id uuid; paused_program uuid; retried_program uuid;
  task_id uuid; note_id uuid; campaign_id uuid; readiness_id uuid; pending_member uuid;
  audit_count integer; invites_before integer; flags_before integer; programs_before integer; snapshots_before integer;
  required_stops jsonb:=jsonb_build_object('PRIVACY_EXPOSURE',true,'RLS_FAILURE',true,'HEALTH_FAILURE',true);
  invite_contract jsonb:=jsonb_build_object('maxUsesPerInvite',1,'expiresInDays',7);
BEGIN
  SELECT id INTO base_program FROM public.beta_programs WHERE program_key='limited_beta_2026';
  INSERT INTO public.beta_members(program_id,user_id,status,reviewed_at,reviewed_by,reason_code)
  VALUES(base_program,'30000000-0000-4000-8000-000000000001','active',now(),'test:admin','SYNTHETIC_APPROVAL');
  SELECT count(*) INTO invites_before FROM public.beta_invites;
  SELECT count(*) INTO programs_before FROM public.beta_programs;
  SELECT count(*) INTO snapshots_before FROM public.beta_program_setup_snapshots;

  draft_id:=public.admin_save_beta_setup(NULL,'synthetic_ops_original','TEST Controlled Beta',now(),now()+interval '7 days',1,'adult graduates',ARRAY['account_registration','private_profile'],invite_contract,true,required_stops,'TEST operator memo','validated','test:admin');
  PERFORM public.admin_save_beta_setup(draft_id,'synthetic_ops_renamed','TEST Controlled Beta',now(),now()+interval '7 days',1,'adult graduates',ARRAY['account_registration','private_profile'],invite_contract,true,required_stops,'TEST operator memo','validated','test:admin');
  IF (SELECT draft_key FROM public.beta_setup_drafts WHERE id=draft_id)<>'synthetic_ops_renamed' THEN RAISE EXCEPTION 'draft key change was not persisted'; END IF;

  -- Saving an unchanged key is a supported regression path.
  PERFORM public.admin_save_beta_setup(draft_id,'synthetic_ops_renamed','TEST Controlled Beta',now(),now()+interval '7 days',1,'adult graduates',ARRAY['account_registration','private_profile'],invite_contract,true,required_stops,'TEST operator memo','validated','test:admin');
  IF (SELECT draft_key FROM public.beta_setup_drafts WHERE id=draft_id)<>'synthetic_ops_renamed' THEN RAISE EXCEPTION 'unchanged draft key regressed'; END IF;

  other_draft_id:=public.admin_save_beta_setup(NULL,'synthetic_ops_other','TEST Other Draft',NULL,NULL,10,'adult graduates',ARRAY['account_registration'],invite_contract,true,required_stops,'','draft','test:admin');
  BEGIN
    PERFORM public.admin_save_beta_setup(draft_id,'synthetic_ops_other','TEST Controlled Beta',now(),now()+interval '7 days',1,'adult graduates',ARRAY['account_registration','private_profile'],invite_contract,true,required_stops,'','validated','test:admin');
    RAISE EXCEPTION 'duplicate draft key accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DRAFT_KEY_CONFLICT' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'limited_beta_2026','TEST Program Conflict',NULL,NULL,10,'adult graduates',ARRAY['account_registration'],invite_contract,true,required_stops,'','draft','test:admin');
    RAISE EXCEPTION 'existing program key accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_KEY_CONFLICT' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'missing_stops_10i','TEST Missing Stops',NULL,NULL,10,'adult graduates',ARRAY['account_registration'],invite_contract,true,jsonb_build_object('RLS_FAILURE',true),'','draft','test:admin');
    RAISE EXCEPTION 'missing required stop conditions accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REQUIRED_STOP_CONDITION_MISSING' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_save_beta_setup(NULL,'missing_invite_policy_10i','TEST Missing Invite Policy',NULL,NULL,10,'adult graduates',ARRAY['account_registration'],'{}'::jsonb,true,required_stops,'','draft','test:admin');
    RAISE EXCEPTION 'missing invite policy fields accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_INVITE_POLICY' THEN RAISE; END IF; END;

  paused_program:=public.admin_activate_beta_setup(draft_id,'test:admin');
  retried_program:=public.admin_activate_beta_setup(draft_id,'test:admin');
  IF retried_program<>paused_program THEN RAISE EXCEPTION 'activation retry returned a different program'; END IF;
  IF (SELECT count(*) FROM public.beta_programs)<>programs_before+1 THEN RAISE EXCEPTION 'activation retry created duplicate program'; END IF;
  IF (SELECT count(*) FROM public.beta_program_setup_snapshots)<>snapshots_before+1 THEN RAISE EXCEPTION 'activation retry created duplicate snapshot'; END IF;
  IF (SELECT status FROM public.beta_programs WHERE id=paused_program)<>'paused' THEN RAISE EXCEPTION 'activated program was not paused'; END IF;
  IF (SELECT count(*) FROM public.beta_invites)<>invites_before THEN RAISE EXCEPTION 'activation automatically created an invite'; END IF;
  SELECT count(*) INTO flags_before FROM public.beta_feature_flags WHERE program_id=paused_program;
  IF flags_before<>0 THEN RAISE EXCEPTION 'activation automatically created feature flags'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.beta_program_setup_snapshots snapshot
    WHERE snapshot.program_id=paused_program AND snapshot.source_draft_id=draft_id
      AND snapshot.max_users=1 AND snapshot.target_scope='adult graduates'
      AND snapshot.enabled_features=ARRAY['account_registration','private_profile']::text[]
      AND snapshot.invite_policy=invite_contract AND snapshot.approval_waitlist_enabled=true
      AND snapshot.stop_conditions=required_stops
  ) THEN RAISE EXCEPTION 'draft contract was not copied exactly to snapshot'; END IF;
  BEGIN
    UPDATE public.beta_program_setup_snapshots SET max_users=2 WHERE program_id=paused_program;
    RAISE EXCEPTION 'immutable snapshot accepted update';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_SETUP_SNAPSHOT_IMMUTABLE' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_issue_beta_invite(paused_program,repeat('a',64),NULL,NULL,2,now()+interval '1 day','test:admin');
    RAISE EXCEPTION 'invite exceeded setup max uses';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVITE_MAX_USES_EXCEEDS_SETUP' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_set_beta_feature(paused_program,NULL,'people_search',true,'TEST_FEATURE','test:admin');
    RAISE EXCEPTION 'feature outside setup was enabled';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FEATURE_NOT_IN_SETUP' THEN RAISE; END IF; END;

  INSERT INTO public.beta_members(program_id,user_id,status,reviewed_at,reviewed_by,reason_code)
  VALUES(paused_program,'30000000-0000-4000-8000-000000000001','active',now(),'test:admin','TEST_CAPACITY');
  INSERT INTO public.beta_members(program_id,user_id,status,reason_code)
  VALUES(paused_program,'30000000-0000-4000-8000-000000000002','pending_review','TEST_PENDING') RETURNING id INTO pending_member;
  BEGIN
    PERFORM public.admin_review_beta_member(pending_member,'active','TEST_APPROVED','test:admin');
    RAISE EXCEPTION 'program capacity was exceeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROGRAM_FULL' THEN RAISE; END IF; END;

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
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OPERATOR_DECISION_REQUIRED' THEN RAISE; END IF; END;
  INSERT INTO public.beta_feedback(program_id,owner_user_id,kind,description,page_path,coarse_browser,coarse_device)
  VALUES(base_program,'30000000-0000-4000-8000-000000000001','error','TEST button remains disabled','/account','chrome','desktop');
  PERFORM public.admin_controlled_beta_stop('people_search','TEST_EMERGENCY','test:admin');
  IF EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id IS NULL AND user_id IS NULL AND feature_key='people_search' AND enabled) THEN RAISE EXCEPTION 'emergency stop failed'; END IF;
  SELECT count(*) INTO audit_count FROM public.beta_audit_logs WHERE actor_reference='test:admin';
  IF audit_count<10 THEN RAISE EXCEPTION 'atomic admin audit missing'; END IF;
  IF task_id IS NULL OR note_id IS NULL OR campaign_id IS NULL OR readiness_id IS NULL OR other_draft_id IS NULL THEN RAISE EXCEPTION 'operations lifecycle incomplete'; END IF;
END $$;
ROLLBACK;
SELECT 'PHASE10I_LIFECYCLE_OK' status;
