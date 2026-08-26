\set ON_ERROR_STOP on

CREATE SCHEMA phase10u_audit;
CREATE TABLE phase10u_audit.matrix (
  scenario integer PRIMARY KEY,
  state text NOT NULL,
  http_status integer NOT NULL,
  match_token boolean NOT NULL,
  browser_identity_fields text NOT NULL,
  db_mutation integer NOT NULL,
  timing_class text NOT NULL
);
CREATE TABLE phase10u_audit.concurrency_fixture(match_token uuid NOT NULL);

CREATE OR REPLACE FUNCTION phase10u_audit.assert(condition boolean, message text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'PHASE10U_ASSERT: %', message; END IF;
END;
$$;

INSERT INTO public.schools(id,school_name,school_type,slug) VALUES
  (md5('phase10u-school-a')::uuid,'PHASE10U SCHOOL A','high','phase10u-school-a'),
  (md5('phase10u-school-b')::uuid,'PHASE10U SCHOOL B','high','phase10u-school-b');

SELECT public.admin_set_public_account_launch_state('internal_test','PHASE10U_DISPOSABLE_SETUP','phase10u:audit');
UPDATE public.beta_programs
SET status='active',starts_at=now()-interval '1 day',ends_at=now()+interval '1 day',emergency_disabled_at=NULL
WHERE program_key='limited_beta_2026';

CREATE OR REPLACE FUNCTION phase10u_audit.create_google_account(
  number integer, display_name text, school_id uuid, graduation_year integer
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  account_user_id uuid := ('00000000-0000-4000-8000-' || lpad(number::text,12,'0'))::uuid;
  beta_program_id uuid;
BEGIN
  INSERT INTO auth.users(id,email,raw_app_meta_data,created_at,updated_at)
  VALUES(account_user_id,'phase10u-'||number||'@example.invalid',
    '{"provider":"custom:schoollove-google","providers":["custom:schoollove-google"]}'::jsonb,now(),now());
  INSERT INTO auth.identities(id,user_id,provider,identity_data)
  VALUES('phase10u-google-'||number,account_user_id,'custom:schoollove-google',jsonb_build_object('sub','phase10u-'||number));
  PERFORM set_config('request.jwt.claim.sub',account_user_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM public.admin_complete_own_adult_eligibility(account_user_id,'phase10b-2026-07-28');
  PERFORM public.record_own_required_consents('phase10b-2026-07-28');
  PERFORM public.upsert_own_private_profile(display_name,'','');
  PERFORM public.add_own_school_membership(school_id,graduation_year,NULL);
  SELECT id INTO beta_program_id FROM public.beta_programs WHERE program_key='limited_beta_2026';
  INSERT INTO public.beta_members(program_id,user_id,status,target_school_id,reviewed_at,reviewed_by,reason_code)
  VALUES(beta_program_id,account_user_id,'active',school_id,now(),'phase10u:audit','DISPOSABLE_AUDIT')
  ON CONFLICT(program_id,user_id) DO UPDATE SET status='active',target_school_id=excluded.target_school_id;
END;
$$;

DO $$
DECLARE index integer; school_a uuid:=md5('phase10u-school-a')::uuid; school_b uuid:=md5('phase10u-school-b')::uuid;
BEGIN
  FOR index IN 1..50 LOOP
    PERFORM phase10u_audit.create_google_account(
      index,
      CASE WHEN index % 2 = 1 THEN 'Actor'||lpad(((index+1)/2)::text,2,'0') ELSE 'Target'||lpad((index/2)::text,2,'0') END,
      CASE WHEN index=19 THEN school_a ELSE school_b END,
      CASE WHEN index=21 THEN 2000 ELSE 2005 END
    );
  END LOOP;
END $$;

-- Duplicate scenario: a second active target with the same exact authority tuple.
UPDATE public.private_profiles SET display_name='Target03'
WHERE owner_user_id='00000000-0000-4000-8000-000000000035';

CREATE OR REPLACE FUNCTION phase10u_audit.capture(
  scenario_number integer, actor_number integer, target_school uuid, target_year integer, target_name text
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  actor_id uuid:=('00000000-0000-4000-8000-'||lpad(actor_number::text,12,'0'))::uuid;
  before_count integer; after_count integer; result record;
BEGIN
  SELECT count(*) INTO before_count FROM public.connection_match_tokens;
  SELECT * INTO result FROM public.find_exact_private_profile_match(actor_id,target_school,target_year,target_name);
  SELECT count(*) INTO after_count FROM public.connection_match_tokens;
  INSERT INTO phase10u_audit.matrix VALUES(
    scenario_number,result.match_state,200,result.match_token IS NOT NULL,
    CASE WHEN result.match_token IS NULL THEN 'state' ELSE 'state,matchToken' END,
    after_count-before_count,'PADDED_MIN_250MS_AT_ROUTE'
  );
END;
$$;

-- Scenario-specific authority states.
INSERT INTO public.user_blocks(blocker_user_id,blocked_user_id) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000009'),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012');
INSERT INTO public.safety_account_restrictions(user_id,status)
VALUES('00000000-0000-4000-8000-000000000014','suspended');
UPDATE public.private_profiles SET status='hidden'
WHERE owner_user_id='00000000-0000-4000-8000-000000000016';
DELETE FROM public.profile_school_memberships
WHERE owner_user_id='00000000-0000-4000-8000-000000000018';

INSERT INTO public.connection_requests(sender_user_id,receiver_user_id,target_school_membership_id,relationship_type,message,status,responded_at)
SELECT actor,receiver,membership,'same_school','과거 안부',status,now() FROM (VALUES
 ('00000000-0000-4000-8000-000000000025'::uuid,'00000000-0000-4000-8000-000000000026'::uuid,'declined'),
 ('00000000-0000-4000-8000-000000000027'::uuid,'00000000-0000-4000-8000-000000000028'::uuid,'not_the_person'),
 ('00000000-0000-4000-8000-000000000029'::uuid,'00000000-0000-4000-8000-000000000030'::uuid,'blocked'),
 ('00000000-0000-4000-8000-000000000031'::uuid,'00000000-0000-4000-8000-000000000032'::uuid,'reported'),
 ('00000000-0000-4000-8000-000000000033'::uuid,'00000000-0000-4000-8000-000000000034'::uuid,'accepted')
) fixture(actor,receiver,status)
CROSS JOIN LATERAL (SELECT id membership FROM public.profile_school_memberships WHERE owner_user_id=receiver LIMIT 1) target;
INSERT INTO public.user_blocks(blocker_user_id,blocked_user_id) VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000029'),
 ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000031');
INSERT INTO public.safety_reports(reporter_user_id,reported_user_id,request_id,reason_code)
SELECT receiver_user_id,sender_user_id,id,'privacy' FROM public.connection_requests
WHERE sender_user_id='00000000-0000-4000-8000-000000000031';
INSERT INTO public.connections(request_id,user_low_id,user_high_id)
SELECT id,LEAST(sender_user_id,receiver_user_id),GREATEST(sender_user_id,receiver_user_id)
FROM public.connection_requests WHERE sender_user_id='00000000-0000-4000-8000-000000000033';

-- The mandated 17-scenario enumeration matrix.
SELECT phase10u_audit.capture(1,1,md5('phase10u-school-b')::uuid,2005,'Target01');
SELECT phase10u_audit.capture(2,3,md5('phase10u-school-b')::uuid,2005,'Nobody');
SELECT phase10u_audit.capture(3,5,md5('phase10u-school-b')::uuid,2005,'Target03');
SELECT phase10u_audit.capture(4,7,md5('phase10u-school-b')::uuid,2005,'Actor04');
SELECT phase10u_audit.capture(5,9,md5('phase10u-school-b')::uuid,2005,'Target05');
SELECT phase10u_audit.capture(6,11,md5('phase10u-school-b')::uuid,2005,'Target06');
SELECT phase10u_audit.capture(7,13,md5('phase10u-school-b')::uuid,2005,'Target07');
SELECT phase10u_audit.capture(8,15,md5('phase10u-school-b')::uuid,2005,'Target08');
SELECT phase10u_audit.capture(9,17,md5('phase10u-school-b')::uuid,2005,'Target09');
SELECT phase10u_audit.capture(10,19,md5('phase10u-school-b')::uuid,2005,'Target10');
SELECT phase10u_audit.capture(11,21,md5('phase10u-school-b')::uuid,2005,'Target11');
SELECT phase10u_audit.capture(12,23,md5('phase10u-school-b')::uuid,2005,'Target12');
SELECT phase10u_audit.capture(13,25,md5('phase10u-school-b')::uuid,2005,'Target13');
SELECT phase10u_audit.capture(14,27,md5('phase10u-school-b')::uuid,2005,'Target14');
SELECT phase10u_audit.capture(15,29,md5('phase10u-school-b')::uuid,2005,'Target15');
SELECT phase10u_audit.capture(16,31,md5('phase10u-school-b')::uuid,2005,'Target16');
SELECT phase10u_audit.capture(17,33,md5('phase10u-school-b')::uuid,2005,'Target17');

SELECT phase10u_audit.assert(count(*)=17,'enumeration matrix count') FROM phase10u_audit.matrix;
SELECT phase10u_audit.assert((SELECT state FROM phase10u_audit.matrix WHERE scenario=1)='match_available','exact target');
SELECT phase10u_audit.assert((SELECT state FROM phase10u_audit.matrix WHERE scenario=2)='not_found','no target');
SELECT phase10u_audit.assert((SELECT state FROM phase10u_audit.matrix WHERE scenario=3)='not_found','duplicate ambiguity');
SELECT phase10u_audit.assert((SELECT state FROM phase10u_audit.matrix WHERE scenario=4)='not_found','self search');
SELECT phase10u_audit.assert((SELECT count(*) FROM phase10u_audit.matrix WHERE scenario IN (5,6) AND state='request_unavailable')=2,'block oracle');
SELECT phase10u_audit.assert((SELECT state FROM phase10u_audit.matrix WHERE scenario=7)='not_found','suspended target');
SELECT phase10u_audit.assert((SELECT count(*) FROM phase10u_audit.matrix WHERE scenario IN (8,9) AND state='not_found')=2,'deleted target authority');
SELECT phase10u_audit.assert((SELECT state FROM phase10u_audit.matrix WHERE scenario=10)='match_available','cross-school exact search allowed');
SELECT phase10u_audit.assert((SELECT count(*) FROM phase10u_audit.matrix WHERE scenario IN (11,12) AND state='match_available')=2,'same-school year independence');
SELECT phase10u_audit.assert((SELECT count(*) FROM phase10u_audit.matrix WHERE scenario BETWEEN 13 AND 16 AND state='request_unavailable')=4,'terminal pair non-reopen');
SELECT phase10u_audit.assert((SELECT state FROM phase10u_audit.matrix WHERE scenario=17)='already_connected','connected state');

-- Token binding, replay and target-membership invalidation.
DO $$
DECLARE matched record; first_request record; replay record; wrong_actor record; expired_request record; membership_id uuid;
BEGIN
  SELECT * INTO matched FROM public.find_exact_private_profile_match(
    '00000000-0000-4000-8000-000000000037',md5('phase10u-school-b')::uuid,2005,'Target19');
  SELECT * INTO wrong_actor FROM public.create_connection_request(
    '00000000-0000-4000-8000-000000000039',matched.match_token,'same_school','안녕하세요');
  PERFORM phase10u_audit.assert(NOT wrong_actor.created,'token requester binding');
  SELECT * INTO first_request FROM public.create_connection_request(
    '00000000-0000-4000-8000-000000000037',matched.match_token,'same_school','안녕하세요');
  SELECT * INTO replay FROM public.create_connection_request(
    '00000000-0000-4000-8000-000000000037',matched.match_token,'same_school','다시 안녕하세요');
  PERFORM phase10u_audit.assert(first_request.created AND NOT replay.created,'token replay blocked');
  PERFORM phase10u_audit.assert(NOT EXISTS(SELECT 1 FROM public.connection_match_tokens WHERE id=matched.match_token),'raw token not persisted');

  SELECT * INTO matched FROM public.find_exact_private_profile_match(
    '00000000-0000-4000-8000-000000000039',md5('phase10u-school-b')::uuid,2005,'Target20');
  SELECT id INTO membership_id FROM public.profile_school_memberships
  WHERE owner_user_id='00000000-0000-4000-8000-000000000040';
  DELETE FROM public.profile_school_memberships WHERE id=membership_id;
  PERFORM phase10u_audit.assert(NOT EXISTS(
    SELECT 1 FROM public.connection_match_tokens
    WHERE token_hash=encode(extensions.digest(convert_to(matched.match_token::text,'UTF8'),'sha256'),'hex')
  ),'target membership deletion invalidates token');

  SELECT * INTO matched FROM public.find_exact_private_profile_match(
    '00000000-0000-4000-8000-000000000003',md5('phase10u-school-b')::uuid,2005,'Target02');
  UPDATE public.connection_match_tokens SET expires_at=now()-interval '1 second'
  WHERE token_hash=encode(extensions.digest(convert_to(matched.match_token::text,'UTF8'),'sha256'),'hex');
  SELECT * INTO expired_request FROM public.create_connection_request(
    '00000000-0000-4000-8000-000000000003',matched.match_token,'same_school','안녕하세요');
  PERFORM phase10u_audit.assert(NOT expired_request.created AND expired_request.request_state='unavailable',
    'expired token rejected');
END $$;

-- Deletion-pending actors and targets remain discoverable, and response acceptance
-- does not recheck the sender's current eligibility.
DO $$
DECLARE matched record; requested record; responded record;
BEGIN
  INSERT INTO public.account_deletion_requests(user_id,reason,status)
  VALUES('00000000-0000-4000-8000-000000000047',NULL,'pending');
  SELECT * INTO matched FROM public.find_exact_private_profile_match(
    '00000000-0000-4000-8000-000000000047',md5('phase10u-school-b')::uuid,2005,'Target24');
  PERFORM phase10u_audit.assert(matched.match_state='match_available','deletion-pending actor can search');
  SELECT * INTO requested FROM public.create_connection_request(
    '00000000-0000-4000-8000-000000000047',matched.match_token,'same_school','안녕하세요');
  PERFORM phase10u_audit.assert(requested.created,'deletion-pending actor can create request');
  INSERT INTO public.safety_account_restrictions(user_id,status)
  VALUES('00000000-0000-4000-8000-000000000047','suspended');
  SELECT * INTO responded FROM public.respond_connection_request(
    '00000000-0000-4000-8000-000000000048',requested.request_id,'accept',NULL);
  PERFORM phase10u_audit.assert(responded.handled AND responded.request_state='accepted',
    'response acceptance does not recheck sender eligibility');

  INSERT INTO public.account_deletion_requests(user_id,reason,status)
  VALUES('00000000-0000-4000-8000-000000000050',NULL,'pending');
  SELECT * INTO matched FROM public.find_exact_private_profile_match(
    '00000000-0000-4000-8000-000000000049',md5('phase10u-school-b')::uuid,2005,'Target25');
  PERFORM phase10u_audit.assert(matched.match_state='match_available','deletion-pending target can be found');
  DELETE FROM public.private_profiles
  WHERE owner_user_id='00000000-0000-4000-8000-000000000050';
  PERFORM phase10u_audit.assert(NOT EXISTS(
    SELECT 1 FROM public.connection_match_tokens
    WHERE token_hash=encode(extensions.digest(convert_to(matched.match_token::text,'UTF8'),'sha256'),'hex')
  ),'target profile deletion invalidates token through membership cascade');
END $$;

-- Requester membership is not rechecked after token issuance.
DO $$
DECLARE matched record; requested record;
BEGIN
  SELECT * INTO matched FROM public.find_exact_private_profile_match(
    '00000000-0000-4000-8000-000000000043',md5('phase10u-school-b')::uuid,2005,'Target22');
  DELETE FROM public.profile_school_memberships WHERE owner_user_id='00000000-0000-4000-8000-000000000043';
  SELECT * INTO requested FROM public.create_connection_request(
    '00000000-0000-4000-8000-000000000043',matched.match_token,'same_school','안녕하세요');
  PERFORM phase10u_audit.assert(requested.created,'requester membership loss still allows request');
END $$;

-- IDOR denial and response eligibility recheck evidence.
DO $$
DECLARE target_request_id uuid; target_connection_id uuid; result record;
BEGIN
  SELECT id INTO target_request_id FROM public.connection_requests
  WHERE sender_user_id='00000000-0000-4000-8000-000000000033';
  SELECT id INTO target_connection_id FROM public.connections WHERE request_id=target_request_id;
  SELECT * INTO result FROM public.respond_connection_request(
    '00000000-0000-4000-8000-000000000001',target_request_id,'decline',NULL);
  PERFORM phase10u_audit.assert(NOT result.handled,'third-party request response IDOR');
  PERFORM phase10u_audit.assert(public.send_connection_message(
    '00000000-0000-4000-8000-000000000001',target_connection_id,'침입') IS NULL,'third-party message IDOR');
  PERFORM phase10u_audit.assert(NOT public.disconnect_connection(
    '00000000-0000-4000-8000-000000000001',target_connection_id),'third-party disconnect IDOR');
  PERFORM phase10u_audit.assert(NOT public.block_connection_user(
    '00000000-0000-4000-8000-000000000001',target_connection_id),'third-party block IDOR');
  PERFORM phase10u_audit.assert(NOT public.report_connection_safety(
    '00000000-0000-4000-8000-000000000001',target_connection_id,NULL,'privacy'),'third-party report IDOR');
  PERFORM phase10u_audit.assert(NOT public.set_connection_instagram_permission(
    '00000000-0000-4000-8000-000000000001',target_connection_id,true),'third-party Instagram IDOR');
END $$;

-- A public emergency does not currently stop beta-authorized discovery/request writes.
SELECT public.admin_set_public_account_launch_state('emergency_stopped','PHASE10U_EMERGENCY_PROBE','phase10u:audit');
DO $$
DECLARE matched record; requested record;
BEGIN
  SELECT * INTO matched FROM public.find_exact_private_profile_match(
    '00000000-0000-4000-8000-000000000041',md5('phase10u-school-b')::uuid,2005,'Target21');
  PERFORM phase10u_audit.assert(matched.match_state='match_available','public emergency search write allowed');
  SELECT * INTO requested FROM public.create_connection_request(
    '00000000-0000-4000-8000-000000000041',matched.match_token,'same_school','긴급 중단 중 안부');
  PERFORM phase10u_audit.assert(requested.created,'public emergency request write allowed');
END $$;

-- RLS/grants and direct authenticated write denial.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'connection_match_tokens','connection_requests','connections','connection_messages','user_blocks',
    'safety_reports','connection_instagram_permissions','notifications','safety_account_restrictions'
  ] LOOP
    PERFORM phase10u_audit.assert(EXISTS(
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=table_name AND c.relrowsecurity AND c.relforcerowsecurity
    ),'RLS/FORCE '||table_name);
    PERFORM phase10u_audit.assert(NOT has_table_privilege('anon','public.'||table_name,'INSERT,UPDATE,DELETE'),'anon write '||table_name);
    PERFORM phase10u_audit.assert(NOT has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE'),'authenticated write '||table_name);
  END LOOP;
  PERFORM phase10u_audit.assert(NOT has_function_privilege('authenticated','public.find_exact_private_profile_match(uuid,uuid,integer,text)','EXECUTE'),'authenticated search RPC direct execute');
  PERFORM phase10u_audit.assert(NOT has_function_privilege('authenticated','public.create_connection_request(uuid,uuid,text,text)','EXECUTE'),'authenticated request RPC direct execute');
END $$;

-- Fresh raw token exists only inside this disposable container for the two-session race.
INSERT INTO phase10u_audit.concurrency_fixture(match_token)
SELECT match_token FROM public.find_exact_private_profile_match(
  '00000000-0000-4000-8000-000000000045',md5('phase10u-school-b')::uuid,2005,'Target23'
) WHERE match_state='match_available';

SELECT scenario,state,http_status,match_token,browser_identity_fields,db_mutation,timing_class
FROM phase10u_audit.matrix ORDER BY scenario;
SELECT 'PHASE10U_DISPOSABLE_AUDIT_OK scenarios=17 google_bound_users=50 cross_school=allowed public_emergency=write_allowed replay=blocked rls=forced idor=blocked' AS status;
