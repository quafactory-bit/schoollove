\set ON_ERROR_STOP on

CREATE SCHEMA phase10v_audit;
CREATE TABLE phase10v_audit.matrix(scenario integer PRIMARY KEY,name text NOT NULL,passed boolean NOT NULL);
CREATE TABLE phase10v_audit.concurrency_fixture(match_token uuid NOT NULL);
CREATE TABLE phase10v_audit.emergency_token(value uuid NOT NULL);
CREATE TABLE phase10v_audit.emergency_requests(kind text PRIMARY KEY,id uuid NOT NULL);

CREATE OR REPLACE FUNCTION phase10v_audit.assert(condition boolean,message text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'PHASE10V_ASSERT: %',message; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION phase10v_audit.record(scenario_number integer,scenario_name text,condition boolean)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM phase10v_audit.assert(condition,scenario_name);
  INSERT INTO phase10v_audit.matrix VALUES(scenario_number,scenario_name,true);
END;
$$;

INSERT INTO public.schools(id,school_name,school_type,slug) VALUES
  (md5('phase10v-school-a')::uuid,'PHASE10V SCHOOL A','high','phase10v-school-a'),
  (md5('phase10v-school-b')::uuid,'PHASE10V SCHOOL B','high','phase10v-school-b');
SELECT public.admin_set_public_account_launch_state('internal_test','PHASE10V_DISPOSABLE_SETUP','phase10v:audit');
UPDATE public.beta_programs SET status='active',starts_at=now()-interval '1 day',ends_at=now()+interval '1 day',emergency_disabled_at=NULL
WHERE program_key='limited_beta_2026';
UPDATE public.beta_feature_flags SET enabled=true,updated_at=now()
WHERE program_id IS NULL AND user_id IS NULL AND feature_key IN ('people_search','connection_request');

CREATE OR REPLACE FUNCTION phase10v_audit.create_google_account(number integer,display_name text,school_id uuid,graduation_year integer)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE account_user_id uuid:=('00000000-0000-4000-8000-'||lpad(number::text,12,'0'))::uuid;beta_program_id uuid;
BEGIN
  INSERT INTO auth.users(id,email,raw_app_meta_data,created_at,updated_at)
  VALUES(account_user_id,'phase10v-'||number||'@example.invalid','{"provider":"custom:schoollove-google","providers":["custom:schoollove-google"]}'::jsonb,now(),now());
  INSERT INTO auth.identities(id,user_id,provider,identity_data)
  VALUES('phase10v-google-'||number,account_user_id,'custom:schoollove-google',jsonb_build_object('sub','phase10v-'||number));
  PERFORM set_config('request.jwt.claim.sub',account_user_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM public.admin_complete_own_adult_eligibility(account_user_id,'phase10b-2026-07-28');
  PERFORM public.record_own_required_consents('phase10b-2026-07-28');
  PERFORM public.upsert_own_private_profile(display_name,'','');
  PERFORM public.add_own_school_membership(school_id,graduation_year,NULL);
  SELECT id INTO beta_program_id FROM public.beta_programs WHERE program_key='limited_beta_2026';
  INSERT INTO public.beta_members(program_id,user_id,status,target_school_id,reviewed_at,reviewed_by,reason_code)
  VALUES(beta_program_id,account_user_id,'active',school_id,now(),'phase10v:audit','DISPOSABLE_AUDIT')
  ON CONFLICT(program_id,user_id) DO UPDATE SET status='active',target_school_id=excluded.target_school_id;
END;
$$;

DO $$
DECLARE index integer;school_a uuid:=md5('phase10v-school-a')::uuid;school_b uuid:=md5('phase10v-school-b')::uuid;
BEGIN
  FOR index IN 1..76 LOOP
    PERFORM phase10v_audit.create_google_account(index,
      CASE WHEN index%2=1 THEN 'Actor'||lpad(((index+1)/2)::text,2,'0') ELSE 'Target'||lpad((index/2)::text,2,'0') END,
      CASE WHEN index=19 THEN school_a ELSE school_b END,
      CASE WHEN index=21 THEN 2000 ELSE 2005 END);
  END LOOP;
END $$;
UPDATE public.private_profiles SET display_name='Target03' WHERE owner_user_id='00000000-0000-4000-8000-000000000075';

CREATE OR REPLACE FUNCTION phase10v_audit.capture_search(
  scenario_number integer,scenario_name text,actor_number integer,target_school uuid,target_year integer,target_name text,expect_match boolean
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor_id uuid:=('00000000-0000-4000-8000-'||lpad(actor_number::text,12,'0'))::uuid;result record;
BEGIN
  SELECT * INTO result FROM public.find_exact_private_profile_match(actor_id,target_school,target_year,target_name);
  PERFORM phase10v_audit.record(scenario_number,scenario_name,
    CASE WHEN expect_match THEN result.match_state='match_available' AND result.match_token IS NOT NULL
      ELSE result.match_state='unavailable' AND result.match_token IS NULL END);
END;
$$;

INSERT INTO public.user_blocks(blocker_user_id,blocked_user_id) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000009'),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012');
INSERT INTO public.safety_account_restrictions(user_id,status) VALUES('00000000-0000-4000-8000-000000000014','suspended');
UPDATE public.private_profiles SET status='hidden' WHERE owner_user_id='00000000-0000-4000-8000-000000000016';
DELETE FROM public.profile_school_memberships WHERE owner_user_id='00000000-0000-4000-8000-000000000018';

INSERT INTO public.connection_requests(sender_user_id,receiver_user_id,target_school_membership_id,relationship_type,message,status,responded_at)
SELECT actor,receiver,membership,'same_school','과거 안부',status,now() FROM (VALUES
 ('00000000-0000-4000-8000-000000000025'::uuid,'00000000-0000-4000-8000-000000000026'::uuid,'declined'),
 ('00000000-0000-4000-8000-000000000027'::uuid,'00000000-0000-4000-8000-000000000028'::uuid,'not_the_person'),
 ('00000000-0000-4000-8000-000000000029'::uuid,'00000000-0000-4000-8000-000000000030'::uuid,'blocked'),
 ('00000000-0000-4000-8000-000000000031'::uuid,'00000000-0000-4000-8000-000000000032'::uuid,'reported'),
 ('00000000-0000-4000-8000-000000000033'::uuid,'00000000-0000-4000-8000-000000000034'::uuid,'accepted')
) fixture(actor,receiver,status)
CROSS JOIN LATERAL(SELECT id membership FROM public.profile_school_memberships WHERE owner_user_id=receiver LIMIT 1) target;
INSERT INTO public.user_blocks(blocker_user_id,blocked_user_id) VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000029'),
 ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000031');
INSERT INTO public.safety_reports(reporter_user_id,reported_user_id,request_id,reason_code)
SELECT receiver_user_id,sender_user_id,id,'privacy' FROM public.connection_requests WHERE sender_user_id='00000000-0000-4000-8000-000000000031';
INSERT INTO public.connections(request_id,user_low_id,user_high_id)
SELECT id,LEAST(sender_user_id,receiver_user_id),GREATEST(sender_user_id,receiver_user_id)
FROM public.connection_requests WHERE sender_user_id='00000000-0000-4000-8000-000000000033';

SELECT phase10v_audit.capture_search(1,'same_school_exact_target',1,md5('phase10v-school-b')::uuid,2005,'Target01',true);
SELECT phase10v_audit.capture_search(2,'no_target_generic',3,md5('phase10v-school-b')::uuid,2005,'Nobody',false);
SELECT phase10v_audit.capture_search(3,'duplicate_generic',5,md5('phase10v-school-b')::uuid,2005,'Target03',false);
SELECT phase10v_audit.capture_search(4,'self_generic',7,md5('phase10v-school-b')::uuid,2005,'Actor04',false);
SELECT phase10v_audit.capture_search(5,'target_blocked_actor_generic',9,md5('phase10v-school-b')::uuid,2005,'Target05',false);
SELECT phase10v_audit.capture_search(6,'actor_blocked_target_generic',11,md5('phase10v-school-b')::uuid,2005,'Target06',false);
SELECT phase10v_audit.capture_search(7,'target_suspended_generic',13,md5('phase10v-school-b')::uuid,2005,'Target07',false);
SELECT phase10v_audit.capture_search(8,'target_hidden_generic',15,md5('phase10v-school-b')::uuid,2005,'Target08',false);
SELECT phase10v_audit.capture_search(9,'target_membership_deleted_generic',17,md5('phase10v-school-b')::uuid,2005,'Target09',false);
SELECT phase10v_audit.capture_search(10,'cross_school_generic',19,md5('phase10v-school-b')::uuid,2005,'Target10',false);
SELECT phase10v_audit.capture_search(11,'same_school_different_actor_year',21,md5('phase10v-school-b')::uuid,2005,'Target11',true);
SELECT phase10v_audit.capture_search(12,'same_school_same_year',23,md5('phase10v-school-b')::uuid,2005,'Target12',true);
SELECT phase10v_audit.capture_search(13,'previous_decline_generic',25,md5('phase10v-school-b')::uuid,2005,'Target13',false);
SELECT phase10v_audit.capture_search(14,'previous_wrong_person_generic',27,md5('phase10v-school-b')::uuid,2005,'Target14',false);
SELECT phase10v_audit.capture_search(15,'previous_block_generic',29,md5('phase10v-school-b')::uuid,2005,'Target15',false);
SELECT phase10v_audit.capture_search(16,'previous_report_generic',31,md5('phase10v-school-b')::uuid,2005,'Target16',false);
SELECT phase10v_audit.capture_search(17,'already_connected_generic',33,md5('phase10v-school-b')::uuid,2005,'Target17',false);

DO $$
DECLARE matched record;requested record;reminder_request_id uuid;
BEGIN
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000037',md5('phase10v-school-b')::uuid,2005,'Target19');
  INSERT INTO phase10v_audit.emergency_token VALUES(matched.match_token);
  INSERT INTO public.connection_requests (
    sender_user_id,receiver_user_id,target_school_membership_id,
    relationship_type,message,sent_at,created_at,updated_at
  )
  SELECT
    '00000000-0000-4000-8000-000000000039',
    '00000000-0000-4000-8000-000000000040',
    membership.id,'same_school','안녕하세요',
    now()-interval '8 days',now()-interval '8 days',now()-interval '8 days'
  FROM public.profile_school_memberships membership
  WHERE membership.owner_user_id='00000000-0000-4000-8000-000000000040'
  RETURNING id INTO reminder_request_id;
  INSERT INTO phase10v_audit.emergency_requests VALUES('reminder',reminder_request_id);
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000041',md5('phase10v-school-b')::uuid,2005,'Target21');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000041',matched.match_token,'same_school','안녕하세요');INSERT INTO phase10v_audit.emergency_requests VALUES('accept',requested.request_id);
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000043',md5('phase10v-school-b')::uuid,2005,'Target22');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000043',matched.match_token,'same_school','안녕하세요');INSERT INTO phase10v_audit.emergency_requests VALUES('decline',requested.request_id);
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000045',md5('phase10v-school-b')::uuid,2005,'Target23');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000045',matched.match_token,'same_school','안녕하세요');INSERT INTO phase10v_audit.emergency_requests VALUES('wrong',requested.request_id);
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000047',md5('phase10v-school-b')::uuid,2005,'Target24');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000047',matched.match_token,'same_school','안녕하세요');INSERT INTO phase10v_audit.emergency_requests VALUES('block',requested.request_id);
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000049',md5('phase10v-school-b')::uuid,2005,'Target25');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000049',matched.match_token,'same_school','안녕하세요');INSERT INTO phase10v_audit.emergency_requests VALUES('report',requested.request_id);
END $$;

SELECT public.admin_set_public_account_launch_state('emergency_stopped','PHASE10V_EMERGENCY_PROBE','phase10v:audit');
DO $$
DECLARE matched record;requested record;responded record;token uuid;request_id uuid;
BEGIN
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000035',md5('phase10v-school-b')::uuid,2005,'Target18');
  PERFORM phase10v_audit.record(18,'emergency_search_blocked',matched.match_state='unavailable' AND matched.match_token IS NULL);
  SELECT value INTO token FROM phase10v_audit.emergency_token;
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000037',token,'same_school','안녕하세요');
  PERFORM phase10v_audit.record(19,'emergency_request_blocked',NOT requested.created);
  SELECT id INTO request_id FROM phase10v_audit.emergency_requests WHERE kind='reminder';
  PERFORM phase10v_audit.record(20,'emergency_reminder_blocked',NOT public.remind_connection_request('00000000-0000-4000-8000-000000000039',request_id));
  SELECT id INTO request_id FROM phase10v_audit.emergency_requests WHERE kind='accept';
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000042',request_id,'accept',NULL);PERFORM phase10v_audit.record(21,'emergency_accept_blocked',NOT responded.handled);
  SELECT id INTO request_id FROM phase10v_audit.emergency_requests WHERE kind='decline';
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000044',request_id,'decline',NULL);PERFORM phase10v_audit.record(22,'emergency_decline_allowed',responded.handled AND responded.request_state='declined');
  SELECT id INTO request_id FROM phase10v_audit.emergency_requests WHERE kind='wrong';
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000046',request_id,'not_the_person',NULL);PERFORM phase10v_audit.record(23,'emergency_wrong_person_allowed',responded.handled AND responded.request_state='not_the_person');
  SELECT id INTO request_id FROM phase10v_audit.emergency_requests WHERE kind='block';
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000048',request_id,'block',NULL);PERFORM phase10v_audit.record(24,'emergency_block_allowed',responded.handled AND responded.request_state='blocked');
  SELECT id INTO request_id FROM phase10v_audit.emergency_requests WHERE kind='report';
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000050',request_id,'report','privacy');PERFORM phase10v_audit.record(25,'emergency_report_allowed',responded.handled AND responded.request_state='reported');
END $$;
SELECT public.admin_set_public_account_launch_state('closed','PHASE10V_EMERGENCY_REVIEWED','phase10v:audit');
SELECT public.admin_set_public_account_launch_state('internal_test','PHASE10V_DISPOSABLE_RESUME','phase10v:audit');

DO $$
DECLARE matched record;requested record;responded record;decline_id uuid;block_id uuid;report_id uuid;
BEGIN
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000051',md5('phase10v-school-b')::uuid,2005,'Target26');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000051',matched.match_token,'same_school','안녕하세요');decline_id:=requested.request_id;
  UPDATE public.beta_feature_flags SET enabled=false WHERE program_id IS NULL AND user_id IS NULL AND feature_key='people_search';
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000052',decline_id,'decline',NULL);PERFORM phase10v_audit.record(26,'people_search_off_pending_decline_allowed',responded.handled);
  UPDATE public.beta_feature_flags SET enabled=true WHERE program_id IS NULL AND user_id IS NULL AND feature_key='people_search';
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000053',md5('phase10v-school-b')::uuid,2005,'Target27');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000053',matched.match_token,'same_school','안녕하세요');block_id:=requested.request_id;
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000055',md5('phase10v-school-b')::uuid,2005,'Target28');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000055',matched.match_token,'same_school','안녕하세요');report_id:=requested.request_id;
  UPDATE public.beta_feature_flags SET enabled=false WHERE program_id IS NULL AND user_id IS NULL AND feature_key='connection_request';
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000054',block_id,'block',NULL);PERFORM phase10v_audit.assert(responded.handled,'feature off block');
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000056',report_id,'report','privacy');PERFORM phase10v_audit.record(27,'connection_request_off_block_report_allowed',responded.handled);
  UPDATE public.beta_feature_flags SET enabled=true WHERE program_id IS NULL AND user_id IS NULL AND feature_key='connection_request';
END $$;

DO $$
DECLARE matched record;requested record;responded record;presented_hash text;used_count integer;
BEGIN
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000057',md5('phase10v-school-b')::uuid,2005,'Target29');
  presented_hash:=encode(extensions.digest(convert_to(matched.match_token::text,'UTF8'),'sha256'),'hex');
  DELETE FROM public.profile_school_memberships WHERE owner_user_id='00000000-0000-4000-8000-000000000057';
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000057',matched.match_token,'same_school','안녕하세요');
  SELECT count(*) INTO used_count FROM public.connection_match_tokens token WHERE token.token_hash=presented_hash AND token.used_at IS NOT NULL;
  PERFORM phase10v_audit.record(28,'requester_membership_loss_blocks_and_consumes',NOT requested.created AND used_count=1);
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000059',md5('phase10v-school-b')::uuid,2005,'Target30');
  presented_hash:=encode(extensions.digest(convert_to(matched.match_token::text,'UTF8'),'sha256'),'hex');
  INSERT INTO public.account_deletion_requests(user_id,reason,status) VALUES('00000000-0000-4000-8000-000000000059',NULL,'pending');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000059',matched.match_token,'same_school','안녕하세요');
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000059',md5('phase10v-school-b')::uuid,2005,'Target30');
  SELECT count(*) INTO used_count FROM public.connection_match_tokens token WHERE token.token_hash=presented_hash AND token.used_at IS NOT NULL;
  PERFORM phase10v_audit.record(29,'requester_deletion_blocks_search_request',NOT requested.created AND matched.match_state='unavailable' AND used_count=1);
  INSERT INTO public.account_deletion_requests(user_id,reason,status) VALUES('00000000-0000-4000-8000-000000000063',NULL,'pending');
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000062',md5('phase10v-school-b')::uuid,2005,'Actor32');
  PERFORM phase10v_audit.record(30,'target_deletion_pending_no_token',matched.match_state='unavailable' AND matched.match_token IS NULL);
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000064',md5('phase10v-school-b')::uuid,2005,'Actor33');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000064',matched.match_token,'same_school','안녕하세요');
  INSERT INTO public.safety_account_restrictions(user_id,status) VALUES('00000000-0000-4000-8000-000000000064','suspended');
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000065',requested.request_id,'accept',NULL);PERFORM phase10v_audit.record(31,'sender_suspended_before_accept_blocked',NOT responded.handled);
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000066',md5('phase10v-school-b')::uuid,2005,'Actor34');
  SELECT * INTO requested FROM public.create_connection_request('00000000-0000-4000-8000-000000000066',matched.match_token,'same_school','안녕하세요');
  INSERT INTO public.account_deletion_requests(user_id,reason,status) VALUES('00000000-0000-4000-8000-000000000067',NULL,'pending');
  SELECT * INTO responded FROM public.respond_connection_request('00000000-0000-4000-8000-000000000067',requested.request_id,'accept',NULL);PERFORM phase10v_audit.record(32,'receiver_deletion_before_accept_blocked',NOT responded.handled);
END $$;

UPDATE public.beta_feature_flags SET enabled=false WHERE program_id IS NULL AND user_id IS NULL AND feature_key='instagram_permission';
SELECT phase10v_audit.record(33,'instagram_feature_off_authority',NOT public.has_beta_feature_access('00000000-0000-4000-8000-000000000068','instagram_permission'));
DO $$
DECLARE value text;
BEGIN
  FOREACH value IN ARRAY ARRAY['https://example.com','example.kr','hello@example.com','010-1234-5678','010 1234 5678','0 1 0 1 2 3 4 5 6 7 8','@friend','@friend,','@friend.','@friend!','@friend?','(@friend_name)','[@friend_name]','{@friend_name}','카카오 아이디 friend12','카카오톡 아이디 friend12','카톡 아이디 friend12','인스타 아이디 friend12','인스타그램 아이디 friend12','k a k a o id friend12','Instagram: friend12','Ｉｎｓｔａｇｒａｍ： friend12','example dot kr','https:'||chr(8203)||'//example.com'] LOOP
    PERFORM phase10v_audit.assert(NOT public.connection_text_is_safe(value,200),'unsafe greeting accepted: '||value);
  END LOOP;
  PERFORM phase10v_audit.assert(public.connection_text_is_safe('나 완이야. 오랜만이야.',200),'safe natural greeting rejected');
  PERFORM phase10v_audit.assert(public.connection_text_is_safe('우리 3학년 2반이었지?',200),'safe numeric punctuation greeting rejected');
  PERFORM phase10v_audit.record(34,'greeting_obfuscation_sql_parity',public.connection_text_is_safe('우리 @ 기호도 썼었지.',200));
END $$;

DO $$
DECLARE matched record;first_request record;replay record;wrong_actor record;target_request uuid;target_connection uuid;response record;
BEGIN
  SELECT * INTO matched FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000068',md5('phase10v-school-b')::uuid,2005,'Actor35');
  SELECT * INTO wrong_actor FROM public.create_connection_request('00000000-0000-4000-8000-000000000070',matched.match_token,'same_school','안녕하세요');
  PERFORM phase10v_audit.assert(NOT wrong_actor.created,'wrong actor denied');
  SELECT * INTO first_request FROM public.create_connection_request('00000000-0000-4000-8000-000000000068',matched.match_token,'same_school','안녕하세요');
  SELECT * INTO replay FROM public.create_connection_request('00000000-0000-4000-8000-000000000068',matched.match_token,'same_school','안녕하세요');
  PERFORM phase10v_audit.assert(first_request.created AND NOT replay.created,'replay denied');
  SELECT id INTO target_request FROM public.connection_requests WHERE sender_user_id='00000000-0000-4000-8000-000000000033';
  SELECT id INTO target_connection FROM public.connections WHERE request_id=target_request;
  SELECT * INTO response FROM public.respond_connection_request('00000000-0000-4000-8000-000000000001',target_request,'decline',NULL);
  PERFORM phase10v_audit.assert(NOT response.handled,'request response IDOR');
  PERFORM phase10v_audit.assert(NOT public.disconnect_connection('00000000-0000-4000-8000-000000000001',target_connection),'disconnect IDOR');
  PERFORM phase10v_audit.assert(NOT public.block_connection_user('00000000-0000-4000-8000-000000000001',target_connection),'block IDOR');
  PERFORM phase10v_audit.assert(NOT public.report_connection_safety('00000000-0000-4000-8000-000000000001',target_connection,NULL,'privacy'),'report IDOR');
END $$;

DO $$
DECLARE table_name text;signature text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['connection_match_tokens','connection_requests','connections','connection_messages','user_blocks','safety_reports','connection_instagram_permissions','notifications','safety_account_restrictions'] LOOP
    PERFORM phase10v_audit.assert(EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=table_name AND c.relrowsecurity AND c.relforcerowsecurity),'RLS/FORCE '||table_name);
    PERFORM phase10v_audit.assert(NOT has_table_privilege('anon','public.'||table_name,'INSERT,UPDATE,DELETE'),'anon write '||table_name);
    PERFORM phase10v_audit.assert(NOT has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE'),'authenticated write '||table_name);
  END LOOP;
  FOREACH signature IN ARRAY ARRAY['public.find_exact_private_profile_match(uuid,uuid,integer,text)','public.create_connection_request(uuid,uuid,text,text)','public.remind_connection_request(uuid,uuid)','public.respond_connection_request(uuid,uuid,text,text)'] LOOP
    PERFORM phase10v_audit.assert(NOT has_function_privilege('anon',signature,'EXECUTE'),'anon execute '||signature);
    PERFORM phase10v_audit.assert(NOT has_function_privilege('authenticated',signature,'EXECUTE'),'authenticated execute '||signature);
    PERFORM phase10v_audit.assert(has_function_privilege('service_role',signature,'EXECUTE'),'service execute '||signature);
  END LOOP;
END $$;

INSERT INTO phase10v_audit.concurrency_fixture(match_token)
SELECT match_token FROM public.find_exact_private_profile_match('00000000-0000-4000-8000-000000000073',md5('phase10v-school-b')::uuid,2005,'Target37')
WHERE match_state='match_available';
SELECT phase10v_audit.assert(count(*)=34,'required scenario count') FROM phase10v_audit.matrix;
SELECT scenario,name,passed FROM phase10v_audit.matrix ORDER BY scenario;
SELECT 'PHASE10V_DISPOSABLE_AUDIT_OK scenarios=34 google_bound_users=76 replay=blocked rls=forced idor=blocked' AS status;
