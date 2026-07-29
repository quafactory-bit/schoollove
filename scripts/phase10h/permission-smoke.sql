\set ON_ERROR_STOP on
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['beta_onboarding_progress','beta_onboarding_stage_events','beta_growth_daily_metrics'] LOOP
    IF has_table_privilege('anon','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'anon privilege leak on %',table_name; END IF;
    IF has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'authenticated mutation leak on %',table_name; END IF;
    IF NOT has_table_privilege('service_role','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'service role missing on %',table_name; END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated','public.beta_onboarding_progress','SELECT') THEN RAISE EXCEPTION 'owner progress select missing'; END IF;
  IF has_table_privilege('authenticated','public.beta_onboarding_stage_events','SELECT') OR has_table_privilege('authenticated','public.beta_growth_daily_metrics','SELECT')
    THEN RAISE EXCEPTION 'aggregate internals exposed'; END IF;
  IF has_function_privilege('anon','public.sync_own_beta_onboarding_state(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'anon sync access leak'; END IF;
  IF NOT has_function_privilege('authenticated','public.sync_own_beta_onboarding_state(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'owner sync access missing'; END IF;
  IF has_function_privilege('authenticated','public.admin_get_limited_launch_funnel(date,date)','EXECUTE') OR has_function_privilege('authenticated','public.run_phase10h_maintenance(text,timestamptz)','EXECUTE')
    THEN RAISE EXCEPTION 'privileged onboarding RPC exposed'; END IF;
  IF NOT has_function_privilege('service_role','public.admin_get_limited_launch_funnel(date,date)','EXECUTE') OR NOT has_function_privilege('service_role','public.run_phase10h_maintenance(text,timestamptz)','EXECUTE')
    THEN RAISE EXCEPTION 'service onboarding RPC missing'; END IF;
END $$;
SELECT 'PHASE10H_PERMISSIONS_OK' AS status;

BEGIN;
INSERT INTO auth.users(id,email,created_at,updated_at) VALUES
  ('21000000-0000-4000-8000-000000000001','rls-owner@example.invalid',now(),now()),
  ('21000000-0000-4000-8000-000000000002','rls-other@example.invalid',now(),now());
INSERT INTO public.beta_onboarding_progress(program_id,user_id,stage_key)
SELECT p.id,u.id,'adult_required' FROM public.beta_programs p CROSS JOIN auth.users u
WHERE p.program_key='limited_beta_2026' AND u.id IN (
  '21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','21000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$
BEGIN
  IF auth.uid()<>'21000000-0000-4000-8000-000000000001'::uuid
    THEN RAISE EXCEPTION 'synthetic auth.uid was not configured'; END IF;
  IF (SELECT count(*) FROM public.beta_onboarding_progress)<>1 OR EXISTS(
    SELECT 1 FROM public.beta_onboarding_progress WHERE user_id<>'21000000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'owner onboarding RLS leaked another user'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PHASE10H_OWNER_RLS_OK' AS status;
