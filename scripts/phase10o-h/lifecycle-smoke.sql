-- PHASE 10O-H SQL acceptance: exact preallocated IDs and terminal disposal.
SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.phase10oh_subject(provider_name text, digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_')
$$;

DO $$
DECLARE
  attempt_id uuid;
  challenge_id uuid:='91000000-0000-4000-8000-000000000001';
  reserved_id uuid:='92000000-0000-4000-8000-000000000001';
  digest_value bytea:=decode(repeat('91',32),'hex');
  subject_value text;
  result text;
  account_id uuid;
BEGIN
  subject_value:=pg_temp.phase10oh_subject('google',digest_value);
  attempt_id:=public.create_social_login_attempt('att_10ohnew000000001','google',clock_timestamp()+interval '5 minutes');
  IF public.record_verified_social_identity(attempt_id,'google',subject_value,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_H_NEW_IDENTITY'; END IF;
  IF public.create_login_attempt_recovery_verification(attempt_id,challenge_id,reserved_id,decode(repeat('92',32),'hex'),1,decode(repeat('93',17),'hex'),decode(repeat('94',12),'hex'),1,decode(repeat('95',32),'hex'),1)<>challenge_id THEN RAISE EXCEPTION 'PHASE10O_H_CHALLENGE_ID_REPLACED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=challenge_id AND reserved_account_id=reserved_id AND status='pending') THEN RAISE EXCEPTION 'PHASE10O_H_RESERVATION_MISSING'; END IF;
  SELECT outcome INTO result FROM public.consume_recovery_and_decide_social_account(attempt_id,challenge_id,decode(repeat('95',32),'hex'));
  SELECT id INTO account_id FROM private.private_accounts WHERE id=reserved_id;
  IF result<>'ACCOUNT_DECIDED' OR account_id IS DISTINCT FROM reserved_id OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts o WHERE o.id=attempt_id AND o.account_id=reserved_id AND o.state='account_decided') THEN RAISE EXCEPTION 'PHASE10O_H_NEW_EXACT_RESERVED_ACCOUNT'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=challenge_id AND status='consumed' AND reserved_account_id IS NULL AND destination_ciphertext IS NULL AND otp_mac IS NULL) THEN RAISE EXCEPTION 'PHASE10O_H_TERMINAL_CLEAR'; END IF;
END $$;
SELECT 'PHASE10O_H_NEW_ACCOUNT_EXACT_ID_OK' AS status;

-- Same server-supplied challenge UUID or reservation is rejected before any
-- replacement/supersede can silently adopt it.
DO $$
DECLARE a uuid; d bytea:=decode(repeat('96',32),'hex'); s text; rejected_id boolean:=false; rejected_reservation boolean:=false;
BEGIN
  s:=pg_temp.phase10oh_subject('naver',d);
  a:=public.create_social_login_attempt('att_10ohcollision00001','naver',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(a,'naver',s,d,1);
  PERFORM public.create_login_attempt_recovery_verification(a,'93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',decode(repeat('97',32),'hex'),1,decode(repeat('98',17),'hex'),decode(repeat('99',12),'hex'),1,decode(repeat('9a',32),'hex'),1);
  BEGIN PERFORM public.create_login_attempt_recovery_verification(a,'93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001',decode(repeat('97',32),'hex'),1,decode(repeat('98',17),'hex'),decode(repeat('99',12),'hex'),1,decode(repeat('9a',32),'hex'),1); EXCEPTION WHEN OTHERS THEN rejected_id:=SQLERRM LIKE '%SOCIAL_ATTEMPT_RECOVERY_ID_RESERVATION_REJECTED%'; END;
  BEGIN PERFORM public.create_login_attempt_recovery_verification(a,'96000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',decode(repeat('97',32),'hex'),1,decode(repeat('98',17),'hex'),decode(repeat('99',12),'hex'),1,decode(repeat('9a',32),'hex'),1); EXCEPTION WHEN OTHERS THEN rejected_reservation:=SQLERRM LIKE '%SOCIAL_ATTEMPT_RECOVERY_ID_RESERVATION_REJECTED%'; END;
  IF NOT rejected_id OR NOT rejected_reservation THEN RAISE EXCEPTION 'PHASE10O_H_COLLISION_NOT_REJECTED'; END IF;
END $$;
SELECT 'PHASE10O_H_PREALLOCATION_COLLISION_OK' AS status;

-- A valid Google recovery challenge may be encrypted for a reservation, but a
-- matching active Kakao account wins without creating/attaching that reservation.
DO $$
DECLARE
  old_account uuid:='97000000-0000-4000-8000-000000000001';
  attempt_id uuid; challenge_id uuid:='98000000-0000-4000-8000-000000000001'; reserved_id uuid:='99000000-0000-4000-8000-000000000001';
  kakao_digest bytea:=decode(repeat('a1',32),'hex'); google_digest bytea:=decode(repeat('a2',32),'hex'); kakao_subject text; google_subject text; result text; provider text;
BEGIN
  kakao_subject:=pg_temp.phase10oh_subject('kakao',kakao_digest);
  google_subject:=pg_temp.phase10oh_subject('google',google_digest);
  INSERT INTO auth.users(id,email) VALUES('97000000-0000-4000-8000-000000000002','phase10oh-cross@example.invalid');
  INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at,activated_at)
  VALUES(old_account,'97000000-0000-4000-8000-000000000002','active','kakao',kakao_subject,decode(repeat('a3',32),'hex'),1,decode(repeat('a4',17),'hex'),decode(repeat('a5',12),'hex'),1,clock_timestamp(),clock_timestamp());
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status,activated_at)
  VALUES(kakao_subject,'kakao',kakao_digest,1,old_account,'97000000-0000-4000-8000-000000000002','active',clock_timestamp());
  attempt_id:=public.create_social_login_attempt('att_10ohcrossprovider01','google',clock_timestamp()+interval '5 minutes');
  PERFORM public.record_verified_social_identity(attempt_id,'google',google_subject,google_digest,1);
  PERFORM public.create_login_attempt_recovery_verification(attempt_id,challenge_id,reserved_id,decode(repeat('a3',32),'hex'),1,decode(repeat('a6',17),'hex'),decode(repeat('a7',12),'hex'),1,decode(repeat('a8',32),'hex'),1);
  SELECT outcome,primary_provider INTO result,provider FROM public.consume_recovery_and_decide_social_account(attempt_id,challenge_id,decode(repeat('a8',32),'hex'));
  IF result<>'USE_PRIMARY_PROVIDER' OR provider<>'kakao' OR EXISTS(SELECT 1 FROM private.private_accounts WHERE id=reserved_id) OR EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject=google_subject) OR NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=challenge_id AND status='consumed' AND reserved_account_id IS NULL AND destination_ciphertext IS NULL AND destination_nonce IS NULL AND otp_mac IS NULL) THEN RAISE EXCEPTION 'PHASE10O_H_CROSS_PROVIDER_CRYPTO_DISPOSAL'; END IF;
END $$;
SELECT 'PHASE10O_H_CROSS_PROVIDER_CRYPTO_DISCARDED_OK' AS status;
