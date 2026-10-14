BEGIN;
SELECT public.admin_set_public_account_launch_state('internal_test','LOCAL_TEST','local-test');
INSERT INTO auth.users(id) VALUES ('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002');
SELECT public.admin_complete_own_adult_eligibility(id,'phase10b-2026-07-28') FROM auth.users;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT public.record_own_required_consents('phase10b-2026-07-28');
DO $$ DECLARE result jsonb; role_name text; privilege_name text; BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.signup_attribution'::regclass)
    OR EXISTS(SELECT 1 FROM pg_policies WHERE tablename='signup_attribution')
    OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='signup_attribution'
      AND column_name NOT IN ('id','created_on','source','medium','campaign','content','landing_path'))
  THEN RAISE EXCEPTION 'schema privacy boundary failed'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege(role_name,'public.signup_attribution',privilege_name)
      THEN RAISE EXCEPTION 'client grant open'; END IF;
    END LOOP;
    IF has_function_privilege(role_name,'public.upsert_own_private_profile(text,text,text,uuid,jsonb)','EXECUTE')
    THEN RAISE EXCEPTION 'wrapper grant open'; END IF;
  END LOOP;
  result := public.upsert_own_private_profile('Local Test',NULL,NULL,
    'a1000000-0000-4000-8000-000000000001',
    '{"source":"threads","medium":"post_body","campaign":"devlog","content":"1020-08","landing_path":"/"}');
  IF result->>'attribution_recorded' <> 'true' OR (SELECT count(*) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'initial insert failed'; END IF;
  result := public.upsert_own_private_profile('Local Edit',NULL,NULL,
    'a1000000-0000-4000-8000-000000000001','{"source":"instagram"}');
  IF result->>'attribution_recorded' <> 'false' OR (SELECT count(*) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'update duplicate'; END IF;
  PERFORM public.delete_own_private_profile();
  result := public.upsert_own_private_profile('Local Recreate',NULL,NULL,
    'a1000000-0000-4000-8000-000000000001','{"source":"instagram"}');
  IF result->>'attribution_recorded' <> 'false' OR (SELECT count(*) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'recreation duplicate'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.signup_attribution WHERE source='threads' AND medium='post_body'
    AND created_on=(now() AT TIME ZONE 'Asia/Seoul')::date)
  THEN RAISE EXCEPTION 'safe fields/date mismatch'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
SELECT public.record_own_required_consents('phase10b-2026-07-28');
CREATE FUNCTION public.attribution_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_FAILURE'; END $$;
CREATE TRIGGER attribution_test_failure BEFORE INSERT ON public.signup_attribution FOR EACH ROW EXECUTE FUNCTION public.attribution_test_failure();
DO $$ BEGIN
  BEGIN
    PERFORM public.upsert_own_private_profile('Local Failure',NULL,NULL,
      'a1000000-0000-4000-8000-000000000002',NULL);
    RAISE EXCEPTION 'failure not raised';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'TEST_FAILURE' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.private_profiles WHERE owner_user_id='a1000000-0000-4000-8000-000000000002')
  THEN RAISE EXCEPTION 'profile not rolled back'; END IF;
END $$;
DROP TRIGGER attribution_test_failure ON public.signup_attribution;
SET LOCAL ROLE service_role;
SELECT public.upsert_own_private_profile('Local Unknown',NULL,NULL,
  'a1000000-0000-4000-8000-000000000002','{"source":"bad value"}');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.signup_attribution) <> 2
    OR (SELECT count(*) FROM public.signup_attribution WHERE source='unknown') <> 1
  THEN RAISE EXCEPTION 'unknown fallback/rollback failed'; END IF;
END $$;
ROLLBACK;
