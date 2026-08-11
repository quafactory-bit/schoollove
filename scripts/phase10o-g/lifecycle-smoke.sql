SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE OR REPLACE FUNCTION pg_temp.phase10og_subject(provider_name text, digest_value bytea)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE suffix text;
BEGIN
  suffix := translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_');
  IF octet_length(digest_value) <> 32 OR length(suffix) <> 43 THEN
    RAISE EXCEPTION 'PHASE10O_G_FIXTURE_SUFFIX_LENGTH_INVALID';
  END IF;
  RETURN 'slb:v1:k01:' || provider_name || ':' || suffix;
END;
$$;
DO $$
DECLARE a uuid; v uuid; out text; provider text; acct private.private_accounts%ROWTYPE; digest_value bytea:=decode(repeat('11',32),'hex'); broker_subject text;
BEGIN
  broker_subject:=pg_temp.phase10og_subject('google',digest_value);
  IF (SELECT count(*) FROM private.private_accounts)<>0 OR (SELECT count(*) FROM private.social_identity_registry)<>0 THEN RAISE EXCEPTION 'PHASE10O_G_NEW_NOT_FRESH'; END IF;
  a:=public.create_social_login_attempt('att_abcdefghijklmnop','google',clock_timestamp()+interval '5 minutes');
  IF public.record_verified_social_identity(a,'google',broker_subject,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_G_NEW_UPSTREAM'; END IF;
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
DECLARE old_account uuid:='a1000000-0000-4000-8000-000000000001'; a uuid; v uuid; out text; provider text; primary_digest bytea:=decode(repeat('74',32),'hex'); primary_subject text; requested_digest bytea:=decode(repeat('75',32),'hex'); requested_subject text;
BEGIN
  primary_subject:=pg_temp.phase10og_subject('kakao',primary_digest);
  requested_subject:=pg_temp.phase10og_subject('google',requested_digest);
  INSERT INTO auth.users(id,email) VALUES ('a1000000-0000-4000-8000-000000000002','cross-primary@example.invalid');
  INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at,activated_at)
  VALUES(old_account,'a1000000-0000-4000-8000-000000000002','active','kakao',primary_subject,decode(repeat('71',32),'hex'),1,decode(repeat('72',17),'hex'),decode(repeat('73',12),'hex'),1,clock_timestamp(),clock_timestamp());
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status,activated_at)
  VALUES(primary_subject,'kakao',primary_digest,1,old_account,'a1000000-0000-4000-8000-000000000002','active',clock_timestamp());
  a:=public.create_social_login_attempt('att_crossprovider001','google',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(a,'google',requested_subject,requested_digest,1);
  v:=public.create_login_attempt_recovery_verification(a,decode(repeat('71',32),'hex'),1,decode(repeat('76',17),'hex'),decode(repeat('77',12),'hex'),1,decode(repeat('78',32),'hex'),1);
  SELECT outcome,primary_provider INTO out,provider FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('78',32),'hex'));
  IF out<>'USE_PRIMARY_PROVIDER' OR provider<>'kakao' OR EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject=requested_subject) OR (SELECT count(*) FROM private.private_accounts WHERE id<>old_account AND recovery_email_hmac=decode(repeat('71',32),'hex'))<>0 THEN RAISE EXCEPTION 'PHASE10O_G_CROSS_PROVIDER_LINK'; END IF;
END $$;
SELECT 'PHASE10O_G_CROSS_PROVIDER_NO_LINK_OK' AS status;

-- Same provider but a different subject is also recovery-match-only, never an alias link.
DO $$
DECLARE a uuid; v uuid; out text; provider text; requested_digest bytea:=decode(repeat('79',32),'hex'); requested_subject text;
BEGIN
  requested_subject:=pg_temp.phase10og_subject('kakao',requested_digest);
  a:=public.create_social_login_attempt('att_sameprovider0001','kakao',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(a,'kakao',requested_subject,requested_digest,1);
  v:=public.create_login_attempt_recovery_verification(a,decode(repeat('71',32),'hex'),1,decode(repeat('7a',17),'hex'),decode(repeat('7b',12),'hex'),1,decode(repeat('7c',32),'hex'),1);
  SELECT outcome,primary_provider INTO out,provider FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('7c',32),'hex'));
  IF out<>'USE_PRIMARY_PROVIDER' OR provider<>'kakao' OR EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject=requested_subject) THEN RAISE EXCEPTION 'PHASE10O_G_SAME_PROVIDER_LINK'; END IF;
END $$;
SELECT 'PHASE10O_G_SAME_PROVIDER_DIFFERENT_SUBJECT_NO_LINK_OK' AS status;

-- The Auth principal cannot be bound before the recovery-backed account decision.
DO $$
DECLARE no_recovery uuid:='a2000000-0000-4000-8000-000000000001'; decided uuid; auth_id uuid:='a2000000-0000-4000-8000-000000000002'; rejected boolean:=false; no_recovery_subject text;
BEGIN
  no_recovery_subject:=pg_temp.phase10og_subject('naver',decode(repeat('80',32),'hex'));
  INSERT INTO private.private_accounts(id,status,primary_provider,primary_broker_subject) VALUES(no_recovery,'provisional','naver',no_recovery_subject);
  BEGIN PERFORM public.bind_social_auth_principal(no_recovery,auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_RECOVERY_DECISION_REQUIRED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_BIND_PRE_RECOVERY'; END IF;
  SELECT account_id INTO decided FROM private.oauth_login_attempts WHERE safe_attempt_id='att_abcdefghijklmnop';
  rejected:=false; BEGIN PERFORM public.bind_social_auth_principal(decided,auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_RECOVERY_DECISION_REQUIRED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_BIND_PRE_AUTH_USER'; END IF;
  INSERT INTO auth.users(id,email) VALUES(auth_id,'bind-order@example.invalid');
  IF NOT public.bind_social_auth_principal(decided,auth_id) THEN RAISE EXCEPTION 'PHASE10O_G_BIND_AFTER_DECISION'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id=decided AND auth_user_id=auth_id) THEN RAISE EXCEPTION 'PHASE10O_G_BIND_ACCOUNT_UNCHANGED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.social_identity_registry WHERE account_id=decided AND auth_user_id=auth_id) THEN RAISE EXCEPTION 'PHASE10O_G_BIND_REGISTRY_UNCHANGED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE account_id=decided AND state='auth_principal_bound') THEN RAISE EXCEPTION 'PHASE10O_G_BIND_ATTEMPT_UNCHANGED'; END IF;
  rejected:=false; BEGIN PERFORM public.bind_social_auth_principal(decided,auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_RECOVERY_DECISION_REQUIRED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_BIND_REBIND'; END IF;
END $$;
SELECT 'PHASE10O_G_AUTH_BIND_ORDER_OK' AS status;

-- Attempt-owned recovery challenges preserve the F terminal-secret invariant and
-- are superseded, rate-limited, expired, and single-use without an account id.
DO $$
DECLARE a uuid; first_v uuid; second_v uuid; out text; i integer; expired_a uuid; expired_v uuid; once_a uuid; once_v uuid; rejected boolean:=false; lifecycle_digest bytea:=decode(repeat('81',32),'hex'); lifecycle_subject text; expired_digest bytea:=decode(repeat('8a',32),'hex'); expired_subject text; once_digest bytea:=decode(repeat('8f',32),'hex'); once_subject text;
BEGIN
  lifecycle_subject:=pg_temp.phase10og_subject('naver',lifecycle_digest);
  expired_subject:=pg_temp.phase10og_subject('google',expired_digest);
  once_subject:=pg_temp.phase10og_subject('google',once_digest);
  a:=public.create_social_login_attempt('att_lifecyclelock001','naver',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(a,'naver',lifecycle_subject,lifecycle_digest,1);
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
  PERFORM public.record_verified_social_identity(expired_a,'google',expired_subject,expired_digest,1);
  expired_v:=public.create_login_attempt_recovery_verification(expired_a,decode(repeat('8b',32),'hex'),1,decode(repeat('8c',17),'hex'),decode(repeat('8d',12),'hex'),1,decode(repeat('8e',32),'hex'),1);
  UPDATE private.recovery_email_verifications SET created_at=clock_timestamp()-interval '3 minutes',expires_at=clock_timestamp()-interval '2 minutes' WHERE id=expired_v;
  SELECT outcome INTO out FROM public.consume_recovery_and_decide_social_account(expired_a,expired_v,decode(repeat('8e',32),'hex'));
  IF out<>'EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=expired_a AND state='expired' AND broker_subject IS NOT NULL AND subject_digest IS NOT NULL AND subject_key_version IS NOT NULL AND account_id IS NULL) OR NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=expired_v AND status='expired' AND recovery_email_hmac IS NULL AND destination_ciphertext IS NULL AND destination_nonce IS NULL AND otp_mac IS NULL) THEN RAISE EXCEPTION 'PHASE10O_G_RECOVERY_EXPIRY'; END IF;
  once_a:=public.create_social_login_attempt('att_lifecycleonce001','google',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(once_a,'google',once_subject,once_digest,1);
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

-- Broker subjects cryptographically claim the exact digest encoded in their
-- base64url suffix. Only these negative probes intentionally mismatch a pair.
DO $$
DECLARE
  valid_digest bytea:=decode(repeat('d1',32),'hex');
  wrong_digest bytea:=decode(repeat('d2',32),'hex');
  valid_subject text;
  mutated_subject text;
  attempt_id uuid;
  rejected boolean:=false;
BEGIN
  valid_subject:=pg_temp.phase10og_subject('google',valid_digest);
  mutated_subject:=left(valid_subject,length(valid_subject)-1)
    || CASE WHEN right(valid_subject,1)='A' THEN 'B' ELSE 'A' END;
  attempt_id:=public.create_social_login_attempt('att_coherentvalid001','google',clock_timestamp()+interval '5 minutes');
  IF public.record_verified_social_identity(attempt_id,'google',valid_subject,valid_digest,1)<>'RECOVERY_REQUIRED' THEN
    RAISE EXCEPTION 'PHASE10O_G_COHERENT_PAIR_REJECTED';
  END IF;
  attempt_id:=public.create_social_login_attempt('att_coherentwrong001','google',clock_timestamp()+interval '5 minutes');
  BEGIN
    PERFORM public.record_verified_social_identity(attempt_id,'google',valid_subject,wrong_digest,1);
  EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_ATTEMPT_IDENTITY_INVALID%';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_COHERENCE_WRONG_DIGEST_ACCEPTED'; END IF;
  attempt_id:=public.create_social_login_attempt('att_coherentmutate01','google',clock_timestamp()+interval '5 minutes');
  rejected:=false;
  BEGIN
    PERFORM public.record_verified_social_identity(attempt_id,'google',mutated_subject,valid_digest,1);
  EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_ATTEMPT_IDENTITY_INVALID%';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_G_COHERENCE_MUTATED_SUFFIX_ACCEPTED'; END IF;
END $$;
SELECT 'PHASE10O_G_BROKER_DIGEST_COHERENCE_OK' AS status;

-- A recovery match against any retained status must not attach the requested
-- identity or mutate the retained account. Only active may name its provider.
DO $$
DECLARE
  active_id uuid:='a3000000-0000-4000-8000-000000000001';
  provisional_id uuid:='a3000000-0000-4000-8000-000000000002';
  deletion_id uuid:='a3000000-0000-4000-8000-000000000003';
  failed_id uuid:='a3000000-0000-4000-8000-000000000004';
  attempt_id uuid;
  verification_id uuid;
  outcome_value text;
  provider_value text;
  account_count_before integer;
  registry_count_before integer;
  attempt_subject text;
  attempt_digest bytea;
  i integer;
  retained_hmac bytea[]:=ARRAY[decode(repeat('b1',32),'hex'),decode(repeat('b2',32),'hex'),decode(repeat('b3',32),'hex'),decode(repeat('b4',32),'hex')];
  expected_outcome text[]:=ARRAY['USE_PRIMARY_PROVIDER','ACCOUNT_DECISION_IN_PROGRESS','ACCOUNT_UNAVAILABLE','ACCOUNT_UNAVAILABLE'];
BEGIN
  INSERT INTO auth.users(id,email) VALUES ('a3000000-0000-4000-8000-000000000010','retained-active@example.invalid');
  INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at,activated_at)
  VALUES(active_id,'a3000000-0000-4000-8000-000000000010','active','kakao',pg_temp.phase10og_subject('kakao',decode(repeat('b5',32),'hex')),retained_hmac[1],1,decode(repeat('b6',17),'hex'),decode(repeat('b7',12),'hex'),1,clock_timestamp(),clock_timestamp());
  INSERT INTO private.private_accounts(id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at)
  VALUES
    (provisional_id,'provisional','naver',pg_temp.phase10og_subject('naver',decode(repeat('b8',32),'hex')),retained_hmac[2],1,decode(repeat('b9',17),'hex'),decode(repeat('ba',12),'hex'),1,clock_timestamp()),
    (deletion_id,'deletion_pending','google',pg_temp.phase10og_subject('google',decode(repeat('bb',32),'hex')),retained_hmac[3],1,decode(repeat('bc',17),'hex'),decode(repeat('bd',12),'hex'),1,clock_timestamp()),
    (failed_id,'cleanup_failed_safe','kakao',pg_temp.phase10og_subject('kakao',decode(repeat('be',32),'hex')),retained_hmac[4],1,decode(repeat('bf',17),'hex'),decode(repeat('c0',12),'hex'),1,clock_timestamp());
  SELECT count(*) INTO account_count_before FROM private.private_accounts;
  SELECT count(*) INTO registry_count_before FROM private.social_identity_registry;

  FOR i IN 1..4 LOOP
    attempt_digest:=decode(repeat((ARRAY['c1','c2','c3','c4'])[i],32),'hex');
    attempt_subject:=pg_temp.phase10og_subject('google',attempt_digest);
    attempt_id:=public.create_social_login_attempt(('att_retainedstate00'||i::text)::text,'google',clock_timestamp()+interval '5 minutes');
    IF public.record_verified_social_identity(attempt_id,'google',attempt_subject,attempt_digest,1)<>'RECOVERY_REQUIRED' THEN
      RAISE EXCEPTION 'PHASE10O_G_RETAINED_UPSTREAM_%', i;
    END IF;
    verification_id:=public.create_login_attempt_recovery_verification(attempt_id,retained_hmac[i],1,decode(repeat('c5',17),'hex'),decode(repeat('c6',12),'hex'),1,decode(repeat('c7',32),'hex'),1);
    SELECT outcome,primary_provider INTO outcome_value,provider_value FROM public.consume_recovery_and_decide_social_account(attempt_id,verification_id,decode(repeat('c7',32),'hex'));
    IF outcome_value<>expected_outcome[i] OR (i=1 AND provider_value<>'kakao') OR (i>1 AND provider_value IS NOT NULL) THEN
      RAISE EXCEPTION 'PHASE10O_G_RETAINED_OUTCOME_%', i;
    END IF;
    IF EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject=attempt_subject)
      OR EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=attempt_id AND account_id IS NOT NULL)
    THEN RAISE EXCEPTION 'PHASE10O_G_RETAINED_IDENTITY_ATTACHED_%', i; END IF;
  END LOOP;
  IF (SELECT count(*) FROM private.private_accounts)<>account_count_before
    OR (SELECT count(*) FROM private.social_identity_registry)<>registry_count_before
    OR NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id=active_id AND status='active' AND primary_provider='kakao' AND recovery_email_hmac=retained_hmac[1])
    OR NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id=provisional_id AND status='provisional' AND primary_provider='naver' AND recovery_email_hmac=retained_hmac[2])
    OR NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id=deletion_id AND status='deletion_pending' AND primary_provider='google' AND recovery_email_hmac=retained_hmac[3])
    OR NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id=failed_id AND status='cleanup_failed_safe' AND primary_provider='kakao' AND recovery_email_hmac=retained_hmac[4])
  THEN RAISE EXCEPTION 'PHASE10O_G_RETAINED_MUTATION'; END IF;
END $$;
SELECT 'PHASE10O_G_RETAINED_RECOVERY_UNAVAILABLE_OK' AS status;
