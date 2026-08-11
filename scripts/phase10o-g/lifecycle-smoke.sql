SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE a uuid; v uuid; out text; provider text; acct private.private_accounts%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM private.private_accounts)<>0 OR (SELECT count(*) FROM private.social_identity_registry)<>0 THEN RAISE EXCEPTION 'PHASE10O_G_NEW_NOT_FRESH'; END IF;
  a:=public.create_social_login_attempt('att_abcdefghijklmnop','google',clock_timestamp()+interval '5 minutes');
  IF public.record_verified_social_identity(a,'google','slb:v1:k01:google:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',decode(repeat('11',32),'hex'),1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_G_NEW_UPSTREAM'; END IF;
  IF (SELECT count(*) FROM private.private_accounts)<>0 THEN RAISE EXCEPTION 'PHASE10O_G_NEW_PREACCOUNT'; END IF;
  v:=public.create_login_attempt_recovery_verification(a,decode(repeat('22',32),'hex'),1,decode(repeat('33',17),'hex'),decode(repeat('44',12),'hex'),1,decode(repeat('55',32),'hex'),1);
  SELECT outcome,primary_provider INTO out,provider FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('66',32),'hex'));
  IF out<>'OTP_REJECTED' OR (SELECT count(*) FROM private.private_accounts)<>0 THEN RAISE EXCEPTION 'PHASE10O_G_NEW_BAD_OTP'; END IF;
  SELECT outcome,primary_provider INTO out,provider FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('55',32),'hex'));
  SELECT * INTO acct FROM private.private_accounts;
  IF out<>'ACCOUNT_DECIDED' OR provider<>'google' OR acct.status<>'provisional' OR acct.auth_user_id IS NOT NULL OR (SELECT count(*) FROM private.social_identity_registry)<>1 OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'account_decided' THEN RAISE EXCEPTION 'PHASE10O_G_NEW_DECISION'; END IF;
END $$;
SELECT 'PHASE10O_G_NEW_USER_RECOVERY_FIRST_OK' AS status;

-- A verified recovery match must select the already-bound primary account.  It
-- must never attach the new provider, subject, or Auth principal.
DO $$
DECLARE old_account uuid:='a1000000-0000-4000-8000-000000000001'; a uuid; v uuid; out text; provider text;
BEGIN
  INSERT INTO auth.users(id,email) VALUES ('a1000000-0000-4000-8000-000000000002','cross-primary@example.invalid');
  INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at,activated_at)
  VALUES(old_account,'a1000000-0000-4000-8000-000000000002','active','kakao','slb:v1:k01:kakao:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',decode(repeat('71',32),'hex'),1,decode(repeat('72',17),'hex'),decode(repeat('73',12),'hex'),1,clock_timestamp(),clock_timestamp());
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status,activated_at)
  VALUES('slb:v1:k01:kakao:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC','kakao',decode(repeat('74',32),'hex'),1,old_account,'a1000000-0000-4000-8000-000000000002','active',clock_timestamp());
  a:=public.create_social_login_attempt('att_crossprovider001','google',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(a,'google','slb:v1:k01:google:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',decode(repeat('75',32),'hex'),1);
  v:=public.create_login_attempt_recovery_verification(a,decode(repeat('71',32),'hex'),1,decode(repeat('76',17),'hex'),decode(repeat('77',12),'hex'),1,decode(repeat('78',32),'hex'),1);
  SELECT outcome,primary_provider INTO out,provider FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('78',32),'hex'));
  IF out<>'USE_PRIMARY_PROVIDER' OR provider<>'kakao' OR EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject='slb:v1:k01:google:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD') OR (SELECT count(*) FROM private.private_accounts WHERE id<>old_account AND recovery_email_hmac=decode(repeat('71',32),'hex'))<>0 THEN RAISE EXCEPTION 'PHASE10O_G_CROSS_PROVIDER_LINK'; END IF;
END $$;
SELECT 'PHASE10O_G_CROSS_PROVIDER_NO_LINK_OK' AS status;

-- Same provider but a different subject is also recovery-match-only, never an alias link.
DO $$
DECLARE a uuid; v uuid; out text; provider text;
BEGIN
  a:=public.create_social_login_attempt('att_sameprovider0001','kakao',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(a,'kakao','slb:v1:k01:kakao:EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',decode(repeat('79',32),'hex'),1);
  v:=public.create_login_attempt_recovery_verification(a,decode(repeat('71',32),'hex'),1,decode(repeat('7a',17),'hex'),decode(repeat('7b',12),'hex'),1,decode(repeat('7c',32),'hex'),1);
  SELECT outcome,primary_provider INTO out,provider FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('7c',32),'hex'));
  IF out<>'USE_PRIMARY_PROVIDER' OR provider<>'kakao' OR EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject='slb:v1:k01:kakao:EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE') THEN RAISE EXCEPTION 'PHASE10O_G_SAME_PROVIDER_LINK'; END IF;
END $$;
SELECT 'PHASE10O_G_SAME_PROVIDER_DIFFERENT_SUBJECT_NO_LINK_OK' AS status;

-- The Auth principal cannot be bound before the recovery-backed account decision.
DO $$
DECLARE no_recovery uuid:='a2000000-0000-4000-8000-000000000001'; decided uuid; auth_id uuid:='a2000000-0000-4000-8000-000000000002'; rejected boolean:=false;
BEGIN
  INSERT INTO private.private_accounts(id,status,primary_provider,primary_broker_subject) VALUES(no_recovery,'provisional','naver','slb:v1:k01:naver:FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
  BEGIN PERFORM public.bind_social_auth_principal(no_recovery,auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_RECOVERY_DECISION_REQUIRED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_BIND_PRE_RECOVERY'; END IF;
  SELECT account_id INTO decided FROM private.oauth_login_attempts WHERE safe_attempt_id='att_abcdefghijklmnop';
  rejected:=false; BEGIN PERFORM public.bind_social_auth_principal(decided,auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_RECOVERY_DECISION_REQUIRED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_BIND_PRE_AUTH_USER'; END IF;
  INSERT INTO auth.users(id,email) VALUES(auth_id,'bind-order@example.invalid');
  IF NOT public.bind_social_auth_principal(decided,auth_id) THEN RAISE EXCEPTION 'PHASE10O_G_BIND_AFTER_DECISION'; END IF;
  rejected:=false; BEGIN PERFORM public.bind_social_auth_principal(decided,auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_RECOVERY_DECISION_REQUIRED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_BIND_REBIND'; END IF;
END $$;
SELECT 'PHASE10O_G_AUTH_BIND_ORDER_OK' AS status;

-- Attempt-owned recovery challenges preserve the F terminal-secret invariant and
-- are superseded, rate-limited, expired, and single-use without an account id.
DO $$
DECLARE a uuid; first_v uuid; second_v uuid; out text; i integer; expired_a uuid; expired_v uuid; once_a uuid; once_v uuid; rejected boolean:=false;
BEGIN
  a:=public.create_social_login_attempt('att_lifecyclelock001','naver',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(a,'naver','slb:v1:k01:naver:GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',decode(repeat('81',32),'hex'),1);
  first_v:=public.create_login_attempt_recovery_verification(a,decode(repeat('82',32),'hex'),1,decode(repeat('83',17),'hex'),decode(repeat('84',12),'hex'),1,decode(repeat('85',32),'hex'),1);
  second_v:=public.create_login_attempt_recovery_verification(a,decode(repeat('82',32),'hex'),1,decode(repeat('86',17),'hex'),decode(repeat('87',12),'hex'),1,decode(repeat('88',32),'hex'),1);
  IF (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'recovery_pending' OR NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=first_v AND status='revoked' AND recovery_email_hmac IS NULL AND destination_ciphertext IS NULL AND destination_nonce IS NULL AND otp_mac IS NULL) OR (SELECT count(*) FROM private.recovery_email_verifications WHERE login_attempt_id=a AND status='pending')<>1 THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_SUPERSEDE'; END IF;
  FOR i IN 1..4 LOOP SELECT outcome INTO out FROM public.consume_recovery_and_decide_social_account(a,second_v,decode(repeat('89',32),'hex')); END LOOP;
  IF out<>'OTP_REJECTED' OR (SELECT recovery_failed_attempts FROM private.oauth_login_attempts WHERE id=a)<>4 THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_PRELOCK'; END IF;
  second_v:=public.create_login_attempt_recovery_verification(a,decode(repeat('82',32),'hex'),1,decode(repeat('94',17),'hex'),decode(repeat('95',12),'hex'),1,decode(repeat('96',32),'hex'),1);
  SELECT outcome INTO out FROM public.consume_recovery_and_decide_social_account(a,second_v,decode(repeat('89',32),'hex'));
  IF out<>'LOCKED' OR NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=second_v AND status='locked' AND recovery_email_hmac IS NULL AND destination_ciphertext IS NULL AND otp_mac IS NULL) OR (SELECT recovery_failed_attempts FROM private.oauth_login_attempts WHERE id=a)<>5 THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_LOCK'; END IF;
  rejected:=false; BEGIN PERFORM public.create_login_attempt_recovery_verification(a,decode(repeat('82',32),'hex'),1,decode(repeat('97',17),'hex'),decode(repeat('98',12),'hex'),1,decode(repeat('99',32),'hex'),1); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_ATTEMPT_RECOVERY_CREATE_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_LOCK_BYPASS'; END IF;
  expired_a:=public.create_social_login_attempt('att_lifecycleexpire1','google',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(expired_a,'google','slb:v1:k01:google:HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',decode(repeat('8a',32),'hex'),1);
  expired_v:=public.create_login_attempt_recovery_verification(expired_a,decode(repeat('8b',32),'hex'),1,decode(repeat('8c',17),'hex'),decode(repeat('8d',12),'hex'),1,decode(repeat('8e',32),'hex'),1);
  UPDATE private.recovery_email_verifications SET created_at=clock_timestamp()-interval '3 minutes',expires_at=clock_timestamp()-interval '2 minutes' WHERE id=expired_v;
  SELECT outcome INTO out FROM public.consume_recovery_and_decide_social_account(expired_a,expired_v,decode(repeat('8e',32),'hex'));
  IF out<>'EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=expired_a AND state='expired' AND broker_subject IS NOT NULL AND subject_digest IS NOT NULL AND subject_key_version IS NOT NULL AND account_id IS NULL) OR NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=expired_v AND status='expired' AND recovery_email_hmac IS NULL AND destination_ciphertext IS NULL AND destination_nonce IS NULL AND otp_mac IS NULL) THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_EXPIRY'; END IF;
  once_a:=public.create_social_login_attempt('att_lifecycleonce001','google',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(once_a,'google','slb:v1:k01:google:IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII',decode(repeat('8f',32),'hex'),1);
  once_v:=public.create_login_attempt_recovery_verification(once_a,decode(repeat('90',32),'hex'),1,decode(repeat('91',17),'hex'),decode(repeat('92',12),'hex'),1,decode(repeat('93',32),'hex'),1);
  SELECT outcome INTO out FROM public.consume_recovery_and_decide_social_account(once_a,once_v,decode(repeat('93',32),'hex'));
  IF out<>'ACCOUNT_DECIDED' THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_CONSUME'; END IF;
  rejected:=false; BEGIN PERFORM public.consume_recovery_and_decide_social_account(once_a,once_v,decode(repeat('93',32),'hex')); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_ATTEMPT_DECISION_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_REPLAY'; END IF;
  rejected:=false; BEGIN PERFORM public.create_login_attempt_recovery_verification(once_a,decode(repeat('90',32),'hex'),1,decode(repeat('94',17),'hex'),decode(repeat('95',12),'hex'),1,decode(repeat('96',32),'hex'),1); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_ATTEMPT_RECOVERY_CREATE_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_TERMINAL_RESEND'; END IF;
END $$;
SELECT 'PHASE10O_G_RECOVERY_EXPIRY_OK' AS status;
SELECT 'PHASE10O_G_RECOVERY_ATTEMPT_LIFECYCLE_OK' AS status;
