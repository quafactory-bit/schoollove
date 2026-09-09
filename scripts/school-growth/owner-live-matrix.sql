\set ON_ERROR_STOP on
-- DISPOSABLE DB ONLY. All synthetic rows roll back. Never execute remotely.
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO public.public_account_launch_control(control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,last_reason_code,updated_by)
VALUES('public_account','open',true,true,true,'DISPOSABLE','local');
INSERT INTO auth.users(id,created_at) SELECT ('ef200001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()+interval '1 second' FROM generate_series(1,3)n;
INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
SELECT ('ef200002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Owner Fixture '||n,'high','Fixture','Fixture','OWNER-'||n,'owner-fixture-'||n FROM generate_series(1,3)n;
INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
SELECT id,true,'self_attestation','phase10b-2026-07-28' FROM auth.users;
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT id,t,true,'phase10b-2026-07-28' FROM auth.users CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default'])t;
INSERT INTO public.private_profiles(id,owner_user_id,display_name) SELECT id,id,'Owner Fixture' FROM auth.users;
-- Existing A has two zero-XP schools; fixture setup never awards.
INSERT INTO public.profile_school_memberships(profile_id,owner_user_id,school_id,graduation_year)
SELECT 'ef200001-0000-4000-8000-000000000001','ef200001-0000-4000-8000-000000000001',id,2010 FROM public.schools WHERE school_code IN ('OWNER-1','OWNER-2');
INSERT INTO private.school_growth_contributions(school_id,contributor_key,principal_key,base_xp)
SELECT school_id,private.school_growth_key(owner_user_id::text||':'||school_id::text),private.school_growth_key(owner_user_id::text),0 FROM public.profile_school_memberships;
INSERT INTO private.school_growth_states(school_id) SELECT DISTINCT school_id FROM public.profile_school_memberships;
SET LOCAL session_replication_role=origin;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
  ASSERT public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000001') IS NULL,'missing uid';
  PERFORM set_config('request.jwt.claim.sub','ef200001-0000-4000-8000-000000000002',true);
  ASSERT public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000001') IS NULL,'nonmember';
  PERFORM set_config('request.jwt.claim.sub','ef200001-0000-4000-8000-000000000001',true);
  r:=public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000001');
  ASSERT r->>'level'='1' AND r->>'progress'='0' AND r->>'ownContributionXp'='0','existing baseline';
  ASSERT public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000003') IS NULL,'cross school';
  PERFORM set_config('request.jwt.claim.sub','ef200001-0000-4000-8000-000000000002',true);
  PERFORM public.add_own_school_membership_with_class_history('ef200002-0000-4000-8000-000000000001',2010,'[]');
  r:=public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000001');
  ASSERT r->>'level'='1' AND r->>'progress'='70' AND r->>'ownContributionXp'='100','base100 coherence';
  ASSERT r->>'nearLevelUp'='false','near level';
  ASSERT (SELECT count(*) FROM jsonb_object_keys(r))=8,'exact allowlist';
  ASSERT NOT (r ?| ARRAY['xp','memberCount','userId','membershipId','email','displayName','graduationYear','grade','class','instagram','referrer']),'private fields';
  ASSERT public.get_school_growth_game('ef200002-0000-4000-8000-000000000001')->0->>'progress'='0','public delayed';
END $$;
RESET ROLE;
-- A genuine-shaped referral path, strictly local synthetic fixture.
DO $$ DECLARE token text; proof text; r jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','ef200001-0000-4000-8000-000000000001',true);
  token:=public.create_school_growth_referral('ef200002-0000-4000-8000-000000000002')->>'token';
  proof:=public.create_school_growth_visit(token)->>'proof';
  PERFORM set_config('request.jwt.claim.sub','ef200001-0000-4000-8000-000000000003',true);
  ASSERT public.bind_school_growth_visit(proof),'local referral bound';
  PERFORM public.add_own_school_membership_with_class_history('ef200002-0000-4000-8000-000000000002',2010,'[]');
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
  r:=public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000002');
  ASSERT r->>'level'='2' AND r->>'progress'='7' AND r->>'ownContributionXp'='150','referral150 coherence';
  ASSERT r->>'lastLevelUp' IS NOT NULL,'level-up timestamp';
  PERFORM set_config('request.jwt.claim.sub','ef200001-0000-4000-8000-000000000001',true);
  r:=public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000002');
  ASSERT r->>'level'='2' AND r->>'progress'='7' AND r->>'ownContributionXp'='0','same-school owner consistent, own contribution only';
  ASSERT public.get_school_growth_game('ef200002-0000-4000-8000-000000000002')->0->>'level'='1','public level remains1';
  ASSERT public.get_school_growth_game()='[]'::jsonb,'public ranking empty';
  BEGIN PERFORM * FROM private.school_growth_states; RAISE EXCEPTION 'live table visible'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.delete_own_school_membership((SELECT id FROM public.profile_school_memberships WHERE owner_user_id=auth.uid() AND school_id='ef200002-0000-4000-8000-000000000002'));
  ASSERT public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000002') IS NULL,'revoked owner read';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.get_own_school_growth_live('ef200002-0000-4000-8000-000000000001'); RAISE EXCEPTION 'anon allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon','public.get_own_school_growth_live(uuid)','execute'),'anon privilege';
  ASSERT NOT has_function_privilege('service_role','public.get_own_school_growth_live(uuid)','execute'),'service privilege';
  ASSERT has_function_privilege('authenticated','public.get_own_school_growth_live(uuid)','execute'),'owner role';
  ASSERT NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.get_own_school_growth_live(uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'),'PUBLIC privilege';
  ASSERT (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname LIKE 'school_growth_%' AND c.relkind='r'),'RLS unchanged';
  ASSERT (SELECT count(*) FROM private.school_growth_batches)=0,'no public batch';
  ASSERT (SELECT sum(xp) FROM private.school_growth_states)=250,'read and deletion XP unchanged';
END $$;
ROLLBACK;
SELECT 'OWNER_LIVE_PRIVATE_PUBLIC_MATRIX_PASS' AS result;
