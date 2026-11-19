-- Assertions for the Part 2 P1 functions. Any failure raises and stops psql.
DO $$
DECLARE names text[]; home jsonb; flags jsonb; pop text[];
BEGIN
  SELECT array_agg(masked_name ORDER BY masked_name) INTO names FROM public.part2_year_masked_preview('a0000000-0000-4000-8000-000000000001',2005);
  -- active + consented: 김민수, 이준(spaces removed), 남궁민수, 진. Withdrawn/inactive excluded.
  IF NOT (names @> ARRAY['O','김O수','남O수','이O'] AND names <@ ARRAY['O','김O수','남O수','이O'] AND cardinality(names) = 4) THEN RAISE EXCEPTION 'masked preview mismatch: %', names; END IF;
  IF EXISTS (SELECT 1 FROM public.part2_year_masked_preview('a0000000-0000-4000-8000-000000000001',2005) m WHERE m.masked_name IN ('김민수','이준','남궁민수','탈퇴자','비활성','진')) THEN RAISE EXCEPTION 'raw name leaked'; END IF;
  IF EXISTS (SELECT 1 FROM public.part2_year_masked_preview('a0000000-0000-4000-8000-000000000001',2006)) THEN RAISE EXCEPTION 'wrong year leaked'; END IF;

  SELECT jsonb_object_agg(school_id::text, has_roster) INTO flags FROM public.part2_school_roster_flags(ARRAY['a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001']::uuid[]);
  IF flags <> '{"a0000000-0000-4000-8000-000000000001":true,"a0000000-0000-4000-8000-000000000003":false}'::jsonb THEN RAISE EXCEPTION 'flags mismatch: %', flags; END IF;

  -- 4 recent active consents (u1,u2,u3,u6) => below 5 => hidden
  home := public.part2_home_attendance();
  IF home <> '{"visible": false}'::jsonb THEN RAISE EXCEPTION 'home should be hidden: %', home; END IF;
  UPDATE public.school_roster_consents SET consented_at = now() - interval '1 day' WHERE membership_id = 'd0000000-0000-4000-8000-000000000007';
  home := public.part2_home_attendance();
  IF (home->>'visible')::boolean IS NOT TRUE OR (home->>'recent_total')::int <> 5 THEN RAISE EXCEPTION 'home should be visible with 5: %', home; END IF;
  IF home::text ~ '(김민수|이준|남궁|owner|consented|latest|c0000000|b0000000)' THEN RAISE EXCEPTION 'home leaked personal data: %', home; END IF;
  IF jsonb_array_length(home->'ticker') <> 2 OR (home->'ticker'->0->>'school_name') <> '서울서초고등학교' THEN RAISE EXCEPTION 'ticker order mismatch: %', home->'ticker'; END IF;
  IF (home->'top'->0->>'count')::int <> 4 OR (home->'top'->1->>'count')::int <> 1 THEN RAISE EXCEPTION 'top mismatch: %', home->'top'; END IF;

  SELECT array_agg(slug ORDER BY slug) INTO pop FROM public.part2_popular_schools();
  IF pop IS DISTINCT FROM ARRAY['seocho-high'] THEN RAISE EXCEPTION 'popular mismatch: %', pop; END IF;
END $$;

-- Privileges: anon may call the three public functions, not the popular one; no direct table access.
SET ROLE anon;
SELECT count(*) FROM public.part2_year_masked_preview('a0000000-0000-4000-8000-000000000001',2005);
SELECT public.part2_home_attendance() IS NOT NULL;
DO $$ BEGIN
  BEGIN PERFORM public.part2_popular_schools(); RAISE EXCEPTION 'anon could read popular schools';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.private_profiles; RAISE EXCEPTION 'anon could read profiles';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.part2_popular_schools(); RAISE EXCEPTION 'authenticated could read popular schools';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'P1_MATRIX_PASS';
