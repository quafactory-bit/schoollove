SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  base_time timestamptz:=clock_timestamp();
  digest_value bytea;
  subject_value text;
  outcome_value text;
  delivery_id uuid;
BEGIN
  digest_value:=extensions.digest(convert_to('phase10p-idempotency-lock-attempt','UTF8'),'sha256');
  subject_value:='slb:v1:k01:google:'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_');
  INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,created_at,expires_at,updated_at)
    VALUES('74000000-0000-4000-8000-000000000001','att_10p_lock_attempt_expiry','google','recovery_required',subject_value,digest_value,1,base_time,base_time+interval '5 seconds',base_time);
  SELECT x.outcome,x.delivery_id INTO outcome_value,delivery_id FROM public.create_and_reserve_login_attempt_recovery_delivery(
    '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8100-000000000001','74000000-0000-4000-8200-000000000001',decode(repeat('61',32),'hex'),1,
    decode(repeat('62',17),'hex'),decode(repeat('63',12),'hex'),1,decode(repeat('64',32),'hex'),1
  ) x;
  IF outcome_value<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent(delivery_id)<>'RECOVERY_DELIVERY_SENT' THEN
    RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_LOCK_ATTEMPT_SETUP';
  END IF;

  digest_value:=extensions.digest(convert_to('phase10p-idempotency-lock-verification','UTF8'),'sha256');
  subject_value:='slb:v1:k01:google:'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_');
  INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,created_at,expires_at,updated_at)
    VALUES('74000000-0000-4000-8000-000000000002','att_10p_lock_verification_exp','google','recovery_required',subject_value,digest_value,1,base_time,base_time+interval '9 minutes',base_time);
  SELECT x.outcome,x.delivery_id INTO outcome_value,delivery_id FROM public.create_and_reserve_login_attempt_recovery_delivery(
    '74000000-0000-4000-8000-000000000002','74000000-0000-4000-8100-000000000002','74000000-0000-4000-8200-000000000002',decode(repeat('71',32),'hex'),1,
    decode(repeat('72',17),'hex'),decode(repeat('73',12),'hex'),1,decode(repeat('74',32),'hex'),1
  ) x;
  IF outcome_value<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent(delivery_id)<>'RECOVERY_DELIVERY_SENT' THEN
    RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_LOCK_VERIFICATION_SETUP';
  END IF;
END $$;

SELECT 'PHASE10P_RECOVERY_DELIVERY_LOCK_WAIT_FIXTURES_OK' AS status;
