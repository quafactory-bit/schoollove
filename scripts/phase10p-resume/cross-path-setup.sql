SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  digest bytea:=decode(repeat('d1',32),'hex');
  subject text:='slb:v1:k01:google:'||translate(rtrim(encode(digest,'base64'),'='),'+/','-_');
  source_attempt uuid;
  source_tx uuid:='75000000-0000-4000-8000-000000000001';
  source_leg uuid:='75000000-0000-4000-8000-000000000002';
  verification uuid:='75000000-0000-4000-8000-000000000003';
  account uuid:='75000000-0000-4000-8000-000000000004';
  source_code uuid:='75000000-0000-4000-8000-000000000005';
  next_attempt uuid;
  next_tx uuid:='76000000-0000-4000-8000-000000000001';
  next_leg uuid:='76000000-0000-4000-8000-000000000002';
  outcome text;
BEGIN
  source_attempt:=public.create_social_login_attempt('att_10p_cross_source','google',clock_timestamp()+interval '12 seconds');
  PERFORM public.create_downstream_authorization_transaction(source_tx,source_attempt,decode(repeat('d2',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('Q',43),'S256',NULL,'cross-source',clock_timestamp()+interval '11 seconds');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('d2',32),'hex'));
  PERFORM public.create_upstream_login_leg(source_attempt,source_leg,'google',decode(repeat('d3',32),'hex'),decode(repeat('d4',32),'hex'),decode(repeat('d5',32),'hex'),repeat('R',43),decode(repeat('d6',17),'hex'),decode(repeat('d7',12),'hex'),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(source_tx,source_leg);
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('d3',32),'hex'),decode(repeat('d4',32),'hex'));
  IF public.record_verified_social_identity_from_upstream_leg(source_attempt,source_leg,'google',subject,digest,1)<>'RECOVERY_REQUIRED' THEN
    RAISE EXCEPTION 'PHASE10P_CROSS_SOURCE_IDENTITY';
  END IF;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(source_attempt,verification,account,decode(repeat('d8',32),'hex'),1,decode(repeat('d9',17),'hex'),decode(repeat('da',12),'hex'),1,decode(repeat('db',32),'hex'),1) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' THEN RAISE EXCEPTION 'PHASE10P_CROSS_SOURCE_RECOVERY'; END IF;
  PERFORM public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=verification));
  PERFORM public.consume_recovery_and_decide_social_account(source_attempt,verification,decode(repeat('db',32),'hex'));
  SELECT x.outcome INTO outcome FROM public.issue_transaction_bound_broker_authorization_code(source_tx,source_code,decode(repeat('dc',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL) x;
  IF outcome<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10P_CROSS_SOURCE_CODE'; END IF;

  next_attempt:=public.create_social_login_attempt('att_10p_cross_candidate','google',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(next_tx,next_attempt,decode(repeat('dd',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('S',43),'S256',NULL,'cross-candidate',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('dd',32),'hex'));
  PERFORM public.create_upstream_login_leg(next_attempt,next_leg,'google',decode(repeat('de',32),'hex'),decode(repeat('df',32),'hex'),decode(repeat('e0',32),'hex'),repeat('T',43),decode(repeat('e1',17),'hex'),decode(repeat('e2',12),'hex'),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(next_tx,next_leg);
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('de',32),'hex'),decode(repeat('df',32),'hex'));
END $$;

SELECT 'PHASE10P_PROVISIONAL_RESUME_CROSS_PATH_SETUP_OK' AS status;
