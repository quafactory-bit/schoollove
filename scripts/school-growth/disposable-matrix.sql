\set ON_ERROR_STOP on
-- ONLY the disposable schema45 clone. Never run this fixture against a remote DB.
BEGIN;
SET session_replication_role=replica;
INSERT INTO public.public_account_launch_control(control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,last_reason_code,updated_by)
VALUES('public_account','open',true,true,true,'DISPOSABLE','local');
INSERT INTO auth.users(id,created_at) SELECT ('ee100001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()-interval '1 day' FROM generate_series(1,25)n;
INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
SELECT ('ee000001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Growth Fixture '||n,'high','Fixture','Fixture','GROWTH-'||n,'growth-fixture-'||n FROM generate_series(1,3)n;
INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
SELECT id,true,'self_attestation','phase10b-2026-07-28' FROM auth.users;
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT id,t,true,'phase10b-2026-07-28' FROM auth.users CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default'])t;
INSERT INTO public.private_profiles(id,owner_user_id,display_name) SELECT id,id,'Growth Fixture' FROM auth.users;
SET session_replication_role=origin;
SET request.jwt.claim.role='authenticated';

DO $$
DECLARE s uuid:='ee000001-0000-4000-8000-000000000001'; s2 uuid:='ee000001-0000-4000-8000-000000000002';
  a uuid:='ee100001-0000-4000-8000-000000000001'; b uuid:='ee100001-0000-4000-8000-000000000002';
  u uuid; token text; proof text; result jsonb; member uuid; before_xp bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',a::text,true);
  result:=public.add_own_school_membership_with_class_history(s,2010,'[]');
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s)=100,'first membership +100';
  ASSERT (SELECT current_level FROM private.school_growth_states WHERE school_id=s)=1,'first level';
  SELECT id INTO member FROM public.profile_school_memberships WHERE owner_user_id=a AND school_id=s;
  PERFORM public.delete_own_school_membership(member);
  PERFORM public.add_own_school_membership_with_class_history(s,2010,'[]');
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s)=100,'re-add rewarded twice';
  PERFORM public.add_own_school_membership_with_class_history(s2,2010,'[]');
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s2)=100,'other school first +100';
  token:=public.create_school_growth_referral(s)->>'token';
  ASSERT length(token)=64,'opaque token';
  proof:=public.create_school_growth_visit(token)->>'proof';
  ASSERT NOT public.bind_school_growth_visit(proof),'existing/self referral';
  UPDATE auth.users SET created_at=now()+interval '1 second' WHERE id=b;
  PERFORM set_config('request.jwt.claim.sub',b::text,true);
  ASSERT public.bind_school_growth_visit(proof),'new-user binding';
  PERFORM public.add_own_school_membership_with_class_history(s,2010,'[]');
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s)=250,'valid referral +150';
  ASSERT (SELECT count(*) FROM private.school_growth_events WHERE event_type='level_up' AND school_id=s)=1,'level-up only on crossing';
  SELECT id INTO member FROM public.profile_school_memberships WHERE owner_user_id=b AND school_id=s;
  PERFORM public.delete_own_school_membership(member);
  PERFORM public.add_own_school_membership_with_class_history(s,2010,'[]');
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s)=250,'referral replay';
  u:='ee100001-0000-4000-8000-000000000003';
  UPDATE auth.users SET created_at=now()+interval '1 second' WHERE id=u;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  ASSERT NOT public.bind_school_growth_visit(proof),'bound visit cannot change owner';
  proof:=public.create_school_growth_visit(token)->>'proof';
  ASSERT public.bind_school_growth_visit(proof),'wrong-school fixture binding';
  PERFORM public.add_own_school_membership_with_class_history(s2,2010,'[]');
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s2)=200,'wrong school bonus awarded';
  ASSERT (SELECT count(*) FROM private.school_growth_contributions WHERE referral_xp=50)=1,'one bonus';
  u:='ee100001-0000-4000-8000-000000000004';
  UPDATE auth.users SET created_at=now()+interval '1 second' WHERE id=u;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  proof:=public.create_school_growth_visit(token)->>'proof';
  ASSERT public.bind_school_growth_visit(proof),'expiry fixture binding';
  UPDATE private.school_growth_referrals SET expires_at=now()-interval '1 second';
  PERFORM public.add_own_school_membership_with_class_history(s,2010,'[]');
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s)=350,'expired referral +100 only';
  ASSERT public.create_school_growth_visit(token) IS NULL,'expired visit';
  ASSERT public.get_school_growth_game(s)->0->>'level'='1','small cohort must not publish';
  ASSERT public.get_school_growth_game()='[]'::jsonb,'no invented ranking';
  FOR n IN 5..11 LOOP
    u:=('ee100001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
    PERFORM set_config('request.jwt.claim.sub',u::text,true);
    PERFORM public.add_own_school_membership_with_class_history(s,2010,'[]');
  END LOOP;
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s)=1050,'ten distinct first contributions';
  ASSERT (SELECT count(*) FROM private.school_growth_batches)=1,'one publication batch';
  ASSERT public.get_school_growth_game()='[]'::jsonb,'publication must be delayed';
  UPDATE private.school_growth_batches SET publish_at=now()-interval '1 hour';
  result:=public.get_school_growth_game();
  ASSERT jsonb_array_length(result)=1,'real ranking';
  ASSERT (result->0->>'level')::integer=private.school_growth_level(1050),'published level';
  ASSERT (SELECT count(*) FROM jsonb_object_keys(result->0))=8,'public allowlist';
  ASSERT NOT (result->0 ?| ARRAY['user_id','owner_user_id','contributor_key','principal_key','display_name','graduation_year','class_number','instagram_handle','token']),'privacy leak';
  ASSERT (SELECT count(*) FROM private.school_growth_contributions WHERE referral_xp=50)=1,'global bonus invariant';
  FOR n IN 1..100 LOOP
    ASSERT private.school_growth_level((n*100)::bigint)>=private.school_growth_level(((n-1)*100)::bigint),'monotonic curve';
  END LOOP;
  before_xp:=(SELECT xp FROM private.school_growth_states WHERE school_id=s);
  PERFORM public.get_school_growth_game(s);
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id=s)=before_xp,'read does not award';
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT public.get_school_growth_game() IS NOT NULL,'public projection allowed';
  BEGIN PERFORM * FROM private.school_growth_contributions; RAISE EXCEPTION 'raw ledger visible'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.create_school_growth_referral('ee000001-0000-4000-8000-000000000001'); RAISE EXCEPTION 'anon create'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Failure after the growth trigger must atomically roll back membership and rewards.
CREATE FUNCTION private.growth_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'SYNTHETIC_GROWTH_FAILURE'; END $$;
CREATE TRIGGER zz_growth_test_failure AFTER INSERT ON public.profile_school_memberships FOR EACH ROW EXECUTE FUNCTION private.growth_test_fail();
DO $$ DECLARE before_xp bigint; BEGIN
  SELECT xp INTO before_xp FROM private.school_growth_states WHERE school_id='ee000001-0000-4000-8000-000000000001';
  PERFORM set_config('request.jwt.claim.sub','ee100001-0000-4000-8000-000000000023',true);
  BEGIN
    PERFORM public.add_own_school_membership_with_class_history('ee000001-0000-4000-8000-000000000001',2010,'[]');
    RAISE EXCEPTION 'Expected failure';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='SYNTHETIC_GROWTH_FAILURE'; END;
  ASSERT NOT EXISTS(SELECT 1 FROM public.profile_school_memberships WHERE owner_user_id='ee100001-0000-4000-8000-000000000023'),'membership rollback';
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id='ee000001-0000-4000-8000-000000000001')=before_xp,'XP rollback';
END $$;
DROP TRIGGER zz_growth_test_failure ON public.profile_school_memberships;
DROP FUNCTION private.growth_test_fail();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN UPDATE private.school_growth_states SET xp=999; RAISE EXCEPTION 'direct XP write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM private.school_growth_referrals; RAISE EXCEPTION 'referrer leak'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.create_school_growth_visit(repeat('a',64)); RAISE EXCEPTION 'direct visit RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r' AND c.relname LIKE 'school_growth_%'),'RLS/FORCE RLS';
END $$;
ROLLBACK;
SELECT 'GROWTH_DISPOSABLE_MATRIX_PASS' AS result;
