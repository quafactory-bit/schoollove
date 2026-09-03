\set ON_ERROR_STOP on

DO $permissions$
DECLARE
  signature text;
  secure_count integer;
  invoker_helper_count integer;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'private.controlled_beta_contract_kind(text[])',
    'private.controlled_beta_contract_max_users(text)',
    'private.has_connected_instagram_beta_prerequisites(uuid,uuid)',
    'public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text)',
    'public.admin_activate_beta_setup(uuid,text)',
    'public.admin_configure_controlled_beta_features(uuid,text[],text)',
    'public.admin_start_controlled_beta_program(uuid,text,text)',
    'public.admin_reactivate_controlled_beta_program(uuid,text,text,text)',
    'public.admin_issue_beta_invite(uuid,text,text,text,integer,timestamptz,text)',
    'public.redeem_beta_invite(uuid,text,text,text)',
    'public.admin_review_beta_member(uuid,text,text,text)'
  ] LOOP
    IF has_function_privilege('public',signature,'EXECUTE')
      OR has_function_privilege('anon',signature,'EXECUTE')
      OR has_function_privilege('authenticated',signature,'EXECUTE')
      OR NOT has_function_privilege('service_role',signature,'EXECUTE')
    THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_FUNCTION_PRIVILEGE_FAILED:%',signature; END IF;
  END LOOP;
  IF has_function_privilege('public','public.has_beta_feature_access(uuid,text)','EXECUTE')
    OR has_function_privilege('anon','public.has_beta_feature_access(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.has_beta_feature_access(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.has_beta_feature_access(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_ACCESS_PRIVILEGE_FAILED'; END IF;
  IF has_function_privilege('public','public.update_own_connected_instagram_handle(text)','EXECUTE')
    OR has_function_privilege('anon','public.update_own_connected_instagram_handle(text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.update_own_connected_instagram_handle(text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.update_own_connected_instagram_handle(text)','EXECUTE')
  THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_HANDLE_PRIVILEGE_FAILED'; END IF;
  SELECT count(*) INTO secure_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
  WHERE (namespace.nspname,procedure.proname) IN (
    ('private','controlled_beta_contract_kind'),
    ('private','controlled_beta_contract_max_users'),
    ('private','has_connected_instagram_beta_prerequisites'),
    ('public','admin_save_beta_setup'),
    ('public','admin_activate_beta_setup'),
    ('public','admin_configure_controlled_beta_features'),
    ('public','admin_start_controlled_beta_program'),
    ('public','admin_reactivate_controlled_beta_program'),
    ('public','admin_issue_beta_invite'),
    ('public','redeem_beta_invite'),
    ('public','admin_review_beta_member'),
    ('public','has_beta_feature_access'),
    ('public','update_own_connected_instagram_handle')
  )
    AND procedure.prosecdef
    AND procedure.proconfig @> ARRAY['search_path=""'];
  IF secure_count<>11 THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_SECURITY_CONFIG_FAILED:%',secure_count; END IF;
  SELECT count(*) INTO invoker_helper_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
  WHERE (namespace.nspname,procedure.proname) IN (
    ('private','controlled_beta_contract_kind'),
    ('private','controlled_beta_contract_max_users')
  )
    AND NOT procedure.prosecdef
    AND procedure.proconfig @> ARRAY['search_path=""'];
  IF invoker_helper_count<>2 THEN
    RAISE EXCEPTION 'CONNECTED_INSTAGRAM_INVOKER_HELPER_CONFIG_FAILED:%',invoker_helper_count;
  END IF;
END
$permissions$;

SELECT 'CONNECTED_INSTAGRAM_BETA_PERMISSIONS_OK' AS status;
