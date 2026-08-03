\set ON_ERROR_STOP on

DO $$
DECLARE
  role_name text;
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

  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(role_name,'public.profiles','INSERT')
      OR has_table_privilege(role_name,'public.reports','INSERT')
      OR has_table_privilege(role_name,'public.traces','INSERT')
      OR has_table_privilege(role_name,'public.search_logs','INSERT')
      OR has_any_column_privilege(role_name,'public.profiles','INSERT')
      OR has_any_column_privilege(role_name,'public.reports','INSERT')
      OR has_any_column_privilege(role_name,'public.traces','INSERT')
      OR has_any_column_privilege(role_name,'public.search_logs','INSERT')
    THEN
      RAISE EXCEPTION 'legacy public INSERT remains for %', role_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges AS privilege
    WHERE privilege.table_schema='public'
      AND privilege.table_name IN ('profiles','reports','traces','search_logs')
      AND privilege.grantee='PUBLIC' AND privilege.privilege_type='INSERT'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.column_privileges AS privilege
    WHERE privilege.table_schema='public'
      AND privilege.table_name IN ('profiles','reports','traces','search_logs')
      AND privilege.grantee='PUBLIC' AND privilege.privilege_type='INSERT'
  ) THEN
    RAISE EXCEPTION 'PUBLIC legacy INSERT remains';
  END IF;

  IF has_table_privilege('service_role','public.search_logs','SELECT,INSERT,UPDATE,DELETE')
    OR has_any_column_privilege('service_role','public.search_logs','INSERT')
  THEN
    RAISE EXCEPTION 'service-role raw search privilege remains';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
     WHERE polrelid IN ('public.profiles'::regclass,'public.reports'::regclass,'public.traces'::regclass,'public.search_logs'::regclass)
       AND polcmd='a'
       AND (polroles=ARRAY[0::oid] OR polroles && ARRAY[(SELECT oid FROM pg_roles WHERE rolname='anon'),(SELECT oid FROM pg_roles WHERE rolname='authenticated')])
  ) THEN
    RAISE EXCEPTION 'legacy public INSERT policy remains';
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
