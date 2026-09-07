\set ON_ERROR_STOP on
-- Run only against the schema-only disposable clone, never a linked database.
BEGIN;
SET session_replication_role = replica;
INSERT INTO public.public_account_launch_control(control_key,state,private_profile_enabled,school_membership_enabled,last_reason_code,updated_by)
VALUES ('public_account','internal_test',true,true,'DISPOSABLE_TEST','local-test');
INSERT INTO auth.users(id) SELECT ('aa100001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,4) n;
INSERT INTO public.schools(id,school_name,school_type,sido,sigungu,school_code,slug)
SELECT ('aa000001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic School '||n,t,'Test','Test','CH-'||n,'class-history-fixture-'||n
FROM (VALUES(1,'high'),(2,'middle'),(3,'elementary'),(4,'university')) v(n,t);
INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
SELECT id,true,'self_attestation','phase10b-2026-07-28' FROM auth.users;
INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
SELECT id,t,true,'phase10b-2026-07-28' FROM auth.users CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) t;
INSERT INTO public.private_profiles(id,owner_user_id,display_name)
SELECT id,id,'Synthetic '||right(id::text,1) FROM auth.users;
INSERT INTO public.profile_school_memberships(id,profile_id,owner_user_id,school_id,graduation_year)
SELECT id,id,id,'aa000001-0000-4000-8000-000000000001',2010 FROM auth.users;
INSERT INTO public.connection_requests(id,sender_user_id,receiver_user_id,target_school_membership_id,relationship_type,message,status)
VALUES('bb000001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000002','aa100001-0000-4000-8000-000000000002','same_school','Hello','accepted');
INSERT INTO public.connections(request_id,user_low_id,user_high_id)
VALUES('bb000001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000002');
SET session_replication_role = origin;

CREATE FUNCTION class_history_audit.reject_history(target uuid,payload jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM public.replace_own_school_class_history(target,payload);
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM='CLASS_HISTORY_UNAVAILABLE','unexpected error contract';
    RETURN;
  END;
  RAISE EXCEPTION 'Expected rejection';
END;
$$;
GRANT USAGE ON SCHEMA class_history_audit TO authenticated;
GRANT EXECUTE ON FUNCTION class_history_audit.reject_history(uuid,jsonb) TO authenticated;

SET request.jwt.claim.sub = 'aa100001-0000-4000-8000-000000000001';
SET request.jwt.claim.role = 'authenticated';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  own_id uuid := 'aa100001-0000-4000-8000-000000000001';
  other_id uuid := 'aa100001-0000-4000-8000-000000000002';
  result jsonb;
  invalid jsonb;
  saved_id uuid;
  saved_updated timestamptz;
BEGIN
  result := public.replace_own_school_class_history(own_id,'[{"grade_number":1,"class_number":2}]');
  ASSERT result='[{"grade_number":1,"class_number":2}]'::jsonb,'create';
  result := public.replace_own_school_class_history(own_id,'[{"grade_number":3,"class_number":1},{"grade_number":1,"class_number":4}]');
  ASSERT result='[{"grade_number":1,"class_number":4},{"grade_number":3,"class_number":1}]'::jsonb,'replace/sort';
  SELECT id,updated_at INTO saved_id,saved_updated FROM public.profile_school_class_histories WHERE grade_number=1;
  PERFORM public.replace_own_school_class_history(own_id,'[{"grade_number":1,"class_number":4},{"grade_number":3,"class_number":1}]');
  ASSERT EXISTS(SELECT 1 FROM public.profile_school_class_histories WHERE id=saved_id AND updated_at=saved_updated),'no-op rewrote';
  PERFORM public.replace_own_school_class_history(own_id,'[{"grade_number":3,"class_number":1}]');
  ASSERT (SELECT count(*) FROM public.profile_school_class_histories)=1,'remove grade';
  ASSERT public.replace_own_school_class_history(own_id,'[]')='[]'::jsonb,'clear';
  ASSERT (SELECT count(*) FROM public.profile_school_class_histories)=0,'clear rows';
  PERFORM public.replace_own_school_class_history(own_id,'[{"grade_number":1,"class_number":2}]');
  FOR invalid IN SELECT value FROM jsonb_array_elements('[null,{},1,"text",[null],[{}],[{"grade_number":1}],[{"grade_number":1,"class_number":2,"unknown":0}],[{"grade_number":0,"class_number":1}],[{"grade_number":4,"class_number":1}],[{"grade_number":1,"class_number":0}],[{"grade_number":1,"class_number":101}],[{"grade_number":1.5,"class_number":1}],[{"grade_number":"1","class_number":1}],[{"grade_number":1,"class_number":1},{"grade_number":1,"class_number":2}],[{},{},{},{},{},{},{}]]'::jsonb)
  LOOP PERFORM class_history_audit.reject_history(own_id,invalid); END LOOP;
  PERFORM class_history_audit.reject_history(own_id,NULL);
  PERFORM class_history_audit.reject_history(other_id,'[]');
  PERFORM class_history_audit.reject_history('ffffffff-ffff-4fff-8fff-ffffffffffff','[]');
  BEGIN INSERT INTO public.profile_school_class_histories(membership_id,owner_user_id,grade_number,class_number) VALUES(own_id,own_id,2,2); RAISE EXCEPTION 'direct insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.profile_school_class_histories SET class_number=3; RAISE EXCEPTION 'direct update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.profile_school_class_histories; RAISE EXCEPTION 'direct delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;

CREATE TEMP TABLE before_relations AS SELECT
  (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.connection_requests r) requests,
  (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.connections c) connections,
  (SELECT count(*) FROM public.connection_messages) messages,
  (SELECT count(*) FROM public.connection_instagram_permissions) instagram,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.profile_school_memberships m) memberships;

SET session_replication_role=replica;
INSERT INTO public.connection_match_tokens(token_hash,requester_user_id,receiver_user_id,target_school_membership_id,used_at,expires_at)
VALUES
(repeat('a',64),'aa100001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000002','aa100001-0000-4000-8000-000000000002',NULL,now()+interval '10 minutes'),
(repeat('b',64),'aa100001-0000-4000-8000-000000000002','aa100001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000001',NULL,now()+interval '10 minutes'),
(repeat('c',64),'aa100001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000002','aa100001-0000-4000-8000-000000000002',now(),now()+interval '10 minutes'),
(repeat('d',64),'aa100001-0000-4000-8000-000000000003','aa100001-0000-4000-8000-000000000004','aa100001-0000-4000-8000-000000000004',NULL,now()+interval '10 minutes'),
(repeat('e',64),'aa100001-0000-4000-8000-000000000001','aa100001-0000-4000-8000-000000000002','aa100001-0000-4000-8000-000000000002',NULL,now()-interval '1 minute');
SET session_replication_role=origin;
DO $$
DECLARE own_id uuid := 'aa100001-0000-4000-8000-000000000001'; baseline before_relations%ROWTYPE;
BEGIN
  PERFORM public.replace_own_school_class_history(own_id,'[{"grade_number":1,"class_number":2}]');
  ASSERT (SELECT count(*) FROM public.connection_match_tokens)=5,'no-op token preservation';
  PERFORM public.replace_own_school_class_history(own_id,'[]');
  ASSERT (SELECT count(*) FROM public.connection_match_tokens)=3,'both directions invalidated';
  ASSERT EXISTS(SELECT 1 FROM public.connection_match_tokens WHERE token_hash=repeat('c',64)),'used preserved';
  ASSERT EXISTS(SELECT 1 FROM public.connection_match_tokens WHERE token_hash=repeat('d',64)),'unrelated preserved';
  ASSERT EXISTS(SELECT 1 FROM public.connection_match_tokens WHERE token_hash=repeat('e',64)),'expired preserved';
  SELECT * INTO baseline FROM before_relations;
  ASSERT (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.connection_requests r)=baseline.requests,'request changed';
  ASSERT (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.connections c)=baseline.connections,'connection changed';
  ASSERT (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.profile_school_memberships m)=baseline.memberships,'parent changed';
  ASSERT (SELECT count(*) FROM public.connection_messages)=baseline.messages,'messages';
  ASSERT (SELECT count(*) FROM public.connection_instagram_permissions)=baseline.instagram,'instagram';
END;
$$;
SELECT 'BASIC_VALIDATION_OWNER_NOOP_TOKEN_RELATION_MATRIX_PASS' result;
\i /tmp/search-regression.sql
DO $$
DECLARE own_id uuid := 'aa100001-0000-4000-8000-000000000001'; kind text; maximum integer;
BEGIN
  FOREACH kind IN ARRAY ARRAY['elementary','middle','high','university'] LOOP
    UPDATE public.schools SET school_type=kind WHERE id='aa000001-0000-4000-8000-000000000001';
    maximum := CASE kind WHEN 'elementary' THEN 6 WHEN 'university' THEN 0 ELSE 3 END;
    IF maximum>0 THEN
      PERFORM public.replace_own_school_class_history(own_id,(SELECT jsonb_agg(jsonb_build_object('grade_number',g,'class_number',100)) FROM generate_series(1,maximum) g));
      ASSERT (SELECT count(*) FROM public.profile_school_class_histories WHERE owner_user_id=own_id)=maximum,'K12 maximum';
    END IF;
    PERFORM class_history_audit.reject_history(own_id,jsonb_build_array(jsonb_build_object('grade_number',maximum+1,'class_number',1)));
    PERFORM public.replace_own_school_class_history(own_id,'[]');
  END LOOP;
  UPDATE public.schools SET school_type='high' WHERE id='aa000001-0000-4000-8000-000000000001';
  UPDATE public.public_account_launch_control SET state='closed',private_profile_enabled=false,school_membership_enabled=false;
  PERFORM class_history_audit.reject_history(own_id,'[]');
  UPDATE public.public_account_launch_control SET state='emergency_stopped',emergency_stopped_at=now();
  PERFORM class_history_audit.reject_history(own_id,'[]');
  UPDATE public.public_account_launch_control SET state='internal_test',private_profile_enabled=true,school_membership_enabled=true,emergency_stopped_at=NULL;
  UPDATE public.adult_eligibility_records SET policy_version='old-policy' WHERE user_id=own_id;
  PERFORM class_history_audit.reject_history(own_id,'[]');
  UPDATE public.adult_eligibility_records SET policy_version='phase10b-2026-07-28' WHERE user_id=own_id;
  INSERT INTO public.safety_account_restrictions(user_id,status) VALUES(own_id,'suspended');
  PERFORM class_history_audit.reject_history(own_id,'[]');
  DELETE FROM public.safety_account_restrictions WHERE user_id=own_id;
  UPDATE public.private_profiles SET status='hidden' WHERE owner_user_id=own_id;
  PERFORM class_history_audit.reject_history(own_id,'[]');
  UPDATE public.private_profiles SET status='active' WHERE owner_user_id=own_id;
  INSERT INTO public.account_deletion_requests(user_id,status) VALUES(own_id,'pending');
  PERFORM class_history_audit.reject_history(own_id,'[]');
  DELETE FROM public.account_deletion_requests WHERE user_id=own_id;
  PERFORM public.replace_own_school_class_history(own_id,'[{"grade_number":1,"class_number":1}]');
END;
$$;
CREATE FUNCTION class_history_audit.fail_child() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'FORCED_TEST_FAILURE'; END;
$$;
CREATE TRIGGER force_failure BEFORE INSERT ON public.profile_school_class_histories FOR EACH ROW EXECUTE FUNCTION class_history_audit.fail_child();
DO $$
BEGIN
  BEGIN
    PERFORM public.replace_own_school_class_history('aa100001-0000-4000-8000-000000000001','[{"grade_number":2,"class_number":2}]');
    RAISE EXCEPTION 'Expected child failure';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='FORCED_TEST_FAILURE','unexpected atomic failure'; END;
  ASSERT (SELECT count(*) FROM public.profile_school_class_histories WHERE grade_number=1 AND class_number=1)=1,'history rollback';
END;
$$;
DROP TRIGGER force_failure ON public.profile_school_class_histories;
DROP FUNCTION class_history_audit.fail_child();
SET LOCAL ROLE authenticated;
SELECT public.delete_own_school_membership('aa100001-0000-4000-8000-000000000001');
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM public.profile_school_class_histories WHERE owner_user_id='aa100001-0000-4000-8000-000000000001'),'membership cascade';
END; $$;
SELECT 'SCHOOL_TYPE_ACCESS_SAFETY_ROLLBACK_CASCADE_PASS' result;
ROLLBACK;
