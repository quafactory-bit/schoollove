\set ON_ERROR_STOP on

-- Isolated-only synthetic baseline matching the audited Production counts.
-- No value in this file is copied from a Production person row.
-- level_updated_at predates the repository's migration history but exists in
-- Production; recreate that legacy column only in the disposable database.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS level_updated_at timestamptz;

INSERT INTO public.schools (
  id, school_name, school_type, sido, sigungu, address, school_code, slug
)
SELECT
  md5('phase10l-school-' || value::text)::uuid,
  'TEST School ' || value::text,
  'high',
  'TEST',
  'TEST',
  '',
  'PHASE10L-' || value::text,
  'phase10l-school-' || value::text
FROM generate_series(1, 10006) AS value;

INSERT INTO public.profiles (
  id, school_id, graduation_year, grade, class_number, nickname,
  instagram_id, report_count, is_hidden, owner_user_id,
  ownership_status, profile_visibility, created_at
)
SELECT
  md5('phase10l-profile-' || value::text)::uuid,
  md5('phase10l-school-' || (((value - 1) % 13) + 1)::text)::uuid,
  2000 + (value % 10),
  NULL,
  ((value - 1) % 10) + 1,
  'TEST LEGACY ' || value::text,
  'test_legacy_' || value::text,
  0,
  false,
  NULL,
  NULL,
  NULL,
  clock_timestamp() - interval '30 days'
FROM generate_series(1, 25) AS value;

INSERT INTO public.reports (
  id, profile_id, type, reason, requested_instagram_id,
  is_self_claimed, status, created_at
)
VALUES (
  md5('phase10l-report-1')::uuid,
  md5('phase10l-profile-1')::uuid,
  'delete',
  'TEST LEGACY REPORT',
  NULL,
  false,
  'pending',
  clock_timestamp() - interval '20 days'
);

-- Production's one historical report does not currently contribute to the
-- stored report_count, so the isolated baseline deliberately matches it.
UPDATE public.profiles SET report_count = 0;

INSERT INTO public.traces (
  id, school_id, graduation_year, grade, class_number, message,
  report_count, is_hidden, created_at
)
SELECT
  md5('phase10l-trace-' || value::text)::uuid,
  md5('phase10l-school-' || (((value - 1) % 5) + 1)::text)::uuid,
  2000 + value,
  NULL,
  value,
  'TEST LEGACY TRACE ' || value::text,
  0,
  false,
  clock_timestamp() - interval '15 days'
FROM generate_series(1, 8) AS value;

INSERT INTO public.search_logs (query, result_count, clicked_school_id, created_at)
SELECT
  'q' || lpad(value::text, 9, '0'),
  0,
  NULL,
  clock_timestamp() - interval '10 days'
FROM generate_series(1, 670) AS value;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.schools) <> 10006
    OR (SELECT count(*) FROM public.profiles) <> 25
    OR (SELECT count(DISTINCT school_id) FROM public.profiles) <> 13
    OR (SELECT count(*) FROM public.reports) <> 1
    OR (SELECT count(*) FROM public.traces) <> 8
    OR (SELECT count(DISTINCT school_id) FROM public.traces) <> 5
    OR (SELECT count(*) FROM public.search_logs) <> 670
  THEN
    RAISE EXCEPTION 'PHASE10L_SYNTHETIC_BASELINE_INVALID';
  END IF;
END $$;
