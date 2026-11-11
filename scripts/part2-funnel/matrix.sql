DO $$ DECLARE c integer; BEGIN
 ASSERT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='part2_daily_funnel')=6,'exact aggregate-only columns';
 ASSERT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.part2_daily_funnel'::regclass),'RLS';
 ASSERT NOT has_table_privilege('anon','public.part2_daily_funnel','SELECT,INSERT,UPDATE,DELETE'),'anon denied';
 ASSERT NOT has_table_privilege('authenticated','public.part2_daily_funnel','SELECT,INSERT,UPDATE,DELETE'),'authenticated denied';
 ASSERT NOT has_function_privilege('anon','public.part2_add_own_school_membership(uuid,integer,jsonb,boolean,text,text)','EXECUTE'),'anonymous owner wrapper denied';
 ASSERT NOT has_function_privilege('authenticated','public.part2_record_funnel_event(text,text,text,uuid)','EXECUTE'),'forged trusted events denied';
 ASSERT NOT has_function_privilege('authenticated','public.part2_get_funnel_snapshot()','EXECUTE'),'non-admin snapshot denied';
 ASSERT has_function_privilege('service_role','public.part2_get_funnel_snapshot()','EXECUTE'),'server snapshot';
END $$;
SET ROLE service_role;
SELECT public.part2_record_funnel_event('landing_view','threads','threads');
SELECT public.part2_record_funnel_event('landing_view','threads','threads');
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 AND sum(event_count)=2 FROM public.part2_daily_funnel),'NULL bucket single atomic upsert';
 ASSERT NOT public.part2_record_funnel_event('school_result_selected','direct','external','00000000-0000-4000-8000-000000000099'),'unknown school rejected';
 ASSERT NOT public.part2_record_funnel_event('landing_view','bad','external',NULL),'bad source rejected';
 ASSERT NOT public.part2_record_funnel_event('landing_view','direct','external','00000000-0000-4000-8000-000000000011'),'wrong dimensions rejected';
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
SELECT public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000011',2010,'[]',true,'threads','threads');
SELECT public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000012',2010,'[]',true,'threads','threads');
RESET ROLE;
DO $$ BEGIN ASSERT (SELECT sum(event_count) FROM public.part2_daily_funnel WHERE event_key='signup_completed')=1,'first school only'; END $$;
DELETE FROM public.fixture_memberships WHERE owner_user_id='00000000-0000-4000-8000-000000000001';
SELECT public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000011',2010,'[]',true,'threads','threads');
DO $$ BEGIN
 ASSERT (SELECT sum(event_count) FROM public.part2_daily_funnel WHERE event_key='signup_completed')=1,'no recount after recreation';
 BEGIN
  PERFORM public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000011',1900,'[]',true,'threads','threads');
  RAISE EXCEPTION 'unexpected owner success';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'OWNER_REJECTED' THEN RAISE; END IF; END;
END $$;
CREATE FUNCTION public.fixture_reject_stats() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_STATS_FAILURE'; END $$;
CREATE TRIGGER fixture_stats_failure AFTER INSERT OR UPDATE ON public.part2_daily_funnel FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_stats();
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000011',2010,'[]',true,'instagram','instagram');
DO $$ BEGIN
 ASSERT EXISTS(SELECT 1 FROM public.fixture_memberships WHERE owner_user_id=auth.uid()),'profile save survives stats failure';
 ASSERT EXISTS(SELECT 1 FROM public.adult_eligibility_records WHERE user_id=auth.uid() AND school_membership_first_created_at IS NOT NULL),'milestone survives stats failure';
 ASSERT (SELECT sum(event_count) FROM public.part2_daily_funnel WHERE event_key='signup_completed')=1,'failed stats subtransaction rolled back';
END $$;
DROP TRIGGER fixture_stats_failure ON public.part2_daily_funnel;
SELECT public.part2_add_own_school_membership('00000000-0000-4000-8000-000000000012',2010,'[]',true,'instagram','instagram');
DO $$ BEGIN ASSERT (SELECT sum(event_count) FROM public.part2_daily_funnel WHERE event_key='signup_completed')=1,'no identity retry queue'; END $$;
SELECT 'PART2_DATABASE_MATRIX_PASS';
