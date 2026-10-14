BEGIN;
SELECT public.admin_set_public_account_launch_state('internal_test','LOCAL_TEST','local-test');
INSERT INTO auth.users(id) VALUES ('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002'),('a1000000-0000-4000-8000-000000000007');
SELECT public.admin_complete_own_adult_eligibility(id,'phase10b-2026-07-28') FROM auth.users;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SELECT public.record_own_required_consents('phase10b-2026-07-28');
DO $$ DECLARE result jsonb; role_name text; privilege_name text; BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.signup_attribution'::regclass)
    OR EXISTS(SELECT 1 FROM pg_policies WHERE tablename='signup_attribution')
    OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='signup_attribution'
      AND column_name NOT IN ('created_on','source','medium','campaign','content','count'))
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='signup_attribution') <> 6
    OR to_regclass('public.signup_attribution_id_seq') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.signup_attribution'::regclass AND contype='f')
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
  IF result->>'attribution_recorded' <> 'true' OR (SELECT sum(count) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'initial insert failed'; END IF;
  result := public.upsert_own_private_profile('Local Edit',NULL,NULL,
    'a1000000-0000-4000-8000-000000000001','{"source":"instagram"}');
  IF result->>'attribution_recorded' <> 'false' OR (SELECT sum(count) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'update duplicate'; END IF;
  PERFORM public.delete_own_private_profile();
  result := public.upsert_own_private_profile('Local Recreate',NULL,NULL,
    'a1000000-0000-4000-8000-000000000001','{"source":"instagram"}');
  IF result->>'attribution_recorded' <> 'false' OR (SELECT sum(count) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'recreation duplicate'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.signup_attribution WHERE source='threads' AND medium='post_body'
    AND created_on=(now() AT TIME ZONE 'Asia/Seoul')::date)
  THEN RAISE EXCEPTION 'safe fields/date mismatch'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000007',true);
SELECT public.record_own_required_consents('phase10b-2026-07-28');
CREATE FUNCTION public.attribution_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_FAILURE'; END $$;
CREATE TRIGGER attribution_test_failure AFTER INSERT OR UPDATE ON public.signup_attribution FOR EACH ROW EXECUTE FUNCTION public.attribution_test_failure();
DO $$ DECLARE result jsonb; BEGIN
  result := public.upsert_own_private_profile('Local Failure',NULL,NULL,
    'a1000000-0000-4000-8000-000000000007','{"source":"failure_test"}');
  IF result->>'attribution_recorded' <> 'false'
    OR NOT EXISTS(SELECT 1 FROM public.private_profiles WHERE owner_user_id='a1000000-0000-4000-8000-000000000007')
    OR NOT EXISTS(SELECT 1 FROM public.adult_eligibility_records WHERE user_id='a1000000-0000-4000-8000-000000000007' AND private_profile_first_created_at IS NOT NULL)
    OR (SELECT sum(count) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'statistics failure blocked owner save or leaked count'; END IF;
END $$;
DROP TRIGGER attribution_test_failure ON public.signup_attribution;
DO $$ DECLARE result jsonb; BEGIN
  result := public.upsert_own_private_profile('After Failure',NULL,NULL,
    'a1000000-0000-4000-8000-000000000007','{"source":"failure_test"}');
  IF result->>'attribution_recorded' <> 'false' OR (SELECT sum(count) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'late retry counted existing profile'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
SELECT public.record_own_required_consents('phase10b-2026-07-28');
-- A genuine owner/profile validation failure must still fail without a statistic.
DO $$ BEGIN
  BEGIN
    PERFORM public.upsert_own_private_profile('',NULL,NULL,
      'a1000000-0000-4000-8000-000000000002','{"source":"owner_failure"}');
    RAISE EXCEPTION 'invalid profile unexpectedly saved';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'INVALID_PRIVATE_PROFILE' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM public.private_profiles WHERE owner_user_id='a1000000-0000-4000-8000-000000000002')
    OR (SELECT sum(count) FROM public.signup_attribution) <> 1
  THEN RAISE EXCEPTION 'owner failure crossed optional-statistics boundary'; END IF;
END $$;
SET LOCAL ROLE service_role;
SELECT public.upsert_own_private_profile('Local Unknown',NULL,NULL,
  'a1000000-0000-4000-8000-000000000002','{"source":"bad value"}');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.signup_attribution) <> 2
    OR (SELECT count(*) FROM public.signup_attribution WHERE source='unknown') <> 1
  THEN RAISE EXCEPTION 'unknown fallback/rollback failed'; END IF;
END $$;
-- Distinct new accounts must share one fully populated or NULL-code bucket.
INSERT INTO auth.users(id) VALUES
('a1000000-0000-4000-8000-000000000003'),('a1000000-0000-4000-8000-000000000004'),
('a1000000-0000-4000-8000-000000000005'),('a1000000-0000-4000-8000-000000000006');
SELECT public.admin_complete_own_adult_eligibility(id,'phase10b-2026-07-28')
FROM auth.users WHERE id::text IN ('a1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000004',
'a1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000006');
DO $$ DECLARE actor uuid; result jsonb; BEGIN
  FOREACH actor IN ARRAY ARRAY[
    'a1000000-0000-4000-8000-000000000003'::uuid,'a1000000-0000-4000-8000-000000000004'::uuid,
    'a1000000-0000-4000-8000-000000000005'::uuid,'a1000000-0000-4000-8000-000000000006'::uuid] LOOP
    PERFORM set_config('request.jwt.claim.sub',actor::text,true);
    PERFORM public.record_own_required_consents('phase10b-2026-07-28');
    result := public.upsert_own_private_profile('Bucket Test',NULL,NULL,actor,
      CASE WHEN actor::text IN ('a1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000004')
        THEN '{"source":"threads","medium":"post_body","campaign":"devlog","content":"1020-08"}'::jsonb
        ELSE '{"source":"direct"}'::jsonb END);
    IF result->>'attribution_recorded' <> 'true' THEN RAISE EXCEPTION 'new signup not recorded'; END IF;
  END LOOP;
  IF (SELECT count FROM public.signup_attribution WHERE source='threads') <> 3
    OR (SELECT count(*) FROM public.signup_attribution WHERE source='direct') <> 1
    OR (SELECT count FROM public.signup_attribution WHERE source='direct') <> 2
    OR (SELECT sum(count) FROM public.signup_attribution) <> 6
  THEN RAISE EXCEPTION 'daily upsert / NULL equality failed'; END IF;
END $$;
-- Each dimension participates in uniqueness; zero counts and invalid codes fail.
INSERT INTO public.signup_attribution(created_on,source,medium,campaign,content) VALUES
((now() AT TIME ZONE 'Asia/Seoul')::date - 1,'threads','post_body','devlog','1020-08'),
((now() AT TIME ZONE 'Asia/Seoul')::date,'instagram','post_body','devlog','1020-08'),
((now() AT TIME ZONE 'Asia/Seoul')::date,'threads','bio','devlog','1020-08'),
((now() AT TIME ZONE 'Asia/Seoul')::date,'threads','post_body','launch','1020-08'),
((now() AT TIME ZONE 'Asia/Seoul')::date,'threads','post_body','devlog','1020-09');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.signup_attribution) <> 8 THEN RAISE EXCEPTION 'dimension collision'; END IF;
  BEGIN
    INSERT INTO public.signup_attribution(source,count) VALUES ('invalid_zero',0);
    RAISE EXCEPTION 'zero accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.signup_attribution(source) VALUES ('a bad value');
    RAISE EXCEPTION 'invalid code accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
