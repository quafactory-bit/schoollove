-- Disposable schema clone only. Every fixture is rolled back; no real OAuth.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $test$
DECLARE
  test_state text; bound boolean; expected text; actual text;
  account_id uuid; user_id uuid; attempt_id uuid; transaction_id uuid; digest bytea; subject text;
BEGIN
  FOREACH test_state IN ARRAY ARRAY['closed','internal_test','ready','open','emergency_stopped'] LOOP
    FOREACH bound IN ARRAY ARRAY[false,true] LOOP
      INSERT INTO public.public_account_launch_control(control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,emergency_stopped_at,last_reason_code,updated_by)
      VALUES('public_account',test_state,test_state='open',test_state IN ('open','internal_test'),test_state IN ('open','internal_test'),CASE WHEN test_state='emergency_stopped' THEN clock_timestamp() END,'LOCAL_AUDIT','local-audit')
      ON CONFLICT(control_key) DO UPDATE SET state=EXCLUDED.state,account_registration_enabled=EXCLUDED.account_registration_enabled,private_profile_enabled=EXCLUDED.private_profile_enabled,school_membership_enabled=EXCLUDED.school_membership_enabled,emergency_stopped_at=EXCLUDED.emergency_stopped_at;
      account_id:=gen_random_uuid(); attempt_id:=gen_random_uuid(); user_id:=CASE WHEN bound THEN gen_random_uuid() END;
      digest:=extensions.digest(account_id::text,'sha256');
      subject:='slb:v1:k01:google:'||translate(rtrim(encode(digest,'base64'),'='),'+/','-_');
      IF bound THEN INSERT INTO auth.users(id) VALUES(user_id); END IF;
      INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject)
      VALUES(account_id,user_id,'provisional','google',subject);
      INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status)
      VALUES(subject,'google',digest,1,account_id,user_id,'provisional');
      INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,account_id,created_at,expires_at)
      VALUES(attempt_id,'att_'||replace(attempt_id::text,'-',''),'google','broker_code_ready',subject,digest,1,account_id,now(),now()+interval '9 minutes');
      transaction_id:=gen_random_uuid();
      INSERT INTO private.downstream_authorization_transactions(id,login_attempt_id,client_id,redirect_uri,response_type,requested_scopes,pkce_s256_challenge,pkce_method,status,expires_at,terminal_at)
      VALUES(transaction_id,attempt_id,'local-client','https://example.invalid/callback','code','openid',repeat('A',43),'S256','consumed',clock_timestamp()+interval '1 minute',clock_timestamp());
      INSERT INTO private.broker_authorization_codes(id,login_attempt_id,authorization_transaction_id,code_digest,client_id,redirect_uri,pkce_s256_challenge,authentication_time,state,expires_at)
      VALUES(gen_random_uuid(),attempt_id,transaction_id,digest,'local-client','https://example.invalid/callback',repeat('A',43),1,'ready',clock_timestamp()+interval '1 minute');
      SELECT outcome INTO actual FROM public.consume_broker_authorization_code(digest,'local-client','https://example.invalid/callback',repeat('A',43));
      expected:=CASE WHEN test_state<>'emergency_stopped' AND (bound OR test_state='open') THEN 'AUTHORIZATION_CODE_CONSUMED' ELSE 'AUTHORIZATION_CODE_REJECTED' END;
      IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'LOGIN_BOUNDARY_MISMATCH: %, bound %, %',test_state,bound,actual; END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS: 10 launch-state / existing-principal token exchange cases';
END $test$;
ROLLBACK;
