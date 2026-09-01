SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE role_name text;
BEGIN
  IF NOT has_function_privilege('service_role','public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10P_RESUME_SERVICE_PERMISSION'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(role_name,'public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)','EXECUTE') THEN RAISE EXCEPTION 'PHASE10P_RESUME_PUBLIC_PERMISSION %',role_name; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid='public.record_verified_social_identity_from_upstream_leg(uuid,uuid,text,text,bytea,integer)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PHASE10P_RESUME_PUBLIC_ACL'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r')<>9 THEN RAISE EXCEPTION 'PHASE10P_RESUME_PRIVATE_TABLE_COUNT'; END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r' AND c.relrowsecurity)<>9
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r' AND c.relforcerowsecurity)<>9 THEN RAISE EXCEPTION 'PHASE10P_RESUME_RLS'; END IF;
END $$;
SELECT 'PHASE10P_PROVISIONAL_RESUME_PERMISSIONS_OK' AS status;
