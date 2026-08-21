SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.phase10p_expiry_subject(provider_value text,digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'slb:v1:k01:'||provider_value||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_')
$$;

CREATE OR REPLACE FUNCTION pg_temp.phase10p_prepare_callback_claimed(
  safe_id text, provider_value text, transaction_id uuid, leg_id uuid,
  fixture_seed text, attempt_expiry timestamptz
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  attempt_id uuid;
  handle_digest bytea:=extensions.digest(convert_to(fixture_seed||':handle','UTF8'),'sha256');
  binding_digest bytea:=extensions.digest(convert_to(fixture_seed||':binding','UTF8'),'sha256');
  state_digest bytea:=extensions.digest(convert_to(fixture_seed||':state','UTF8'),'sha256');
  outcome text;
BEGIN
  attempt_id:=public.create_social_login_attempt(safe_id,provider_value,attempt_expiry);
  SELECT x.outcome INTO outcome FROM public.create_downstream_authorization_transaction(
    transaction_id,attempt_id,handle_digest,'slb-supabase-'||provider_value,
    'https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('A',43),'S256',
    'nonce-'||fixture_seed,'state-'||fixture_seed,attempt_expiry
  ) x;
  IF outcome<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_FIXTURE_TX'; END IF;
  SELECT x.outcome INTO outcome FROM public.claim_downstream_authorization_transaction_by_handle(handle_digest) x;
  IF outcome<>'TRANSACTION_CLAIMED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_FIXTURE_CLAIM'; END IF;
  PERFORM public.create_upstream_login_leg(
    attempt_id,leg_id,provider_value,binding_digest,state_digest,
    CASE WHEN provider_value='naver' THEN NULL ELSE extensions.digest(convert_to(fixture_seed||':nonce','UTF8'),'sha256') END,
    CASE WHEN provider_value='naver' THEN NULL ELSE repeat('B',43) END,
    CASE WHEN provider_value='naver' THEN NULL ELSE substring(extensions.digest(convert_to(fixture_seed||':ciphertext','UTF8'),'sha256') FROM 1 FOR 17) END,
    CASE WHEN provider_value='naver' THEN NULL ELSE substring(extensions.digest(convert_to(fixture_seed||':cipher-nonce','UTF8'),'sha256') FROM 1 FOR 12) END,
    CASE WHEN provider_value='naver' THEN NULL ELSE 1 END
  );
  IF public.bind_downstream_authorization_transaction_upstream_leg(transaction_id,leg_id)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_FIXTURE_BIND'; END IF;
  SELECT x.outcome INTO outcome FROM public.claim_upstream_login_callback_by_state(provider_value,binding_digest,state_digest) x;
  IF outcome<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_FIXTURE_CALLBACK'; END IF;
  RETURN attempt_id;
END $$;

DO $$
DECLARE
  old_attempt uuid; new_attempt uuid; old_leg uuid; new_leg uuid; old_tx uuid; new_tx uuid;
  verification_id uuid; reserved_account_id uuid; delivery_id uuid;
  digest_value bytea; subject_value text; outcome text; rejected boolean:=false;
  terminal_failed uuid; terminal_expired uuid; terminal_failed_subject text; terminal_expired_subject text;
BEGIN
  -- TEST 1 / 7 / 8: exact real-world stale recovery_pending regression.
  digest_value:=decode(repeat('11',32),'hex'); subject_value:=pg_temp.phase10p_expiry_subject('google',digest_value);
  old_tx:='62000000-0000-4000-8000-000000000001'; old_leg:='62000000-0000-4000-8000-000000000002';
  verification_id:='62000000-0000-4000-8000-000000000003'; reserved_account_id:='62000000-0000-4000-8000-000000000004';
  old_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_real_old_01','google',old_tx,old_leg,'t1-old',clock_timestamp()+interval '2 seconds');
  IF public.record_verified_social_identity_from_upstream_leg(old_attempt,old_leg,'google',subject_value,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_REAL_OLD_IDENTITY'; END IF;
  SELECT x.outcome,x.delivery_id INTO outcome,delivery_id FROM public.create_and_reserve_login_attempt_recovery_delivery(
    old_attempt,verification_id,reserved_account_id,decode(repeat('12',32),'hex'),1,
    decode(repeat('13',17),'hex'),decode(repeat('14',12),'hex'),1,decode(repeat('15',32),'hex'),1
  ) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent(delivery_id)<>'RECOVERY_DELIVERY_SENT' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_REAL_DELIVERY'; END IF;
  UPDATE private.downstream_authorization_transactions
    SET continuation_handle_digest=decode(repeat('16',32),'hex')
    WHERE id=old_tx AND status='upstream_bound';
  IF NOT FOUND THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_REAL_CONTINUATION_FIXTURE'; END IF;
  PERFORM pg_sleep(2.2);
  new_tx:='62000000-0000-4000-8000-000000000011'; new_leg:='62000000-0000-4000-8000-000000000012';
  new_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_real_new_01','google',new_tx,new_leg,'t1-new',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity_from_upstream_leg(new_attempt,new_leg,'google',subject_value,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_REAL_NEW_IDENTITY'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=old_attempt AND state='expired' AND coarse_terminal_reason='expired')
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=new_attempt AND state='recovery_required')
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=old_leg AND status='verified')
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=new_leg AND status='verified')
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=old_tx AND status='expired' AND broker_handle_digest IS NULL AND continuation_handle_digest IS NULL AND downstream_nonce IS NULL AND downstream_state IS NULL AND terminal_at IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications v WHERE v.id=verification_id AND v.status='expired' AND v.recovery_email_hmac IS NULL AND v.hmac_key_version IS NULL AND v.destination_ciphertext IS NULL AND v.destination_nonce IS NULL AND v.encryption_key_version IS NULL AND v.otp_mac IS NULL AND v.otp_key_version IS NULL AND v.reserved_account_id IS NULL)
    OR NOT EXISTS(SELECT 1 FROM private.recovery_delivery_attempts WHERE id=delivery_id AND state='sent' AND sent_at IS NOT NULL)
    OR (SELECT count(*) FROM private.oauth_login_attempts WHERE broker_subject=subject_value AND state IN ('upstream_verified','recovery_required','recovery_pending','recovery_verified'))<>1
  THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_REAL_INVARIANT'; END IF;

  -- TEST 2: a genuinely live recovery_pending owner is never displaced.
  digest_value:=decode(repeat('21',32),'hex'); subject_value:=pg_temp.phase10p_expiry_subject('google',digest_value);
  old_tx:='62000000-0000-4000-8000-000000000021'; old_leg:='62000000-0000-4000-8000-000000000022';
  verification_id:='62000000-0000-4000-8000-000000000023'; reserved_account_id:='62000000-0000-4000-8000-000000000024';
  old_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_live_old_01','google',old_tx,old_leg,'t2-old',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity_from_upstream_leg(old_attempt,old_leg,'google',subject_value,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_LIVE_OLD'; END IF;
  SELECT x.outcome,x.delivery_id INTO outcome,delivery_id FROM public.create_and_reserve_login_attempt_recovery_delivery(
    old_attempt,verification_id,reserved_account_id,decode(repeat('22',32),'hex'),1,
    decode(repeat('23',17),'hex'),decode(repeat('24',12),'hex'),1,decode(repeat('25',32),'hex'),1
  ) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_LIVE_RESERVE'; END IF;
  new_tx:='62000000-0000-4000-8000-000000000031'; new_leg:='62000000-0000-4000-8000-000000000032';
  new_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_live_new_01','google',new_tx,new_leg,'t2-new',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity_from_upstream_leg(new_attempt,new_leg,'google',subject_value,digest_value,1)<>'IDENTITY_DECISION_IN_PROGRESS' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_LIVE_OUTCOME'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=old_attempt AND state='recovery_pending' AND expires_at>clock_timestamp())
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=new_attempt AND state='failed_safe')
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=new_tx AND status='rejected' AND broker_handle_digest IS NULL AND continuation_handle_digest IS NULL AND downstream_nonce IS NULL AND downstream_state IS NULL)
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=new_leg AND status='rejected')
    OR NOT EXISTS(SELECT 1 FROM private.recovery_delivery_attempts WHERE id=delivery_id AND state='reserved')
  THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_LIVE_INVARIANT'; END IF;

  -- TEST 4: expired recovery_required without a verification releases safely.
  digest_value:=decode(repeat('31',32),'hex'); subject_value:=pg_temp.phase10p_expiry_subject('naver',digest_value);
  old_tx:='62000000-0000-4000-8000-000000000041'; old_leg:='62000000-0000-4000-8000-000000000042';
  old_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_required_old','naver',old_tx,old_leg,'t4-old',clock_timestamp()+interval '2 seconds');
  IF public.record_verified_social_identity_from_upstream_leg(old_attempt,old_leg,'naver',subject_value,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_REQUIRED_OLD'; END IF;
  PERFORM pg_sleep(2.2);
  new_tx:='62000000-0000-4000-8000-000000000051'; new_leg:='62000000-0000-4000-8000-000000000052';
  new_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_required_new','naver',new_tx,new_leg,'t4-new',clock_timestamp()+interval '10 minutes');
  outcome:=public.record_verified_social_identity_from_upstream_leg(new_attempt,new_leg,'naver',subject_value,digest_value,1);
  IF outcome<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_REQUIRED_OUTCOME %',outcome; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=old_attempt AND state='expired') THEN
    RAISE EXCEPTION 'PHASE10P_EXPIRY_REQUIRED_OLD_NOT_EXPIRED';
  END IF;
  IF EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE login_attempt_id=old_attempt) THEN
    RAISE EXCEPTION 'PHASE10P_EXPIRY_REQUIRED_UNEXPECTED_VERIFICATION';
  END IF;

  -- TEST 5: the historically modelled but atomically unreachable
  -- recovery_verified state expires without creating or resurrecting accounts.
  digest_value:=decode(repeat('41',32),'hex'); subject_value:=pg_temp.phase10p_expiry_subject('kakao',digest_value);
  old_tx:='62000000-0000-4000-8000-000000000061'; old_leg:='62000000-0000-4000-8000-000000000062';
  old_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_verified_old','kakao',old_tx,old_leg,'t5-old',clock_timestamp()+interval '2 seconds');
  IF public.record_verified_social_identity_from_upstream_leg(old_attempt,old_leg,'kakao',subject_value,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_VERIFIED_OLD'; END IF;
  UPDATE private.oauth_login_attempts SET state='recovery_verified',updated_at=clock_timestamp(),version=version+1 WHERE id=old_attempt;
  PERFORM pg_sleep(2.2);
  new_tx:='62000000-0000-4000-8000-000000000071'; new_leg:='62000000-0000-4000-8000-000000000072';
  new_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_verified_new','kakao',new_tx,new_leg,'t5-new',clock_timestamp()+interval '10 minutes');
  outcome:=public.record_verified_social_identity_from_upstream_leg(new_attempt,new_leg,'kakao',subject_value,digest_value,1);
  IF outcome<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_VERIFIED_OUTCOME %',outcome; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=old_attempt AND state='expired') THEN
    RAISE EXCEPTION 'PHASE10P_EXPIRY_VERIFIED_OLD_NOT_EXPIRED';
  END IF;
  IF EXISTS(SELECT 1 FROM private.private_accounts WHERE primary_broker_subject=subject_value) THEN
    RAISE EXCEPTION 'PHASE10P_EXPIRY_VERIFIED_ACCOUNT_CREATED';
  END IF;
  IF EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject=subject_value) THEN
    RAISE EXCEPTION 'PHASE10P_EXPIRY_VERIFIED_REGISTRY_CREATED';
  END IF;

  -- TEST 6: already-terminal attempt/transaction history is immutable here.
  terminal_failed:='62000000-0000-4000-8000-000000000081'; terminal_expired:='62000000-0000-4000-8000-000000000082';
  digest_value:=decode(repeat('51',32),'hex'); terminal_failed_subject:=pg_temp.phase10p_expiry_subject('naver',digest_value);
  INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,created_at,expires_at,updated_at,coarse_terminal_reason,version)
    VALUES(terminal_failed,'att_10p_terminal_failed_01','naver','failed_safe',terminal_failed_subject,digest_value,1,clock_timestamp()-interval '4 minutes',clock_timestamp()+interval '1 minute',clock_timestamp()-interval '1 minute','failed_safe',7);
  INSERT INTO private.downstream_authorization_transactions(id,login_attempt_id,client_id,redirect_uri,response_type,requested_scopes,pkce_s256_challenge,pkce_method,status,created_at,expires_at,terminal_at,version)
    VALUES('62000000-0000-4000-8000-000000000083',terminal_failed,'terminal-client','https://consumer.invalid/callback','code','openid',repeat('C',43),'S256','rejected',clock_timestamp()-interval '3 minutes',clock_timestamp()+interval '1 minute',clock_timestamp()-interval '1 minute',3);
  digest_value:=decode(repeat('52',32),'hex'); terminal_expired_subject:=pg_temp.phase10p_expiry_subject('naver',digest_value);
  INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,created_at,expires_at,updated_at,coarse_terminal_reason,version)
    VALUES(terminal_expired,'att_10p_terminal_expired_1','naver','expired',terminal_expired_subject,digest_value,1,clock_timestamp()-interval '4 minutes',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '2 minutes','expired',9);
  INSERT INTO private.downstream_authorization_transactions(id,login_attempt_id,client_id,redirect_uri,response_type,requested_scopes,pkce_s256_challenge,pkce_method,status,created_at,expires_at,terminal_at,version)
    VALUES('62000000-0000-4000-8000-000000000084',terminal_expired,'terminal-client','https://consumer.invalid/callback','code','openid',repeat('D',43),'S256','consumed',clock_timestamp()-interval '4 minutes',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '2 minutes',4);
  IF private.expire_stale_social_identity_attempt(terminal_failed,clock_timestamp())
    OR private.expire_stale_social_identity_attempt(terminal_expired,clock_timestamp())
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=terminal_failed AND state='failed_safe' AND version=7)
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=terminal_expired AND state='expired' AND version=9)
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE login_attempt_id=terminal_failed AND status='rejected' AND version=3)
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE login_attempt_id=terminal_expired AND status='consumed' AND version=4)
  THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_TERMINAL_HISTORY'; END IF;

  -- TEST 9: the original partial unique index still rejects two live rows.
  digest_value:=decode(repeat('21',32),'hex'); subject_value:=pg_temp.phase10p_expiry_subject('google',digest_value);
  BEGIN
    INSERT INTO private.oauth_login_attempts(safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,expires_at)
      VALUES('att_10p_duplicate_live_001','google','recovery_required',subject_value,digest_value,1,clock_timestamp()+interval '5 minutes');
  EXCEPTION WHEN unique_violation THEN rejected:=true; END;
  IF NOT rejected OR to_regclass('private.oauth_login_attempts_live_subject_unique') IS NULL THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_UNIQUENESS'; END IF;

  -- TEST 10: normal first-login identity recording remains unchanged.
  digest_value:=decode(repeat('61',32),'hex'); subject_value:=pg_temp.phase10p_expiry_subject('google',digest_value);
  new_tx:='62000000-0000-4000-8000-000000000091'; new_leg:='62000000-0000-4000-8000-000000000092';
  new_attempt:=pg_temp.phase10p_prepare_callback_claimed('att_10p_expiry_normal_001','google',new_tx,new_leg,'t10-normal',clock_timestamp()+interval '10 minutes');
  outcome:=public.record_verified_social_identity_from_upstream_leg(new_attempt,new_leg,'google',subject_value,digest_value,1);
  IF outcome<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_NORMAL_OUTCOME %',outcome; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=new_attempt AND state='recovery_required') THEN
    RAISE EXCEPTION 'PHASE10P_EXPIRY_NORMAL_ATTEMPT_STATE';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=new_leg AND status='verified') THEN
    RAISE EXCEPTION 'PHASE10P_EXPIRY_NORMAL_LEG_STATE';
  END IF;
END $$;

SELECT 'PHASE10P_STALE_RECOVERY_PENDING_REPLACED_OK' AS status;
SELECT 'PHASE10P_LIVE_COMPETITOR_FAIL_CLOSED_OK' AS status;
SELECT 'PHASE10P_EXPIRED_RECOVERY_REQUIRED_RELEASED_OK' AS status;
SELECT 'PHASE10P_EXPIRED_RECOVERY_VERIFIED_NO_ACCOUNT_OK' AS status;
SELECT 'PHASE10P_TERMINAL_HISTORY_UNCHANGED_OK' AS status;
SELECT 'PHASE10P_RECOVERY_TERMINAL_SCRUB_OK' AS status;
SELECT 'PHASE10P_DOWNSTREAM_TERMINAL_SCRUB_OK' AS status;
SELECT 'PHASE10P_LIVE_SUBJECT_UNIQUENESS_PRESERVED_OK' AS status;
SELECT 'PHASE10P_FIRST_LOGIN_NORMAL_PATH_OK' AS status;
