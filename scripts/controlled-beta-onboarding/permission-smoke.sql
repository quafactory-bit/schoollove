DO $permissions$
DECLARE function_count integer;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='public' AND relation.relname='beta_onboarding_invite_claims'
      AND relation.relrowsecurity AND relation.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'CLAIM_RLS_NOT_FORCED'; END IF;
  IF has_table_privilege('anon','public.beta_onboarding_invite_claims','INSERT')
    OR has_table_privilege('authenticated','public.beta_onboarding_invite_claims','INSERT')
    OR has_table_privilege('authenticated','public.beta_onboarding_invite_claims','UPDATE')
    OR has_table_privilege('authenticated','public.beta_onboarding_invite_claims','DELETE')
  THEN RAISE EXCEPTION 'CLAIM_BROWSER_MUTATION_PRIVILEGE'; END IF;
  IF has_function_privilege('public','public.claim_beta_invite_for_onboarding(uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.claim_beta_invite_for_onboarding(uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.claim_beta_invite_for_onboarding(uuid,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.claim_beta_invite_for_onboarding(uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.finalize_beta_onboarding_claim(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.finalize_beta_onboarding_claim(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.has_beta_onboarding_access(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'ONBOARDING_FUNCTION_PRIVILEGE_FAILED'; END IF;
  SELECT count(*) INTO function_count FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
  WHERE namespace.nspname='public'
    AND procedure.proname IN ('is_people_discovery_beta_contract','has_beta_onboarding_access','claim_beta_invite_for_onboarding','finalize_beta_onboarding_claim')
    AND procedure.prosecdef
    AND procedure.proconfig @> ARRAY['search_path=""'];
  IF function_count<>4 THEN RAISE EXCEPTION 'FUNCTION_SECURITY_CONFIG_FAILED:%',function_count; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='beta_onboarding_invite_claims'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  ) THEN RAISE EXCEPTION 'CLAIM_WRITE_POLICY_PRESENT'; END IF;
END
$permissions$;
SELECT 'CONTROLLED_BETA_ONBOARDING_PERMISSIONS_OK' AS status;
