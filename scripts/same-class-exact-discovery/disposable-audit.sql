\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$$;

CREATE TABLE public.schools (id uuid PRIMARY KEY, school_type text NOT NULL);
CREATE TABLE public.public_account_launch_control (control_key text PRIMARY KEY, state text NOT NULL);
CREATE TABLE public.fixture_feature_access (user_id uuid PRIMARY KEY);
CREATE TABLE public.private_profiles (id uuid PRIMARY KEY, owner_user_id uuid NOT NULL UNIQUE, display_name text NOT NULL, status text NOT NULL);
CREATE TABLE public.profile_school_memberships (id uuid PRIMARY KEY, profile_id uuid NOT NULL, owner_user_id uuid NOT NULL, school_id uuid NOT NULL, graduation_year integer NOT NULL);
CREATE TABLE public.profile_school_class_histories (id uuid PRIMARY KEY, membership_id uuid NOT NULL, owner_user_id uuid NOT NULL, grade_number integer NOT NULL, class_number integer NOT NULL);
CREATE TABLE public.adult_eligibility_records (user_id uuid PRIMARY KEY, adult_eligible boolean NOT NULL, verification_method text NOT NULL, policy_version text NOT NULL);
CREATE TABLE public.consent_records (user_id uuid NOT NULL, consent_type text NOT NULL, consented boolean NOT NULL, policy_version text NOT NULL);
CREATE TABLE public.safety_account_restrictions (user_id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.account_deletion_requests (user_id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.user_blocks (blocker_user_id uuid NOT NULL, blocked_user_id uuid NOT NULL);
CREATE TABLE public.connections (user_low_id uuid NOT NULL, user_high_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.connection_requests (pair_low_id uuid NOT NULL, pair_high_id uuid NOT NULL);
CREATE TABLE public.connection_match_tokens (token_hash text PRIMARY KEY, requester_user_id uuid NOT NULL, receiver_user_id uuid NOT NULL, target_school_membership_id uuid NOT NULL);

CREATE OR REPLACE FUNCTION public.has_beta_feature_access(target_user_id uuid, requested_feature text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT requested_feature = 'people_search'
    AND EXISTS (SELECT 1 FROM public.fixture_feature_access WHERE user_id = target_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_current_adult_account(target_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.private_profiles WHERE owner_user_id = target_user_id AND status = 'active')
    AND EXISTS (SELECT 1 FROM public.adult_eligibility_records WHERE user_id = target_user_id AND adult_eligible AND verification_method = 'self_attestation' AND policy_version = 'phase10b-2026-07-28')
    AND NOT EXISTS (
      SELECT required_type FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required(required_type)
      WHERE NOT EXISTS (SELECT 1 FROM public.consent_records WHERE user_id = target_user_id AND consent_type = required_type AND consented AND policy_version = 'phase10b-2026-07-28')
    );
$$;

\i /tmp/same_class_exact_discovery.sql

CREATE SCHEMA same_class_audit;
CREATE OR REPLACE FUNCTION same_class_audit.assert(condition boolean, message text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'SAME_CLASS_AUDIT: %', message; END IF;
END;
$$;

INSERT INTO public.schools VALUES
  ('10000000-0000-4000-8000-000000000001','high'),
  ('10000000-0000-4000-8000-000000000002','elementary'),
  ('10000000-0000-4000-8000-000000000003','university');

CREATE OR REPLACE FUNCTION same_class_audit.add_account(user_id uuid, name text, school_id uuid, graduation_year integer, grade integer, class integer)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE profile_id uuid := extensions.uuid_generate_v4(); membership_id uuid := extensions.uuid_generate_v4();
BEGIN
  INSERT INTO public.fixture_feature_access VALUES(user_id);
  INSERT INTO public.private_profiles VALUES(profile_id,user_id,name,'active');
  INSERT INTO public.profile_school_memberships VALUES(membership_id,profile_id,user_id,school_id,graduation_year);
  INSERT INTO public.profile_school_class_histories VALUES(extensions.uuid_generate_v4(),membership_id,user_id,grade,class);
  INSERT INTO public.adult_eligibility_records VALUES(user_id,true,'self_attestation','phase10b-2026-07-28');
  INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
  SELECT user_id, consent_type, true, 'phase10b-2026-07-28'
  FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) consent_type;
END;
$$;

DO $$
DECLARE
  school_id uuid := '10000000-0000-4000-8000-000000000001';
  actor uuid := '20000000-0000-4000-8000-000000000001';
  target uuid := '20000000-0000-4000-8000-000000000002';
  duplicate uuid := '20000000-0000-4000-8000-000000000003';
  target_membership uuid;
  result record;
BEGIN
  PERFORM same_class_audit.add_account(actor,'Actor',school_id,2005,3,2);
  PERFORM same_class_audit.add_account(target,'Target',school_id,2005,3,2);
  SELECT id INTO target_membership FROM public.profile_school_memberships WHERE owner_user_id = target;

  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='match_available' AND result.match_token IS NOT NULL,'matching K12 class returns only a token');
  PERFORM same_class_audit.assert((SELECT count(*) FROM public.connection_match_tokens)=1,'existing opaque token table only');

  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,2,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'actor wrong grade unavailable');
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,3,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'actor wrong class unavailable');
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2004,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'actor wrong graduation year unavailable');
  SELECT * INTO result FROM public.find_exact_private_profile_class_match('20000000-0000-4000-8000-000000000099',school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'actor with no history unavailable');
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Missing');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'missing receiver unavailable');
  DELETE FROM public.profile_school_class_histories WHERE owner_user_id = target;
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'receiver history absent unavailable');
  INSERT INTO public.profile_school_class_histories VALUES(extensions.uuid_generate_v4(),target_membership,target,3,2);
  UPDATE public.profile_school_class_histories SET grade_number = 2 WHERE owner_user_id = target;
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'receiver wrong grade unavailable');
  UPDATE public.profile_school_class_histories SET grade_number = 3, class_number = 4 WHERE owner_user_id = target;
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'receiver wrong class unavailable');
  UPDATE public.profile_school_class_histories SET class_number = 2 WHERE owner_user_id = target;
  UPDATE public.profile_school_memberships SET school_id = '10000000-0000-4000-8000-000000000002' WHERE id = target_membership;
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'receiver wrong school unavailable');
  UPDATE public.profile_school_memberships SET school_id = '10000000-0000-4000-8000-000000000001' WHERE id = target_membership;
  UPDATE public.profile_school_memberships SET graduation_year = 2004 WHERE id = target_membership;
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'receiver wrong graduation year unavailable');
  UPDATE public.profile_school_memberships SET graduation_year = 2005 WHERE id = target_membership;
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,'10000000-0000-4000-8000-000000000003',2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'non-K12 school unavailable');

  PERFORM same_class_audit.add_account(duplicate,'Target',school_id,2005,3,2);
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'duplicate exact receiver unavailable');
  DELETE FROM public.profile_school_class_histories WHERE owner_user_id=duplicate;
  DELETE FROM public.profile_school_memberships WHERE owner_user_id=duplicate;
  DELETE FROM public.private_profiles WHERE owner_user_id=duplicate;

  INSERT INTO public.user_blocks VALUES(actor,target);
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'block unavailable');
  DELETE FROM public.user_blocks;
  INSERT INTO public.connection_requests VALUES(LEAST(actor,target),GREATEST(actor,target));
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'existing request unavailable');
  DELETE FROM public.connection_requests;
  INSERT INTO public.connections VALUES(LEAST(actor,target),GREATEST(actor,target),'active');
  SELECT * INTO result FROM public.find_exact_private_profile_class_match(actor,school_id,2005,3,2,'Target');
  PERFORM same_class_audit.assert(result.match_state='unavailable' AND result.match_token IS NULL,'active connection unavailable');
END;
$$;

DO $$
DECLARE signature text := 'public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)';
BEGIN
  PERFORM same_class_audit.assert(NOT has_function_privilege('public',signature,'EXECUTE'),'PUBLIC execute revoked');
  PERFORM same_class_audit.assert(NOT has_function_privilege('anon',signature,'EXECUTE'),'anon execute revoked');
  PERFORM same_class_audit.assert(NOT has_function_privilege('authenticated',signature,'EXECUTE'),'authenticated execute revoked');
  PERFORM same_class_audit.assert(has_function_privilege('service_role',signature,'EXECUTE'),'service_role execute granted');
END;
$$;

SELECT 'SAME_CLASS_EXACT_DISCOVERY_DISPOSABLE_AUDIT_OK' AS status;
ROLLBACK;
