\set ON_ERROR_STOP on
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['beta_setup_drafts','beta_operator_notes','beta_feedback','beta_operation_tasks','beta_campaigns','beta_campaign_aggregates','beta_readiness_snapshots'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||table_name)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'RLS/FORCE missing on %',table_name; END IF;
    IF has_table_privilege('anon','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'anon privilege leak on %',table_name; END IF;
    IF NOT has_table_privilege('service_role','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'service privilege missing on %',table_name; END IF;
    IF table_name<>'beta_feedback' AND has_table_privilege('authenticated','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'authenticated operation leak on %',table_name; END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated','public.beta_feedback','SELECT,INSERT') OR has_table_privilege('authenticated','public.beta_feedback','UPDATE,DELETE') THEN RAISE EXCEPTION 'feedback grant boundary invalid'; END IF;
  IF has_function_privilege('authenticated','public.admin_controlled_beta_stop(text,text,text)','EXECUTE') OR NOT has_function_privilege('service_role','public.admin_controlled_beta_stop(text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'admin stop RPC boundary invalid'; END IF;
  IF has_function_privilege('anon','public.has_active_beta_program_membership(uuid,uuid)','EXECUTE') OR NOT has_function_privilege('authenticated','public.has_active_beta_program_membership(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'membership helper boundary invalid'; END IF;
END $$;

BEGIN;
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
('31000000-0000-4000-8000-000000000001','rls-owner@example.invalid',now(),now()),
('31000000-0000-4000-8000-000000000002','rls-other@example.invalid',now(),now());
INSERT INTO public.beta_members(program_id,user_id,status,reviewed_at,reviewed_by,reason_code)
SELECT id,'31000000-0000-4000-8000-000000000001','active',now(),'test:admin','SYNTHETIC_APPROVAL' FROM public.beta_programs WHERE program_key='limited_beta_2026';
SELECT set_config('test.feedback_program_id',id::text,false) FROM public.beta_programs WHERE program_key='limited_beta_2026';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
INSERT INTO public.beta_feedback(program_id,owner_user_id,kind,description,page_path)
VALUES(current_setting('test.feedback_program_id')::uuid,'31000000-0000-4000-8000-000000000001','error','TEST own feedback','/account');
DO $$
BEGIN
  IF (SELECT count(*) FROM public.beta_feedback)<>1 THEN RAISE EXCEPTION 'owner feedback select failed'; END IF;
  IF public.has_active_beta_program_membership(
    '31000000-0000-4000-8000-000000000002',
    current_setting('test.feedback_program_id')::uuid
  ) THEN
    RAISE EXCEPTION 'membership helper disclosed another user membership';
  END IF;
  BEGIN
    INSERT INTO public.beta_feedback(program_id,owner_user_id,kind,description,page_path)
    VALUES(current_setting('test.feedback_program_id')::uuid,'31000000-0000-4000-8000-000000000002','error','TEST other feedback','/account');
    RAISE EXCEPTION 'other-user feedback accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PHASE10I_PERMISSIONS_OK' status;
