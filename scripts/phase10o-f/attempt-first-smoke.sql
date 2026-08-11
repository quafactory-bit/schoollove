-- PHASE 10O-G isolated acceptance: existing primary is recovery-free and bound.
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE
  subject_digest bytea := decode(repeat('44',32),'hex');
  broker_subject text := 'slb:v1:k01:kakao:' || translate(rtrim(encode(subject_digest,'base64'),'='),'+/','-_');
  attempt_id uuid;
  outcome text;
  attempt_state text;
  bound_account uuid;
BEGIN
  IF length(split_part(broker_subject,':',5)) <> 43 THEN
    RAISE EXCEPTION 'PHASE10O_G_FIXTURE_SUFFIX_LENGTH_INVALID';
  END IF;

  INSERT INTO auth.users(id,email)
  VALUES ('91000000-0000-4000-8000-000000000001','fixture@example.invalid');
  INSERT INTO private.private_accounts(
    id,auth_user_id,status,primary_provider,primary_broker_subject,
    recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,
    recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at,activated_at
  ) VALUES (
    '91000000-0000-4000-8000-000000000010',
    '91000000-0000-4000-8000-000000000001',
    'active','kakao',broker_subject,
    decode(repeat('11',32),'hex'),1,decode(repeat('22',17),'hex'),
    decode(repeat('33',12),'hex'),1,clock_timestamp(),clock_timestamp()
  );
  INSERT INTO private.social_identity_registry(
    broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status,activated_at
  ) VALUES (
    broker_subject,'kakao',subject_digest,1,
    '91000000-0000-4000-8000-000000000010',
    '91000000-0000-4000-8000-000000000001','active',clock_timestamp()
  );

  attempt_id:=public.create_social_login_attempt('att_1234567890abcdef','kakao',clock_timestamp()+interval '5 minutes');
  SELECT public.record_verified_social_identity(attempt_id,'kakao',broker_subject,subject_digest,1) INTO outcome;
  SELECT state,account_id INTO attempt_state,bound_account FROM private.oauth_login_attempts WHERE id=attempt_id;
  IF outcome<>'EXISTING_PRIMARY' OR attempt_state<>'existing_primary' OR bound_account<>'91000000-0000-4000-8000-000000000010'::uuid THEN
    RAISE EXCEPTION 'PHASE10O_G_EXISTING_PRIMARY_FAILED';
  END IF;
END $$;
SELECT 'PHASE10O_G_EXISTING_PRIMARY_OK' AS status;
