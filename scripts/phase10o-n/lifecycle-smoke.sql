-- PHASE 10O-N synthetic state-only callback correlation acceptance.
SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE a uuid; result text; claimed_attempt uuid; claimed_leg uuid; cd bytea:=decode(repeat('11',32),'hex'); sd bytea:=decode(repeat('12',32),'hex');
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r')<>8
    OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='private' AND indexname='upstream_login_legs_pending_state_digest_unique') THEN RAISE EXCEPTION 'PHASE10O_N_SCHEMA'; END IF;
  a:=public.create_social_login_attempt('att_10on_unknown_0001','naver',clock_timestamp()+interval '9 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,'b1000000-0000-4000-8000-000000000001','naver',cd,sd,NULL,NULL,NULL,NULL,NULL);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',cd,decode(repeat('ff',32),'hex'));
  IF result<>'CORRELATION_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='upstream_pending') OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE login_attempt_id=a AND status='pending' AND state_digest=sd) THEN RAISE EXCEPTION 'PHASE10O_N_UNKNOWN_MUTATED'; END IF;
  SELECT outcome,attempt_id,leg_id INTO result,claimed_attempt,claimed_leg FROM public.claim_upstream_login_callback_by_state('naver',cd,sd);
  IF result<>'CALLBACK_CLAIMED' OR claimed_attempt<>a OR claimed_leg<>'b1000000-0000-4000-8000-000000000001'::uuid OR EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=claimed_leg AND state_digest IS NOT NULL) THEN RAISE EXCEPTION 'PHASE10O_N_STATE_TRUSTED_IDS'; END IF;
END $$;
SELECT 'PHASE10O_N_STATE_DIGEST_CORRELATION_OK' AS status;
SELECT 'PHASE10O_N_UNKNOWN_STATE_NO_MUTATION_OK' AS status;
SELECT 'PHASE10O_N_STATE_TO_TRUSTED_IDS_OK' AS status;

DO $$
DECLARE a uuid; result text; cd bytea:=decode(repeat('21',32),'hex'); sd bytea:=decode(repeat('22',32),'hex');
BEGIN
  a:=public.create_social_login_attempt('att_10on_provider_0001','google',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_upstream_login_leg(a,'b1000000-0000-4000-8000-000000000002','google',cd,sd,decode(repeat('23',32),'hex'),repeat('A',43),decode(repeat('a1',17),'hex'),decode(repeat('a2',12),'hex'),1);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',cd,sd);
  IF result<>'PROVIDER_MISMATCH' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='provider_mismatch') THEN RAISE EXCEPTION 'PHASE10O_N_PROVIDER'; END IF;
END $$;
SELECT 'PHASE10O_N_CROSS_PROVIDER_CORRELATION_REJECTED_OK' AS status;

DO $$
DECLARE a uuid; result text; cd bytea:=decode(repeat('31',32),'hex'); sd bytea:=decode(repeat('32',32),'hex');
BEGIN
  a:=public.create_social_login_attempt('att_10on_client_0001','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_upstream_login_leg(a,'b1000000-0000-4000-8000-000000000003','naver',cd,sd,NULL,NULL,NULL,NULL,NULL);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('33',32),'hex'),sd);
  IF result<>'CLIENT_BINDING_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='failed_safe') THEN RAISE EXCEPTION 'PHASE10O_N_CLIENT'; END IF;
END $$;

DO $$
DECLARE a uuid; result text; cd bytea:=decode(repeat('41',32),'hex'); sd bytea:=decode(repeat('42',32),'hex');
BEGIN
  a:=public.create_social_login_attempt('att_10on_expiry_0001','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_upstream_login_leg(a,'b1000000-0000-4000-8000-000000000004','naver',cd,sd,NULL,NULL,NULL,NULL,NULL);
  UPDATE private.upstream_login_legs SET created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE login_attempt_id=a;
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',cd,sd);
  IF result<>'EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='expired') THEN RAISE EXCEPTION 'PHASE10O_N_EXPIRY'; END IF;
END $$;

DO $$
DECLARE a uuid; result text; i integer; cd bytea:=decode(repeat('51',32),'hex'); sd bytea:=decode(repeat('52',32),'hex');
BEGIN
  a:=public.create_social_login_attempt('att_10on_floodx_0001','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_upstream_login_leg(a,'b1000000-0000-4000-8000-000000000005','naver',cd,sd,NULL,NULL,NULL,NULL,NULL);
  FOR i IN 1..32 LOOP SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',cd,digest('wrong-'||i::text,'sha256')); IF result<>'CORRELATION_REJECTED' THEN RAISE EXCEPTION 'PHASE10O_N_FLOOD'; END IF; END LOOP;
  IF NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE login_attempt_id=a AND status='pending' AND state_digest=sd) THEN RAISE EXCEPTION 'PHASE10O_N_FLOOD_MUTATED'; END IF;
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',cd,sd); IF result<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'PHASE10O_N_FLOOD_REAL'; END IF;
END $$;
SELECT 'PHASE10O_N_WRONG_STATE_DOS_RESISTANCE_OK' AS status;

DO $$
DECLARE a1 uuid; a2 uuid; collision boolean:=false; cd bytea:=decode(repeat('61',32),'hex'); sd bytea:=decode(repeat('62',32),'hex');
BEGIN
  a1:=public.create_social_login_attempt('att_10on_collision_0001','naver',clock_timestamp()+interval '9 minutes'); a2:=public.create_social_login_attempt('att_10on_collision_0002','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_upstream_login_leg(a1,'b1000000-0000-4000-8000-000000000006','naver',cd,sd,NULL,NULL,NULL,NULL,NULL);
  BEGIN PERFORM public.create_upstream_login_leg(a2,'b1000000-0000-4000-8000-000000000007','naver',cd,sd,NULL,NULL,NULL,NULL,NULL); EXCEPTION WHEN OTHERS THEN collision:=SQLERRM='UPSTREAM_LOGIN_LEG_STATE_COLLISION'; END;
  IF NOT collision THEN RAISE EXCEPTION 'PHASE10O_N_COLLISION'; END IF;
END $$;
SELECT 'PHASE10O_N_STATE_COLLISION_DISCRIMINATION_OK' AS status;
