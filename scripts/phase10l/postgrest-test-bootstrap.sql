\set ON_ERROR_STOP on

-- Test-only compatibility object. Production already has search_schools_v2,
-- but its historical SQL predates repository migrations. This disposable
-- implementation exposes only school basics and never reads person tables.
CREATE OR REPLACE FUNCTION public.search_schools_v2(q text, lim integer DEFAULT 20)
RETURNS TABLE(
  id uuid,
  school_name text,
  school_type text,
  sido text,
  sigungu text,
  slug text,
  address text,
  school_code text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT school.id, school.school_name, school.school_type, school.sido,
         school.sigungu, school.slug, school.address, school.school_code,
         school.created_at
    FROM public.schools AS school
   WHERE char_length(btrim(q)) >= 2
     AND school.school_name ILIKE '%' || btrim(q) || '%'
   ORDER BY school.school_name, school.school_code
   LIMIT least(greatest(coalesce(lim, 20), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.search_schools_v2(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_schools_v2(text,integer) TO anon, authenticated, service_role;

DO $$ BEGIN
  CREATE ROLE phase10l_authenticator NOINHERIT LOGIN PASSWORD 'phase10l_local_postgrest';
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE phase10l_authenticator NOINHERIT LOGIN PASSWORD 'phase10l_local_postgrest';
END $$;
GRANT anon, authenticated, service_role TO phase10l_authenticator;
