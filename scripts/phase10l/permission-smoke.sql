\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.profiles'::regclass AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.reports'::regclass AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.traces'::regclass AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.search_logs'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'legacy-table RLS boundary changed';
  END IF;

  IF has_table_privilege('anon', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE')
    OR NOT has_table_privilege('service_role', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE')
  THEN
    RAISE EXCEPTION 'legacy profile privilege boundary changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.private_profiles'::regclass
       AND relrowsecurity AND relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.beta_programs'::regclass
       AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'private/beta RLS FORCE boundary changed';
  END IF;

  IF has_table_privilege('anon', 'public.private_profiles', 'SELECT,INSERT,UPDATE,DELETE')
    OR NOT has_table_privilege('authenticated', 'public.private_profiles', 'SELECT,INSERT,UPDATE,DELETE')
    OR NOT has_table_privilege('service_role', 'public.private_profiles', 'SELECT,INSERT,UPDATE,DELETE')
  THEN
    RAISE EXCEPTION 'private profile privilege boundary changed';
  END IF;
END $$;

SELECT 'PHASE10L_PERMISSIONS_OK' status;
