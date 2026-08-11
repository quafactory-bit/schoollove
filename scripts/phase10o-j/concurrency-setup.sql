SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE OR REPLACE FUNCTION pg_temp.phase10oj_race_subject(d bytea) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'slb:v1:k01:google:'||translate(rtrim(encode(d,'base64'),'='),'+/','-_') $$;
CREATE OR REPLACE FUNCTION pg_temp.phase10oj_race_attempt() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; v uuid:=gen_random_uuid(); account uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid(); d bytea:=decode(repeat('31',32),'hex');
BEGIN
  a:=public.create_social_login_attempt('att_10oj_race_consume_01','google',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity(a,'google',pg_temp.phase10oj_race_subject(d),d,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_J_RACE_SETUP'; END IF;
  PERFORM 1 FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v,account,d,1,decode(repeat('a1',17),'hex'),decode(repeat('a2',12),'hex'),1,decode(repeat('a3',32),'hex'),1);
  PERFORM public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=v));
  IF (SELECT outcome FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('a3',32),'hex')))<>'ACCOUNT_DECIDED' THEN RAISE EXCEPTION 'PHASE10O_J_RACE_DECISION'; END IF;
  INSERT INTO auth.users(id,email) VALUES(auth_id,NULL); PERFORM public.bind_social_auth_principal(account,auth_id);
  IF (SELECT outcome FROM public.create_broker_authorization_code(a,'a1000000-0000-4000-8000-000000000099',decode(repeat('32',32),'hex'),'race-client','https://auth.invalid/race',repeat('C',43),1800000000,NULL,NULL,NULL,NULL))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_J_RACE_ISSUE'; END IF;
  RETURN a;
END $$;
SELECT pg_temp.phase10oj_race_attempt();
