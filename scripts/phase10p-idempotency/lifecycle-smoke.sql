SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.phase10p_idempotency_attempt(
  attempt_id uuid,
  safe_id text
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  digest_value bytea:=extensions.digest(convert_to(safe_id,'UTF8'),'sha256');
  subject_value text;
BEGIN
  subject_value:='slb:v1:k01:google:'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_');
  INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,expires_at)
    VALUES(attempt_id,safe_id,'google','recovery_required',subject_value,digest_value,1,clock_timestamp()+interval '9 minutes');
  RETURN attempt_id;
END $$;

DO $$
DECLARE
  attempt_one uuid:='71000000-0000-4000-8000-000000000001';
  attempt_two uuid:='71000000-0000-4000-8000-000000000002';
  verification_one uuid:='71000000-0000-4000-8000-000000000011';
  delivery_one uuid;
  outcome_value text;
  verification_value uuid;
  delivery_value uuid;
  attempt_version integer;
  verification_before jsonb;
  delivery_before jsonb;
  verification_count integer;
  delivery_count integer;
  same_hmac bytea:=decode(repeat('11',32),'hex');
BEGIN
  PERFORM pg_temp.phase10p_idempotency_attempt(attempt_one,'att_10p_idempotency_exact_1');
  SELECT x.outcome,x.verification_id,x.delivery_id INTO outcome_value,verification_value,delivery_one
    FROM public.create_and_reserve_login_attempt_recovery_delivery(
      attempt_one,verification_one,'71000000-0000-4000-8000-000000000021',same_hmac,1,
      decode(repeat('12',17),'hex'),decode(repeat('13',12),'hex'),1,decode(repeat('14',32),'hex'),1
    ) x;
  IF outcome_value<>'RECOVERY_DELIVERY_RESERVED' OR verification_value<>verification_one
    OR public.mark_login_attempt_recovery_delivery_sent(delivery_one)<>'RECOVERY_DELIVERY_SENT'
  THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_FIRST_SEND'; END IF;

  SELECT version INTO attempt_version FROM private.oauth_login_attempts WHERE id=attempt_one;
  SELECT to_jsonb(v) INTO verification_before FROM private.recovery_email_verifications v WHERE id=verification_one;
  SELECT to_jsonb(d) INTO delivery_before FROM private.recovery_delivery_attempts d WHERE id=delivery_one;
  SELECT count(*) INTO verification_count FROM private.recovery_email_verifications;
  SELECT count(*) INTO delivery_count FROM private.recovery_delivery_attempts;

  SELECT x.outcome,x.verification_id,x.delivery_id INTO outcome_value,verification_value,delivery_value
    FROM public.create_and_reserve_login_attempt_recovery_delivery(
      attempt_one,'71000000-0000-4000-8000-000000000012','71000000-0000-4000-8000-000000000022',same_hmac,1,
      decode(repeat('15',17),'hex'),decode(repeat('16',12),'hex'),1,decode(repeat('17',32),'hex'),1
    ) x;
  IF outcome_value<>'RECOVERY_DELIVERY_ALREADY_SENT' OR verification_value<>verification_one OR delivery_value<>delivery_one
    OR (SELECT count(*) FROM private.recovery_email_verifications)<>verification_count
    OR (SELECT count(*) FROM private.recovery_delivery_attempts)<>delivery_count
    OR (SELECT version FROM private.oauth_login_attempts WHERE id=attempt_one)<>attempt_version
    OR (SELECT to_jsonb(v) FROM private.recovery_email_verifications v WHERE id=verification_one) IS DISTINCT FROM verification_before
    OR (SELECT to_jsonb(d) FROM private.recovery_delivery_attempts d WHERE id=delivery_one) IS DISTINCT FROM delivery_before
  THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_EXACT_REPLAY_MUTATED'; END IF;

  SELECT x.outcome INTO outcome_value FROM public.create_and_reserve_login_attempt_recovery_delivery(
    attempt_one,'71000000-0000-4000-8000-000000000013','71000000-0000-4000-8000-000000000023',decode(repeat('21',32),'hex'),1,
    decode(repeat('22',17),'hex'),decode(repeat('23',12),'hex'),1,decode(repeat('24',32),'hex'),1
  ) x;
  IF outcome_value<>'RECOVERY_DELIVERY_LIMITED' THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_DIFFERENT_EMAIL'; END IF;

  SELECT x.outcome INTO outcome_value FROM public.create_and_reserve_login_attempt_recovery_delivery(
    attempt_one,'71000000-0000-4000-8000-000000000014','71000000-0000-4000-8000-000000000024',same_hmac,2,
    decode(repeat('25',17),'hex'),decode(repeat('26',12),'hex'),1,decode(repeat('27',32),'hex'),1
  ) x;
  IF outcome_value<>'RECOVERY_DELIVERY_LIMITED' THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_DIFFERENT_KEY_VERSION'; END IF;

  PERFORM pg_temp.phase10p_idempotency_attempt(attempt_two,'att_10p_idempotency_other_1');
  SELECT x.outcome,x.verification_id,x.delivery_id INTO outcome_value,verification_value,delivery_value
    FROM public.create_and_reserve_login_attempt_recovery_delivery(
      attempt_two,'71000000-0000-4000-8000-000000000015','71000000-0000-4000-8000-000000000025',same_hmac,1,
      decode(repeat('28',17),'hex'),decode(repeat('29',12),'hex'),1,decode(repeat('2a',32),'hex'),1
    ) x;
  IF outcome_value<>'RECOVERY_DELIVERY_RESERVED' OR verification_value=verification_one OR delivery_value=delivery_one
  THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_CROSS_ATTEMPT_MATCH'; END IF;
END $$;

DO $$
DECLARE
  terminal_status text;
  position integer:=0;
  attempt_id uuid;
  verification_id uuid;
  reserved_account_id uuid;
  delivery_id uuid;
  hmac_value bytea;
  outcome_value text;
  verification_count integer;
  delivery_count integer;
BEGIN
  FOREACH terminal_status IN ARRAY ARRAY['reserved','failed'] LOOP
    position:=position+1;
    attempt_id:=('72000000-0000-4000-8000-'||lpad(position::text,12,'0'))::uuid;
    verification_id:=('72000000-0000-4000-8100-'||lpad(position::text,12,'0'))::uuid;
    reserved_account_id:=('72000000-0000-4000-8200-'||lpad(position::text,12,'0'))::uuid;
    hmac_value:=extensions.digest(convert_to('delivery-'||terminal_status,'UTF8'),'sha256');
    PERFORM pg_temp.phase10p_idempotency_attempt(attempt_id,'att_10p_idem_delivery_'||position);
    SELECT x.outcome,x.delivery_id INTO outcome_value,delivery_id FROM public.create_and_reserve_login_attempt_recovery_delivery(
      attempt_id,verification_id,reserved_account_id,hmac_value,1,decode(repeat('31',17),'hex'),decode(repeat('32',12),'hex'),1,decode(repeat('33',32),'hex'),1
    ) x;
    IF outcome_value<>'RECOVERY_DELIVERY_RESERVED' THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_DELIVERY_SETUP'; END IF;
    IF terminal_status='failed' AND public.fail_login_attempt_recovery_delivery(delivery_id)<>'RECOVERY_DELIVERY_FAILED' THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_FAILED_SETUP'; END IF;
    SELECT count(*) INTO verification_count FROM private.recovery_email_verifications;
    SELECT count(*) INTO delivery_count FROM private.recovery_delivery_attempts;
    SELECT x.outcome INTO outcome_value FROM public.create_and_reserve_login_attempt_recovery_delivery(
      attempt_id,gen_random_uuid(),gen_random_uuid(),hmac_value,1,decode(repeat('34',17),'hex'),decode(repeat('35',12),'hex'),1,decode(repeat('36',32),'hex'),1
    ) x;
    IF outcome_value<>'RECOVERY_DELIVERY_LIMITED'
      OR (SELECT count(*) FROM private.recovery_email_verifications)<>verification_count
      OR (SELECT count(*) FROM private.recovery_delivery_attempts)<>delivery_count
    THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_DELIVERY_STATE_REUSED %',terminal_status; END IF;
  END LOOP;

  FOREACH terminal_status IN ARRAY ARRAY['consumed','locked','expired','revoked'] LOOP
    position:=position+1;
    attempt_id:=('72000000-0000-4000-8000-'||lpad(position::text,12,'0'))::uuid;
    verification_id:=('72000000-0000-4000-8100-'||lpad(position::text,12,'0'))::uuid;
    reserved_account_id:=('72000000-0000-4000-8200-'||lpad(position::text,12,'0'))::uuid;
    hmac_value:=extensions.digest(convert_to('verification-'||terminal_status,'UTF8'),'sha256');
    PERFORM pg_temp.phase10p_idempotency_attempt(attempt_id,'att_10p_idem_terminal_'||position);
    SELECT x.outcome,x.delivery_id INTO outcome_value,delivery_id FROM public.create_and_reserve_login_attempt_recovery_delivery(
      attempt_id,verification_id,reserved_account_id,hmac_value,1,decode(repeat('41',17),'hex'),decode(repeat('42',12),'hex'),1,decode(repeat('43',32),'hex'),1
    ) x;
    IF outcome_value<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent(delivery_id)<>'RECOVERY_DELIVERY_SENT'
    THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_TERMINAL_SETUP'; END IF;
    UPDATE private.recovery_email_verifications
      SET status=terminal_status,
          consumed_at=CASE WHEN terminal_status='consumed' THEN clock_timestamp() ELSE NULL END,
          revoked_at=CASE WHEN terminal_status='revoked' THEN clock_timestamp() ELSE NULL END
      WHERE id=verification_id;
    SELECT count(*) INTO verification_count FROM private.recovery_email_verifications;
    SELECT count(*) INTO delivery_count FROM private.recovery_delivery_attempts;
    SELECT x.outcome INTO outcome_value FROM public.create_and_reserve_login_attempt_recovery_delivery(
      attempt_id,gen_random_uuid(),gen_random_uuid(),hmac_value,1,decode(repeat('44',17),'hex'),decode(repeat('45',12),'hex'),1,decode(repeat('46',32),'hex'),1
    ) x;
    IF outcome_value<>'RECOVERY_DELIVERY_LIMITED'
      OR (SELECT count(*) FROM private.recovery_email_verifications)<>verification_count
      OR (SELECT count(*) FROM private.recovery_delivery_attempts)<>delivery_count
    THEN RAISE EXCEPTION 'PHASE10P_IDEMPOTENCY_TERMINAL_REUSED %',terminal_status; END IF;
  END LOOP;
END $$;

SELECT 'PHASE10P_RECOVERY_DELIVERY_ALREADY_SENT_IDEMPOTENT_OK' AS status;
SELECT 'PHASE10P_RECOVERY_DELIVERY_DIFFERENT_EMAIL_LIMITED_OK' AS status;
SELECT 'PHASE10P_RECOVERY_DELIVERY_REPLAY_NEGATIVE_MATRIX_OK' AS status;
SELECT 'PHASE10P_RECOVERY_DELIVERY_ZERO_MUTATION_OK' AS status;
