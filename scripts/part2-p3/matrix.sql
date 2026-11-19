-- Part 2 P3 assertions on a disposable DB. Any failure raises and stops psql.
\set u1 '''c0000000-0000-4000-8000-000000000001'''
\set u2 '''c0000000-0000-4000-8000-000000000002'''
\set u4 '''c0000000-0000-4000-8000-000000000004'''
\set u5 '''c0000000-0000-4000-8000-000000000005'''
\set s1 '''a0000000-0000-4000-8000-000000000001'''

-- 1) Tables: RLS forced, no client privileges even with Supabase-like default grants.
DO $$ BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.profile_status_tags'::regclass) THEN RAISE EXCEPTION 'tags RLS'; END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.summons'::regclass) THEN RAISE EXCEPTION 'summons RLS'; END IF;
  IF has_table_privilege('anon','public.profile_status_tags','SELECT') OR has_table_privilege('authenticated','public.profile_status_tags','SELECT')
     OR has_table_privilege('authenticated','public.profile_status_tags','INSERT') OR has_table_privilege('anon','public.summons','SELECT')
     OR has_table_privilege('authenticated','public.summons','SELECT') OR has_table_privilege('authenticated','public.summons','UPDATE') THEN
    RAISE EXCEPTION 'client table privilege leaked';
  END IF;
  IF has_function_privilege('anon','public.part2_request_summons_takedown(text)','EXECUTE') OR has_function_privilege('authenticated','public.part2_report_summons(text)','EXECUTE')
     OR has_function_privilege('anon','public.part2_admin_list_summons()','EXECUTE') OR has_function_privilege('authenticated','public.part2_admin_hide_summons(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.part2_create_summons(uuid,integer,text)','EXECUTE') OR has_function_privilege('anon','public.part2_set_own_status_tags(text[],text,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'function privilege leaked';
  END IF;
END $$;

-- 2) Status tags: owner only, validation, public preview respects the switch.
SET ROLE authenticated;
SELECT set_config('test.uid', :u1, false);
SELECT public.part2_set_own_status_tags(ARRAY['직장인','육아 중'], ' 반가워! ', false);
SELECT set_config('test.uid', :u2, false);
SELECT public.part2_set_own_status_tags(ARRAY['자영업'], '잘 지내?', true);
DO $$ BEGIN
  BEGIN PERFORM public.part2_set_own_status_tags(ARRAY['학생'], NULL, false); RAISE EXCEPTION 'bad tag accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.part2_set_own_status_tags(ARRAY['직장인'], '카톡 abc', false); RAISE EXCEPTION 'contact note accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.part2_set_own_status_tags(ARRAY['직장인','자영업','프리랜서','쉬는 중'], NULL, false); RAISE EXCEPTION '4 tags accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM 1 FROM public.profile_status_tags; RAISE EXCEPTION 'direct table read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (public.part2_get_own_status_tags()->>'note') <> '잘 지내?' THEN RAISE EXCEPTION 'own read'; END IF;
END $$;
SELECT set_config('test.uid', :u5, false);
DO $$ BEGIN
  BEGIN PERFORM public.part2_set_own_status_tags(ARRAY['직장인'], NULL, false); RAISE EXCEPTION 'non-adult saved'; EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ACCOUNT_ACCESS_REQUIRED' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SET ROLE anon;
SELECT set_config('test.uid', '', false);
DO $$ DECLARE r record; seen int := 0; BEGIN
  FOR r IN SELECT * FROM public.part2_year_masked_preview_v2('a0000000-0000-4000-8000-000000000001', 2005) LOOP
    seen := seen + 1;
    IF r.masked_name IN ('김민수','이준','남궁민수') THEN RAISE EXCEPTION 'raw name'; END IF;
    IF r.masked_name = '김O수' AND (cardinality(r.tags) <> 0 OR r.note IS NOT NULL) THEN RAISE EXCEPTION 'hidden tags shown'; END IF;
    IF r.masked_name = '이O' AND (r.tags <> ARRAY['자영업'] OR r.note <> '잘 지내?') THEN RAISE EXCEPTION 'shown tags missing'; END IF;
  END LOOP;
  IF seen <> 3 THEN RAISE EXCEPTION 'preview count %', seen; END IF;
  BEGIN PERFORM public.part2_get_year_chalkboard('a0000000-0000-4000-8000-000000000001', 2005); RAISE EXCEPTION 'anon chalkboard'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- 3) Chalkboard: members only, locked below 3.
SET ROLE authenticated;
SELECT set_config('test.uid', :u1, false);
DO $$ DECLARE b jsonb; BEGIN
  b := public.part2_get_year_chalkboard('a0000000-0000-4000-8000-000000000001', 2005);
  IF (b->>'locked')::boolean OR (b->>'members')::int <> 3 OR jsonb_array_length(b->'entries') <> 2 THEN RAISE EXCEPTION 'open board %', b; END IF;
  BEGIN PERFORM public.part2_get_year_chalkboard('a0000000-0000-4000-8000-000000000002', 2010); RAISE EXCEPTION 'other school board'; EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SCHOOL_ROSTER_ACCESS_REQUIRED' THEN RAISE; END IF; END;
END $$;
SELECT set_config('test.uid', :u4, false);
DO $$ DECLARE b jsonb; BEGIN
  b := public.part2_get_year_chalkboard('a0000000-0000-4000-8000-000000000002', 2010);
  IF NOT (b->>'locked')::boolean OR (b->>'members')::int <> 1 OR b ? 'entries' THEN RAISE EXCEPTION 'locked board %', b; END IF;
END $$;

-- 4) Summons: same school·year, name rules, 3 per day.
SELECT set_config('test.uid', :u1, false);
DO $$ DECLARE c text; n int; BEGIN
  BEGIN PERFORM public.part2_create_summons('a0000000-0000-4000-8000-000000000002', 2010, '김민수'); RAISE EXCEPTION 'other school'; EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SAME_SCHOOL_YEAR_REQUIRED' THEN RAISE; END IF; END;
  BEGIN PERFORM public.part2_create_summons('a0000000-0000-4000-8000-000000000001', 2006, '김민수'); RAISE EXCEPTION 'other year'; EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SAME_SCHOOL_YEAR_REQUIRED' THEN RAISE; END IF; END;
  FOREACH c IN ARRAY ARRAY['고딩 김민수','010','a@b','씨발놈','김','김민수김민수김민수김민','바보 철수'] LOOP
    BEGIN PERFORM public.part2_create_summons('a0000000-0000-4000-8000-000000000001', 2005, c); RAISE EXCEPTION 'name accepted: %', c; EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'SUMMONS_NAME_REJECTED' THEN RAISE; END IF; END;
  END LOOP;
  FOR n IN 1..3 LOOP c := public.part2_create_summons('a0000000-0000-4000-8000-000000000001', 2005, '홍길동'); IF c !~ '^[a-f0-9]{12}$' THEN RAISE EXCEPTION 'code %', c; END IF; END LOOP;
  BEGIN PERFORM public.part2_create_summons('a0000000-0000-4000-8000-000000000001', 2005, '홍길동'); RAISE EXCEPTION '4th accepted'; EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'SUMMONS_DAILY_LIMIT' THEN RAISE; END IF; END;
  IF jsonb_array_length(public.part2_list_own_summons()) <> 3 THEN RAISE EXCEPTION 'own list'; END IF;
  BEGIN PERFORM 1 FROM public.summons; RAISE EXCEPTION 'direct summons read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- another member cannot list or hide u1's summons
SELECT set_config('test.uid', :u2, false);
DO $$ DECLARE c text; BEGIN
  IF jsonb_array_length(public.part2_list_own_summons()) <> 0 THEN RAISE EXCEPTION 'foreign list'; END IF;
END $$;
RESET ROLE;

-- 5) Public card, takedown (server only), report threshold, deletion hides, admin.
DO $$ DECLARE codes text[]; r record; BEGIN
  SELECT array_agg(share_code ORDER BY created_at) INTO codes FROM public.summons;
  SET LOCAL ROLE anon;
  SELECT * INTO r FROM public.part2_get_public_summons(codes[1]);
  IF r.target_name <> '홍길동' OR r.school_name <> '서울서초고등학교' OR r.graduation_year <> 2005 THEN RAISE EXCEPTION 'public card %', r; END IF;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  IF NOT public.part2_request_summons_takedown(codes[1]) THEN RAISE EXCEPTION 'takedown'; END IF;
  IF public.part2_request_summons_takedown(codes[1]) THEN RAISE EXCEPTION 'double takedown'; END IF;
  PERFORM public.part2_report_summons(codes[2]); PERFORM public.part2_report_summons(codes[2]);
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.part2_get_public_summons(codes[2])) THEN RAISE EXCEPTION 'hidden after 2 reports'; END IF;
  SET LOCAL ROLE service_role;
  PERFORM public.part2_report_summons(codes[2]);
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.part2_get_public_summons(codes[1])) OR EXISTS (SELECT 1 FROM public.part2_get_public_summons(codes[2])) THEN RAISE EXCEPTION 'hidden card visible'; END IF;
  IF (SELECT hidden_reason FROM public.summons WHERE share_code=codes[1]) <> 'self_request' OR (SELECT hidden_reason FROM public.summons WHERE share_code=codes[2]) <> 'report' THEN RAISE EXCEPTION 'reasons'; END IF;
  INSERT INTO public.account_deletion_requests VALUES ('c0000000-0000-4000-8000-000000000001','pending');
  IF EXISTS (SELECT 1 FROM public.part2_get_public_summons(codes[3])) THEN RAISE EXCEPTION 'deleting creator card visible'; END IF;
  DELETE FROM public.account_deletion_requests;
  SET LOCAL ROLE service_role;
  IF jsonb_array_length(public.part2_admin_list_summons()) <> 3 OR public.part2_admin_list_summons()::text ~ 'c0000000' THEN RAISE EXCEPTION 'admin list'; END IF;
  IF NOT public.part2_admin_hide_summons((SELECT id FROM public.summons WHERE share_code=codes[3])) THEN RAISE EXCEPTION 'admin hide'; END IF;
  RESET ROLE;
END $$;

-- 6) Account deletion cascades both tables.
DELETE FROM public.private_profiles WHERE owner_user_id = 'c0000000-0000-4000-8000-000000000002';
DELETE FROM auth.users WHERE id = 'c0000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.profile_status_tags WHERE owner_user_id IN ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002')) THEN RAISE EXCEPTION 'tags kept'; END IF;
  IF EXISTS (SELECT 1 FROM public.summons) THEN RAISE EXCEPTION 'summons kept'; END IF;
END $$;
SELECT 'P3_MATRIX_PASS';
