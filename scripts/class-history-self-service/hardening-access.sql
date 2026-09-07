\set ON_ERROR_STOP on
BEGIN;
\i /tmp/hardening-fixtures.sql
CREATE FUNCTION class_history_audit.expect_denied(target uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM public.replace_own_school_class_history(target,'[{"grade_number":1,"class_number":5}]');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='CLASS_HISTORY_UNAVAILABLE' THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'EXPECTED_DENIAL';
END $$;
CREATE TEMP TABLE relation_baseline AS SELECT
  (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.connection_requests r) requests,
  (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.connections r) connections,
  (SELECT count(*) FROM public.connection_messages) messages,
  (SELECT count(*) FROM public.connection_instagram_permissions) instagram,
  (SELECT count(*) FROM public.notifications) notifications;
SET request.jwt.claim.sub='aa100001-0000-4000-8000-000000000003';
DO $$ BEGIN
  ASSERT public.has_beta_feature_access(auth.uid(),'people_search'), 'PD search access';
  ASSERT NOT public.has_beta_feature_access(auth.uid(),'private_profile'), 'private profile off';
  ASSERT NOT public.public_account_feature_enabled('school_membership'), 'public write off';
  ASSERT NOT public.has_beta_onboarding_access(auth.uid(),'school_membership'), 'claim absent';
  PERFORM public.replace_own_school_class_history(auth.uid(),'[{"grade_number":1,"class_number":5}]');
  BEGIN
    PERFORM public.add_own_school_membership_with_class_history('aa000001-0000-4000-8000-000000000002',2010,'[]');
    RAISE EXCEPTION 'UNEXPECTED_CREATE_ALLOWED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='UNEXPECTED_CREATE_ALLOWED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.upsert_own_private_profile('Changed',NULL,NULL);
    RAISE EXCEPTION 'UNEXPECTED_PROFILE_ALLOWED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='UNEXPECTED_PROFILE_ALLOWED' THEN RAISE; END IF;
  END;
  ASSERT (SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id=auth.uid())=1;
  ASSERT (SELECT display_name FROM public.private_profiles WHERE owner_user_id=auth.uid())='Synthetic 3';
END $$;
SAVEPOINT scenario;
SET session_replication_role=replica;
INSERT INTO public.profile_school_memberships(id,profile_id,owner_user_id,school_id,graduation_year)
VALUES('aa200001-0000-4000-8000-000000000003',auth.uid(),auth.uid(),'aa000001-0000-4000-8000-000000000002',2010);
SET session_replication_role=origin;
SELECT class_history_audit.expect_denied('aa200001-0000-4000-8000-000000000003');
ROLLBACK TO scenario;
SET session_replication_role=replica;
UPDATE public.beta_programs SET starts_at=now()-interval '15 days',ends_at=now()-interval '1 day';
SET session_replication_role=origin;
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO scenario;
SET session_replication_role=replica;
UPDATE public.beta_programs SET emergency_disabled_at=now();
SET session_replication_role=origin;
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO scenario;
SET session_replication_role=replica;
UPDATE public.beta_feature_flags SET enabled=false WHERE feature_key='people_search';
SET session_replication_role=origin;
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO scenario;
-- Synthetic exact Connected Instagram-only program; no PD membership authority.
SET session_replication_role=replica;
UPDATE public.beta_program_setup_snapshots SET enabled_features=ARRAY['instagram_permission'],max_users=3;
UPDATE public.beta_feature_flags SET enabled=(feature_key='instagram_permission');
SET session_replication_role=origin;
DO $$ BEGIN
  ASSERT public.has_beta_feature_access(auth.uid(),'instagram_permission'), 'Instagram-only fixture';
  ASSERT NOT public.has_beta_feature_access(auth.uid(),'people_search');
  PERFORM class_history_audit.expect_denied(auth.uid());
END $$;
ROLLBACK TO scenario;
INSERT INTO public.safety_account_restrictions(user_id,status) VALUES(auth.uid(),'suspended');
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO scenario;
INSERT INTO public.account_deletion_requests(user_id) VALUES(auth.uid());
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO scenario;
SET session_replication_role=replica;
UPDATE public.public_account_launch_control SET state='emergency_stopped',emergency_stopped_at=now();
SET session_replication_role=origin;
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO scenario;
SELECT 'PD_ACCESS_MATRIX_PASS: exact=allow, other writes/school/expired/emergency/flag/Instagram/suspended/deletion=deny' result;

SET request.jwt.claim.sub='aa100001-0000-4000-8000-000000000001';
SAVEPOINT public_scenario;
SET session_replication_role=replica;
UPDATE public.public_account_launch_control SET state='open',account_registration_enabled=true,private_profile_enabled=true,school_membership_enabled=true;
SET session_replication_role=origin;
SELECT public.replace_own_school_class_history(auth.uid(),'[{"grade_number":3,"class_number":2}]') IS NOT NULL public_pass;
ROLLBACK TO public_scenario;
SELECT class_history_audit.expect_denied(auth.uid());
SELECT 'PUBLIC_ACCESS_ALLOW_AND_CLOSED_DENY_PASS' result;

SET session_replication_role=replica;
INSERT INTO public.beta_invites(id,program_id,token_hash,expires_at,created_by)
VALUES('dd000001-0000-4000-8000-000000000001','cc000001-0000-4000-8000-000000000001',repeat('d',64),now()+interval '1 day','local-test');
INSERT INTO public.beta_onboarding_invite_claims(program_id,invite_id,user_id,target_school_id,expires_at)
VALUES('cc000001-0000-4000-8000-000000000001','dd000001-0000-4000-8000-000000000001',auth.uid(),'aa000001-0000-4000-8000-000000000001',now()+interval '1 hour');
SET session_replication_role=origin;
DO $$ BEGIN
  ASSERT public.has_beta_onboarding_access(auth.uid(),'school_membership'), 'claimed fixture';
  PERFORM public.replace_own_school_class_history(auth.uid(),'[{"grade_number":1,"class_number":2}]');
END $$;
SAVEPOINT claim_scenario;
SET session_replication_role=replica;
UPDATE public.beta_onboarding_invite_claims SET target_school_id='aa000001-0000-4000-8000-000000000002';
SET session_replication_role=origin;
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO claim_scenario;
SET session_replication_role=replica;
UPDATE public.beta_onboarding_invite_claims SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour';
SET session_replication_role=origin;
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO claim_scenario;
SET session_replication_role=replica;
UPDATE public.beta_onboarding_invite_claims SET status='consumed',consumed_at=now();
SET session_replication_role=origin;
SELECT class_history_audit.expect_denied(auth.uid());
ROLLBACK TO claim_scenario;
SELECT 'ONBOARDING_EXACT_ALLOW_MISMATCH_EXPIRED_CONSUMED_DENY_PASS' result;
DO $$ DECLARE b relation_baseline%ROWTYPE; BEGIN
  SELECT * INTO b FROM relation_baseline;
  ASSERT (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.connection_requests r) IS NOT DISTINCT FROM b.requests;
  ASSERT (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.connections r) IS NOT DISTINCT FROM b.connections;
  ASSERT (SELECT count(*) FROM public.connection_messages)=b.messages;
  ASSERT (SELECT count(*) FROM public.connection_instagram_permissions)=b.instagram;
  ASSERT (SELECT count(*) FROM public.notifications)=b.notifications;
END $$;
SELECT 'RELATION_AND_NOTIFICATION_BASELINE_PRESERVED' result;
ROLLBACK;
