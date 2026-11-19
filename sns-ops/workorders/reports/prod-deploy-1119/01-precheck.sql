-- 운영(schoollovei, ucnybhzpbatzcipwqtox) 읽기 전용 사전 조회. 아무것도 바꾸지 않는다.
SELECT
  current_setting('server_version') AS pg_version,
  to_regclass('public.part2_daily_funnel') IS NOT NULL AS funnel_table_exists,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261111021213','20261119030000')) AS part2_ledger_rows,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'part2\_%') AS part2_functions,
  to_regprocedure('public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)') IS NOT NULL AS owner_fn_exists,
  md5(pg_get_functiondef(to_regprocedure('public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)'))) AS owner_fn_md5,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='adult_eligibility_records' AND column_name='school_membership_first_created_at') AS milestone_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='school_roster_consents' AND column_name='consented_at') AS consent_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='private_profiles' AND column_name='display_name') AS profile_col,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='schools' AND column_name='slug') AS school_slug_col,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS last_ledger_version,
  (SELECT count(*) FROM public.school_roster_consents WHERE withdrawn_at IS NULL) AS active_roster_consents,
  (SELECT count(*) FROM public.school_roster_consents WHERE withdrawn_at IS NULL AND consented_at >= now() - interval '7 days') AS recent_7d_consents;
