-- PHASE 10O-J isolated lifecycle: all durable broker-code transitions use RPCs.
SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE OR REPLACE FUNCTION pg_temp.phase10oj_subject(provider_name text, digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_') $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10oj_account_decided(safe_id text, digest_value bytea, bind_principal boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; v uuid:=gen_random_uuid(); reserved uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid(); outcome text; s text;
BEGIN
  s:=pg_temp.phase10oj_subject('google',digest_value);
  a:=public.create_social_login_attempt(safe_id,'google',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity(a,'google',s,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_J_ATTEMPT_SETUP'; END IF;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v,reserved,digest_value,1,decode(repeat('a1',17),'hex'),decode(repeat('a2',12),'hex'),1,decode(repeat('a3',32),'hex'),1) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=v))<>'RECOVERY_DELIVERY_SENT' THEN RAISE EXCEPTION 'PHASE10O_J_DELIVERY_SETUP'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('a3',32),'hex')) x;
  IF outcome<>'ACCOUNT_DECIDED' THEN RAISE EXCEPTION 'PHASE10O_J_DECISION_SETUP'; END IF;
  IF bind_principal THEN
    INSERT INTO auth.users(id,email) VALUES(auth_id,NULL);
    IF NOT public.bind_social_auth_principal(reserved,auth_id) THEN RAISE EXCEPTION 'PHASE10O_J_BIND_SETUP'; END IF;
  END IF;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10oj_issue(a uuid, code_id uuid, digest_hex text, client text DEFAULT 'client-a', redirect text DEFAULT 'https://auth.invalid/cb', challenge text DEFAULT repeat('A',43))
RETURNS text LANGUAGE sql AS $$
  SELECT outcome FROM public.create_broker_authorization_code(a,code_id,decode(digest_hex,'hex'),client,redirect,challenge,floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL)
$$;

DO $$
DECLARE a uuid; before_rows integer; outcome text; code uuid:='a1000000-0000-4000-8000-000000000001';
BEGIN
  a:=pg_temp.phase10oj_account_decided('att_10oj_new_bound_0001',decode(repeat('11',32),'hex'));
  IF pg_temp.phase10oj_issue(a,code,repeat('21',32))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_J_NEW_ISSUE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE id=code AND state='ready' AND expires_at<=created_at+interval '60 seconds')
    OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'broker_code_ready' THEN RAISE EXCEPTION 'PHASE10O_J_NEW_STATE'; END IF;
  SELECT count(*) INTO before_rows FROM private.broker_authorization_codes;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('ff',32),'hex'),'client-a','https://auth.invalid/cb',repeat('A',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_REJECTED' OR (SELECT count(*) FROM private.broker_authorization_codes)<>before_rows THEN RAISE EXCEPTION 'PHASE10O_J_UNKNOWN_MUTATED'; END IF;
END $$;
SELECT 'PHASE10O_J_NEW_USER_AUTH_BOUND_CODE_OK' AS status;

DO $$
DECLARE a uuid; c uuid:='a1000000-0000-4000-8000-000000000002'; outcome text;
BEGIN
  a:=pg_temp.phase10oj_account_decided('att_10oj_wrong_client_0001',decode(repeat('12',32),'hex'));
  IF pg_temp.phase10oj_issue(a,c,repeat('22',32))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_J_WRONG_CLIENT_SETUP'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('22',32),'hex'),'wrong-client','https://auth.invalid/cb',repeat('A',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE id=c AND state='rejected' AND rejected_at IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='failed_safe' AND coarse_terminal_reason='failed_safe') THEN RAISE EXCEPTION 'PHASE10O_J_CLIENT_NOT_TERMINAL'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('22',32),'hex'),'client-a','https://auth.invalid/cb',repeat('A',43)) x;
  IF outcome<>'REPLAY_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='failed_safe' AND coarse_terminal_reason='failed_safe') THEN RAISE EXCEPTION 'PHASE10O_J_TERMINAL_REUSE'; END IF;
END $$;
SELECT 'PHASE10O_J_BINDING_FAILURE_TERMINALIZES_ATTEMPT_OK' AS status;

DO $$
DECLARE a uuid; c uuid:='a1000000-0000-4000-8000-000000000003'; outcome text;
BEGIN
  a:=pg_temp.phase10oj_account_decided('att_10oj_valid_consume_0001',decode(repeat('13',32),'hex'));
  IF pg_temp.phase10oj_issue(a,c,repeat('23',32),'client-b','https://auth.invalid/return',repeat('B',43))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_J_CONSUME_SETUP'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('23',32),'hex'),'client-b','https://auth.invalid/return',repeat('B',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_CONSUMED' OR NOT EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE id=c AND state='consumed' AND consumed_at IS NOT NULL)
    OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'consumed' THEN RAISE EXCEPTION 'PHASE10O_J_CONSUME_STATE'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('23',32),'hex'),'client-b','https://auth.invalid/return',repeat('B',43)) x;
  IF outcome<>'REPLAY_REJECTED' THEN RAISE EXCEPTION 'PHASE10O_J_REPLAY'; END IF;
END $$;
SELECT 'PHASE10O_J_SUCCESS_AND_REPLAY_OK' AS status;

DO $$
DECLARE a uuid; c uuid:='a1000000-0000-4000-8000-000000000004'; outcome text;
BEGIN
  a:=pg_temp.phase10oj_account_decided('att_10oj_expired_0001',decode(repeat('14',32),'hex'));
  IF pg_temp.phase10oj_issue(a,c,repeat('24',32))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_J_EXPIRED_SETUP'; END IF;
  UPDATE private.broker_authorization_codes SET created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE id=c;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('24',32),'hex'),'client-a','https://auth.invalid/cb',repeat('A',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE id=c AND state='expired' AND rejected_at IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='expired' AND coarse_terminal_reason='expired') THEN RAISE EXCEPTION 'PHASE10O_J_EXPIRED_NOT_TERMINAL'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('24',32),'hex'),'client-a','https://auth.invalid/cb',repeat('A',43)) x;
  IF outcome<>'REPLAY_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='expired') THEN RAISE EXCEPTION 'PHASE10O_J_EXPIRED_REPLAY'; END IF;
END $$;
SELECT 'PHASE10O_J_EXPIRY_TERMINALIZES_ATTEMPT_OK' AS status;

DO $$
DECLARE a uuid; before_codes integer; before_state text; future_rejected boolean:=false; negative_rejected boolean:=false;
BEGIN
  a:=pg_temp.phase10oj_account_decided('att_10oj_future_auth_0001',decode(repeat('18',32),'hex'));
  SELECT count(*),(SELECT state FROM private.oauth_login_attempts WHERE id=a) INTO before_codes,before_state FROM private.broker_authorization_codes;
  BEGIN
    PERFORM public.create_broker_authorization_code(a,'a1000000-0000-4000-8000-000000000008',decode(repeat('28',32),'hex'),'client-a','https://auth.invalid/cb',repeat('A',43),floor(extract(epoch FROM clock_timestamp()))::bigint+60,NULL,NULL,NULL,NULL);
  EXCEPTION WHEN OTHERS THEN future_rejected:=SQLERRM LIKE '%BROKER_AUTHORIZATION_CODE_ISSUE_REJECTED%'; END;
  BEGIN
    PERFORM public.create_broker_authorization_code(a,'a1000000-0000-4000-8000-000000000009',decode(repeat('29',32),'hex'),'client-a','https://auth.invalid/cb',repeat('A',43),-1,NULL,NULL,NULL,NULL);
  EXCEPTION WHEN OTHERS THEN negative_rejected:=SQLERRM LIKE '%BROKER_AUTHORIZATION_CODE_ISSUE_REJECTED%'; END;
  IF NOT future_rejected OR NOT negative_rejected OR (SELECT count(*) FROM private.broker_authorization_codes)<>before_codes
    OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>before_state OR EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='broker_code_ready') THEN RAISE EXCEPTION 'PHASE10O_J_FUTURE_AUTH_TIME_FAIL_OPEN'; END IF;
END $$;
SELECT 'PHASE10O_J_FUTURE_AUTH_TIME_REJECTED_OK' AS status;

DO $$
DECLARE a uuid; c uuid:='a1000000-0000-4000-8000-000000000010'; outcome text;
BEGIN
  a:=pg_temp.phase10oj_account_decided('att_10oj_near_expiry_0001',decode(repeat('19',32),'hex'));
  UPDATE private.oauth_login_attempts SET expires_at=clock_timestamp()+interval '1 millisecond' WHERE id=a;
  SELECT pg_temp.phase10oj_issue(a,c,repeat('2a',32)) INTO outcome;
  IF outcome='AUTHORIZATION_CODE_CREATED' THEN
    IF NOT EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE id=c AND created_at<expires_at AND expires_at<=created_at+interval '60 seconds') THEN RAISE EXCEPTION 'PHASE10O_J_NEAR_EXPIRY_INVALID_ROW'; END IF;
  ELSIF outcome='AUTHORIZATION_CODE_EXPIRED' THEN
    IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='expired' AND coarse_terminal_reason='expired') THEN RAISE EXCEPTION 'PHASE10O_J_NEAR_EXPIRY_NOT_TERMINAL'; END IF;
  ELSE RAISE EXCEPTION 'PHASE10O_J_NEAR_EXPIRY_RAW_OUTCOME %',outcome;
  END IF;
END $$;
SELECT 'PHASE10O_J_NEAR_EXPIRY_COARSE_OK' AS status;

DO $$
DECLARE a uuid; c uuid; outcome text;
BEGIN
  a:=pg_temp.phase10oj_account_decided('att_10oj_redirect_0001',decode(repeat('1a',32),'hex')); c:='a1000000-0000-4000-8000-000000000011';
  IF pg_temp.phase10oj_issue(a,c,repeat('2b',32))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_J_REDIRECT_SETUP'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('2b',32),'hex'),'client-a','https://auth.invalid/wrong',repeat('A',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='failed_safe') THEN RAISE EXCEPTION 'PHASE10O_J_REDIRECT_TERMINAL'; END IF;
  a:=pg_temp.phase10oj_account_decided('att_10oj_pkce_00000001',decode(repeat('1b',32),'hex')); c:='a1000000-0000-4000-8000-000000000012';
  IF pg_temp.phase10oj_issue(a,c,repeat('2c',32))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_J_PKCE_SETUP'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('2c',32),'hex'),'client-a','https://auth.invalid/cb',repeat('Z',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='failed_safe') THEN RAISE EXCEPTION 'PHASE10O_J_PKCE_TERMINAL'; END IF;
END $$;
SELECT 'PHASE10O_J_REDIRECT_PKCE_TERMINAL_OK' AS status;

DO $$
DECLARE unbound uuid; active_attempt uuid; existing_match uuid; active_account uuid; active_subject text; active_digest bytea:=decode(repeat('15',32),'hex'); rejected boolean:=false;
BEGIN
  unbound:=pg_temp.phase10oj_account_decided('att_10oj_unbound_0001',decode(repeat('16',32),'hex'),false);
  BEGIN PERFORM pg_temp.phase10oj_issue(unbound,'a1000000-0000-4000-8000-000000000005',repeat('25',32)); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%BROKER_AUTHORIZATION_CODE_ISSUE_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_J_ACCOUNT_DECIDED_ISSUED'; END IF;
  active_attempt:=pg_temp.phase10oj_account_decided('att_10oj_existing_primary_seed',active_digest);
  SELECT account_id,broker_subject INTO active_account,active_subject FROM private.oauth_login_attempts WHERE id=active_attempt;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET status='active',activated_at=clock_timestamp() WHERE id=active_account;
  UPDATE private.social_identity_registry SET status='active',activated_at=clock_timestamp() WHERE account_id=active_account;
  existing_match:=public.create_social_login_attempt('att_10oj_existing_primary_001','google',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity(existing_match,'google',active_subject,active_digest,1)<>'EXISTING_PRIMARY' OR pg_temp.phase10oj_issue(existing_match,'a1000000-0000-4000-8000-000000000006',repeat('26',32))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_J_EXISTING_PRIMARY'; END IF;
  existing_match:=public.create_social_login_attempt('att_10oj_existing_match_0001','google',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity(existing_match,'google',pg_temp.phase10oj_subject('google',decode(repeat('17',32),'hex')),decode(repeat('17',32),'hex'),1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_J_EXISTING_MATCH_SETUP'; END IF;
  -- account activation recovery match is intentionally not code-eligible.
  INSERT INTO private.recovery_email_verifications(id,login_attempt_id,purpose,recovery_email_hmac,hmac_key_version,destination_ciphertext,destination_nonce,encryption_key_version,otp_mac,otp_key_version,created_at,expires_at,status,reserved_account_id)
  VALUES(gen_random_uuid(),existing_match,'login_decision',active_digest,1,decode(repeat('a1',17),'hex'),decode(repeat('a2',12),'hex'),1,decode(repeat('a3',32),'hex'),1,clock_timestamp(),clock_timestamp()+interval '5 minutes','pending',gen_random_uuid());
  INSERT INTO private.recovery_delivery_attempts(verification_id,login_attempt_id,recovery_email_hmac,hmac_key_version,state,sent_at) SELECT id,login_attempt_id,recovery_email_hmac,hmac_key_version,'sent',clock_timestamp() FROM private.recovery_email_verifications WHERE login_attempt_id=existing_match;
  IF (SELECT x.outcome FROM public.consume_recovery_and_decide_social_account(existing_match,(SELECT id FROM private.recovery_email_verifications WHERE login_attempt_id=existing_match),decode(repeat('a3',32),'hex')) x)<>'USE_PRIMARY_PROVIDER' THEN RAISE EXCEPTION 'PHASE10O_J_EXISTING_MATCH_DECISION'; END IF;
  rejected:=false; BEGIN PERFORM pg_temp.phase10oj_issue(existing_match,'a1000000-0000-4000-8000-000000000007',repeat('27',32)); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%BROKER_AUTHORIZATION_CODE_ISSUE_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_J_EXISTING_MATCH_ISSUED'; END IF;
END $$;
SELECT 'PHASE10O_J_ISSUE_STATE_MATRIX_OK' AS status;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='private' AND table_name='broker_authorization_codes' AND column_name IN ('authorization_code','raw_code','code_verifier','raw_nonce','nonce_plaintext','email','token')) THEN
    RAISE EXCEPTION 'PHASE10O_J_RAW_SECRET_COLUMN';
  END IF;
END $$;
SELECT 'PHASE10O_J_RAW_CODE_NONCE_PLAINTEXT_ZERO' AS status;
