DO $$ DECLARE role_name text; target_function regprocedure; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.activate_social_account(uuid)','EXECUTE')
      OR has_function_privilege(role_name,'public.activate_social_account_from_attempt(uuid)','EXECUTE')
      OR has_function_privilege(role_name,'public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)','EXECUTE')
      OR has_function_privilege(role_name,'private.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)','EXECUTE')
    THEN RAISE EXCEPTION 'PHASE10P_ACTIVATION_PUBLIC_EXECUTE %',role_name; END IF;
  END LOOP;
  FOREACH target_function IN ARRAY ARRAY[
    'public.activate_social_account(uuid)'::regprocedure,
    'public.activate_social_account_from_attempt(uuid)'::regprocedure,
    'public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)'::regprocedure,
    'private.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)'::regprocedure
  ] LOOP
    IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=target_function AND a.grantee=0 AND a.privilege_type='EXECUTE')
    THEN RAISE EXCEPTION 'PHASE10P_ACTIVATION_PUBLIC_EXECUTE %',target_function; END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role','public.activate_social_account(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.activate_social_account_from_attempt(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)','EXECUTE')
    OR has_function_privilege('service_role','private.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)','EXECUTE')
  THEN RAISE EXCEPTION 'PHASE10P_ACTIVATION_SERVICE_EXECUTE'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='private' AND grantee IN ('PUBLIC','anon','authenticated','service_role'))
  THEN RAISE EXCEPTION 'PHASE10P_ACTIVATION_PRIVATE_CRUD'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r' AND c.relrowsecurity)<>9
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r' AND c.relforcerowsecurity)<>9
  THEN RAISE EXCEPTION 'PHASE10P_ACTIVATION_RLS_FORCE'; END IF;
END $$;
SELECT 'PHASE10P_SOCIAL_ACTIVATION_PERMISSIONS_OK service_role_only=true private_crud=0 rls=9 force_rls=9' AS status;
