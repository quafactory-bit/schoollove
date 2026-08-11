-- PHASE 10O-I isolated SQL acceptance: sent gate, atomic limits, and cleanup.
SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE OR REPLACE FUNCTION pg_temp.phase10oi_subject(provider_name text, digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_') $$;
CREATE OR REPLACE FUNCTION pg_temp.phase10oi_attempt(safe_id text, suffix text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; d bytea:=decode(suffix,'hex'); s text;
BEGIN
  s:=pg_temp.phase10oi_subject('google',d);
  a:=public.create_social_login_attempt(safe_id,'google',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity(a,'google',s,d,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_I_ATTEMPT_SETUP'; END IF;
  RETURN a;
END $$;

DO $$
DECLARE a uuid; v uuid:='a1000000-0000-4000-8000-000000000001'; r uuid:='a2000000-0000-4000-8000-000000000001'; d uuid; outcome text; rejected boolean:=false;
BEGIN
  a:=pg_temp.phase10oi_attempt('att_10oi_sent_gate_0001',repeat('a1',32));
  SELECT x.outcome,x.delivery_id INTO outcome,d FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v,r,decode(repeat('b1',32),'hex'),1,decode(repeat('c1',17),'hex'),decode(repeat('d1',12),'hex'),1,decode(repeat('e1',32),'hex'),1) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' OR d IS NULL THEN RAISE EXCEPTION 'PHASE10O_I_RESERVATION_MISSING'; END IF;
  BEGIN PERFORM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('e1',32),'hex')); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_ATTEMPT_DECISION_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10O_I_CONSUME_BEFORE_SENT'; END IF;
  IF public.mark_login_attempt_recovery_delivery_sent(d)<>'RECOVERY_DELIVERY_SENT' OR public.mark_login_attempt_recovery_delivery_sent(d)<>'RECOVERY_DELIVERY_SENT' THEN RAISE EXCEPTION 'PHASE10O_I_SENT_CONFIRMATION'; END IF;
  IF (SELECT c.outcome FROM public.consume_recovery_and_decide_social_account(a,v,decode(repeat('e1',32),'hex')) c)<>'ACCOUNT_DECIDED' THEN RAISE EXCEPTION 'PHASE10O_I_SENT_CONSUME'; END IF;
END $$;
SELECT 'PHASE10O_I_SENT_GATE_OK' AS status;

DO $$
DECLARE a uuid; v1 uuid:='a3000000-0000-4000-8000-000000000001'; r1 uuid:='a4000000-0000-4000-8000-000000000001'; v2 uuid:='a3000000-0000-4000-8000-000000000002'; r2 uuid:='a4000000-0000-4000-8000-000000000002'; limited text; old_pending boolean;
BEGIN
  a:=pg_temp.phase10oi_attempt('att_10oi_cooldown_0001',repeat('a2',32));
  PERFORM 1 FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v1,r1,decode(repeat('b2',32),'hex'),1,decode(repeat('c2',17),'hex'),decode(repeat('d2',12),'hex'),1,decode(repeat('e2',32),'hex'),1);
  SELECT outcome INTO limited FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v2,r2,decode(repeat('b2',32),'hex'),1,decode(repeat('c3',17),'hex'),decode(repeat('d3',12),'hex'),1,decode(repeat('e3',32),'hex'),1);
  SELECT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=v1 AND status='pending' AND otp_mac IS NOT NULL) INTO old_pending;
  IF limited<>'RECOVERY_DELIVERY_LIMITED' OR NOT old_pending OR EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=v2) THEN RAISE EXCEPTION 'PHASE10O_I_COOLDOWN_MUTATED_OLD_CHALLENGE'; END IF;
END $$;
SELECT 'PHASE10O_I_COOLDOWN_PRESERVES_PENDING_OK' AS status;

DO $$
DECLARE a uuid; i integer; v uuid; r uuid; outcome text; old_pending boolean;
BEGIN
  a:=pg_temp.phase10oi_attempt('att_10oi_attempt_cap_0001',repeat('a4',32));
  FOR i IN 1..3 LOOP
    v:=('a7000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    r:=('a8000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v,r,decode(repeat('b4',32),'hex'),1,decode(repeat('c5',17),'hex'),decode(repeat('d5',12),'hex'),1,decode(repeat('e5',32),'hex'),1) x;
    IF outcome<>'RECOVERY_DELIVERY_RESERVED' THEN RAISE EXCEPTION 'PHASE10O_I_ATTEMPT_CAP_SEED'; END IF;
    IF i<3 THEN UPDATE private.recovery_delivery_attempts SET reserved_at=clock_timestamp()-interval '61 seconds' WHERE verification_id=v; END IF;
  END LOOP;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(a,'a7000000-0000-4000-8000-000000000004','a8000000-0000-4000-8000-000000000004',decode(repeat('b4',32),'hex'),1,decode(repeat('c6',17),'hex'),decode(repeat('d6',12),'hex'),1,decode(repeat('e6',32),'hex'),1) x;
  SELECT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id='a7000000-0000-4000-8000-000000000003'::uuid AND status='pending' AND otp_mac IS NOT NULL) INTO old_pending;
  IF outcome<>'RECOVERY_DELIVERY_LIMITED' OR NOT old_pending OR (SELECT count(*) FROM private.recovery_delivery_attempts WHERE login_attempt_id=a)<>3 THEN RAISE EXCEPTION 'PHASE10O_I_ATTEMPT_CAP_NOT_ATOMIC'; END IF;
END $$;
SELECT 'PHASE10O_I_ATTEMPT_CAP_PRESERVES_PENDING_OK' AS status;

DO $$
DECLARE a uuid; i integer; v uuid; r uuid; outcome text; previous_pending boolean;
BEGIN
  FOR i IN 1..5 LOOP
    a:=pg_temp.phase10oi_attempt('att_10oi_address_cap_'||i,lpad(to_hex(164+i),2,'0')||repeat('a5',31));
    v:=('aa000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    r:=('ab000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v,r,decode(repeat('b5',32),'hex'),1,decode(repeat('c7',17),'hex'),decode(repeat('d7',12),'hex'),1,decode(repeat('e7',32),'hex'),1) x;
    IF outcome<>'RECOVERY_DELIVERY_RESERVED' THEN RAISE EXCEPTION 'PHASE10O_I_ADDRESS_CAP_SEED'; END IF;
  END LOOP;
  a:=pg_temp.phase10oi_attempt('att_10oi_address_cap_6',repeat('af',32));
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(a,'aa000000-0000-4000-8000-000000000006','ab000000-0000-4000-8000-000000000006',decode(repeat('b5',32),'hex'),1,decode(repeat('c8',17),'hex'),decode(repeat('d8',12),'hex'),1,decode(repeat('e8',32),'hex'),1) x;
  SELECT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id='aa000000-0000-4000-8000-000000000005'::uuid AND status='pending' AND otp_mac IS NOT NULL) INTO previous_pending;
  IF outcome<>'RECOVERY_DELIVERY_LIMITED' OR NOT previous_pending OR (SELECT count(*) FROM private.recovery_delivery_attempts WHERE recovery_email_hmac=decode(repeat('b5',32),'hex') AND hmac_key_version=1)<>5 THEN RAISE EXCEPTION 'PHASE10O_I_ADDRESS_CAP_NOT_ATOMIC'; END IF;
END $$;
SELECT 'PHASE10O_I_ADDRESS_CAP_PRESERVES_PENDING_OK' AS status;

DO $$
DECLARE a uuid; v uuid:='a5000000-0000-4000-8000-000000000001'; r uuid:='a6000000-0000-4000-8000-000000000001'; delivery uuid;
BEGIN
  a:=pg_temp.phase10oi_attempt('att_10oi_fail_send_0001',repeat('a3',32));
  SELECT delivery_id INTO delivery FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v,r,decode(repeat('b3',32),'hex'),1,decode(repeat('c4',17),'hex'),decode(repeat('d4',12),'hex'),1,decode(repeat('e4',32),'hex'),1);
  IF public.fail_login_attempt_recovery_delivery(delivery)<>'RECOVERY_DELIVERY_FAILED' THEN RAISE EXCEPTION 'PHASE10O_I_FAIL_NOT_RECORDED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.recovery_delivery_attempts WHERE id=delivery AND state='failed') OR NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id=v AND status='revoked' AND recovery_email_hmac IS NULL AND destination_ciphertext IS NULL AND otp_mac IS NULL AND reserved_account_id IS NULL) THEN RAISE EXCEPTION 'PHASE10O_I_FAIL_TERMINAL_CLEAR'; END IF;
END $$;
SELECT 'PHASE10O_I_FAILURE_TERMINAL_CLEAR_OK' AS status;

DO $$
DECLARE a uuid; v uuid:='ac000000-0000-4000-8000-000000000001'; r uuid:='ad000000-0000-4000-8000-000000000001'; delivery uuid; rejected boolean:=false;
BEGIN
  a:=pg_temp.phase10oi_attempt('att_10oi_sent_after_terminal_0001',repeat('a6',32));
  SELECT delivery_id INTO delivery FROM public.create_and_reserve_login_attempt_recovery_delivery(a,v,r,decode(repeat('b6',32),'hex'),1,decode(repeat('c9',17),'hex'),decode(repeat('d9',12),'hex'),1,decode(repeat('e9',32),'hex'),1);
  PERFORM public.fail_login_attempt_recovery_delivery(delivery);
  BEGIN PERFORM public.mark_login_attempt_recovery_delivery_sent(delivery); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%RECOVERY_DELIVERY_CONFIRMATION_REJECTED%'; END;
  IF NOT rejected OR NOT EXISTS(SELECT 1 FROM private.recovery_delivery_attempts WHERE id=delivery AND state='failed') THEN RAISE EXCEPTION 'PHASE10O_I_SENT_AFTER_TERMINAL_ACCEPTED'; END IF;
END $$;
SELECT 'PHASE10O_I_SENT_AFTER_TERMINAL_REJECTED_OK' AS status;
