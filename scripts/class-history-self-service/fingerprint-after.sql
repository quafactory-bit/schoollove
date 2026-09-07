\set ON_ERROR_STOP on
DO $$
DECLARE baseline class_history_audit.baseline%ROWTYPE;
BEGIN
  SELECT * INTO baseline FROM class_history_audit.baseline;
  ASSERT (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r')=baseline.tables, 'table delta';
  ASSERT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public')=baseline.columns, 'column delta';
  ASSERT (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace)=baseline.functions+1, 'function delta';
  ASSERT pg_get_functiondef('public.find_exact_private_profile_match(uuid,uuid,integer,text)'::regprocedure)=baseline.exact_definition, 'legacy exact changed';
  ASSERT pg_get_functiondef('public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)'::regprocedure)<>baseline.class_definition, 'same class not hardened';
  ASSERT (SELECT count(*) FROM pg_indexes WHERE schemaname='public')=baseline.indexes, 'index delta';
  ASSERT (SELECT count(*) FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND NOT tgisinternal)=baseline.triggers, 'trigger delta';
  ASSERT (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='profile_school_class_histories')=baseline.policies, 'policies changed';
  ASSERT NOT has_function_privilege('anon','public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)','EXECUTE'), 'search anon';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) acl WHERE p.oid='public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'), 'search public';
  ASSERT (SELECT prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)'::regprocedure), 'search definer/search path';
  ASSERT NOT has_function_privilege('authenticated','public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)','EXECUTE'), 'search authenticated';
  ASSERT has_function_privilege('service_role','public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)','EXECUTE'), 'search service role';
  ASSERT pg_get_functiondef('public.add_own_school_membership_with_class_history(uuid,integer,jsonb)'::regprocedure)=baseline.create_definition, 'new membership changed';
  ASSERT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.profile_school_class_histories'::regclass), 'rls';
  ASSERT NOT has_table_privilege('authenticated','public.profile_school_class_histories','INSERT,UPDATE,DELETE'), 'direct writes';
  ASSERT has_table_privilege('authenticated','public.profile_school_class_histories','SELECT'), 'owner read';
  ASSERT NOT has_function_privilege('anon','public.replace_own_school_class_history(uuid,jsonb)','EXECUTE'), 'anon';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) acl WHERE p.oid='public.replace_own_school_class_history(uuid,jsonb)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'), 'public';
  ASSERT has_function_privilege('authenticated','public.replace_own_school_class_history(uuid,jsonb)','EXECUTE'), 'authenticated';
  ASSERT has_function_privilege('service_role','public.replace_own_school_class_history(uuid,jsonb)','EXECUTE'), 'service role';
  ASSERT (SELECT prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.replace_own_school_class_history(uuid,jsonb)'::regprocedure), 'definer search path';
END;
$$;
SELECT 'SCHEMA_43_TO_44_PASS: 73/723/194; indexes/triggers unchanged; legacy/create preserved; class locking strengthened; RLS/grants preserved' result;
