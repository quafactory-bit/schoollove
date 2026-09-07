-- Included inside disposable-matrix's rollback transaction, after base fixtures.
SET session_replication_role=replica;
INSERT INTO public.beta_programs(id,program_key,name,status,starts_at,ends_at)
VALUES('cc000001-0000-4000-8000-000000000001','class_history_disposable','Local People Discovery','active',now()-interval '1 day',now()+interval '13 days');
INSERT INTO public.beta_setup_drafts(id,draft_key,name,starts_at,ends_at,max_users,target_scope,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,status,created_by)
VALUES('cc000002-0000-4000-8000-000000000001','class_history_disposable','Local People Discovery',now()-interval '1 day',now()+interval '13 days',20,'one_school','aa000001-0000-4000-8000-000000000001',ARRAY['people_search','connection_request'],'{"maxUsesPerInvite":1,"expiresInDays":7}',true,'{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}','activated','local-test');
INSERT INTO public.beta_program_setup_snapshots(id,program_id,source_draft_id,max_users,target_scope,target_school_id,enabled_features,invite_policy,approval_waitlist_enabled,stop_conditions,created_by)
VALUES('cc000003-0000-4000-8000-000000000001','cc000001-0000-4000-8000-000000000001','cc000002-0000-4000-8000-000000000001',20,'one_school','aa000001-0000-4000-8000-000000000001',ARRAY['people_search','connection_request'],'{"maxUsesPerInvite":1,"expiresInDays":7}',true,'{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}','local-test');
INSERT INTO public.beta_program_schools(program_id,school_id,source_snapshot_id,created_by)
VALUES('cc000001-0000-4000-8000-000000000001','aa000001-0000-4000-8000-000000000001','cc000003-0000-4000-8000-000000000001','local-test');
INSERT INTO public.beta_feature_flags(program_id,feature_key,enabled,reason_code,updated_by)
SELECT 'cc000001-0000-4000-8000-000000000001',f,f IN ('people_search','connection_request'),'LOCAL_TEST','local-test'
FROM unnest(ARRAY['account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations']) f;
INSERT INTO public.beta_members(program_id,user_id,target_school_id,status)
SELECT 'cc000001-0000-4000-8000-000000000001',id,'aa000001-0000-4000-8000-000000000001','active' FROM auth.users WHERE right(id::text,1) IN ('3','4');
SET session_replication_role=origin;
DO $$
DECLARE actor uuid := 'aa100001-0000-4000-8000-000000000003'; receiver uuid := 'aa100001-0000-4000-8000-000000000004'; school uuid := 'aa000001-0000-4000-8000-000000000001'; result record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',receiver::text,true);
  PERFORM public.replace_own_school_class_history(receiver,'[{"grade_number":2,"class_number":3}]');
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM public.replace_own_school_class_history(actor,'[{"grade_number":1,"class_number":2}]');
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school,2010,2,3,'Synthetic 4');
  ASSERT result.match_state='unavailable' AND result.match_token IS NULL,'old class mismatch';
  PERFORM public.replace_own_school_class_history(actor,'[{"grade_number":2,"class_number":3}]');
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school,2010,2,3,'Synthetic 4');
  ASSERT result.match_state='match_available' AND result.match_token IS NOT NULL,'new class match';
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school,2010,1,2,'Synthetic 4');
  ASSERT result.match_state='unavailable' AND result.match_token IS NULL,'old class invalid';
  PERFORM public.replace_own_school_class_history(actor,'[]');
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school,2010,2,3,'Synthetic 4');
  ASSERT result.match_state='unavailable' AND result.match_token IS NULL,'clear class invalid';
  SELECT * INTO result FROM public.find_exact_private_profile_match(actor,school,2010,'Synthetic 4');
  ASSERT result.match_state='match_available' AND result.match_token IS NOT NULL,'legacy exact success';
  SELECT * INTO result FROM public.find_exact_private_profile_match(actor,school,2010,'Missing');
  ASSERT result.match_state='unavailable' AND result.match_token IS NULL,'legacy exact generic miss';
  PERFORM set_config('request.jwt.claim.sub','aa100001-0000-4000-8000-000000000001',true);
END;
$$;
SELECT 'SAME_CLASS_NEW_HISTORY_CLEAR_LEGACY_EXACT_PASS' result;
