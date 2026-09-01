SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE
  d bytea:=decode(repeat('b1',32),'hex'); s text:='slb:v1:k01:google:'||translate(rtrim(encode(d,'base64'),'='),'+/','-_');
  a uuid; tx uuid:='71000000-0000-4000-8000-000000000001'; leg uuid:='71000000-0000-4000-8000-000000000002';
  verification uuid:='71000000-0000-4000-8000-000000000003'; account uuid:='71000000-0000-4000-8000-000000000004'; code uuid:='71000000-0000-4000-8000-000000000005'; outcome text;
  next_a uuid; next_tx uuid; next_leg uuid; index_value integer;
BEGIN
  a:=public.create_social_login_attempt('att_10p_resume_race_source','google',clock_timestamp()+interval '12 seconds');
  PERFORM public.create_downstream_authorization_transaction(tx,a,decode(repeat('b2',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('A',43),'S256',NULL,'race-source',clock_timestamp()+interval '11 seconds');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('b2',32),'hex'));
  PERFORM public.create_upstream_login_leg(a,leg,'google',decode(repeat('b3',32),'hex'),decode(repeat('b4',32),'hex'),decode(repeat('b5',32),'hex'),repeat('B',43),decode(repeat('b6',17),'hex'),decode(repeat('b7',12),'hex'),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(tx,leg);
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('b3',32),'hex'),decode(repeat('b4',32),'hex'));
  IF public.record_verified_social_identity_from_upstream_leg(a,leg,'google',s,d,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_RESUME_RACE_SOURCE_IDENTITY'; END IF;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(a,verification,account,decode(repeat('b8',32),'hex'),1,decode(repeat('b9',17),'hex'),decode(repeat('ba',12),'hex'),1,decode(repeat('bb',32),'hex'),1) x;
  PERFORM public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=verification));
  PERFORM public.consume_recovery_and_decide_social_account(a,verification,decode(repeat('bb',32),'hex'));
  PERFORM public.issue_transaction_bound_broker_authorization_code(tx,code,decode(repeat('bc',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL);
  PERFORM pg_sleep(13);

  FOR index_value IN 1..2 LOOP
    next_tx:=CASE index_value WHEN 1 THEN '72000000-0000-4000-8000-000000000001'::uuid ELSE '73000000-0000-4000-8000-000000000001'::uuid END;
    next_leg:=CASE index_value WHEN 1 THEN '72000000-0000-4000-8000-000000000002'::uuid ELSE '73000000-0000-4000-8000-000000000002'::uuid END;
    next_a:=public.create_social_login_attempt('att_10p_resume_race_00'||index_value,'google',clock_timestamp()+interval '10 minutes');
    PERFORM public.create_downstream_authorization_transaction(next_tx,next_a,CASE index_value WHEN 1 THEN decode(repeat('bd',32),'hex') ELSE decode(repeat('be',32),'hex') END,'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',CASE index_value WHEN 1 THEN repeat('C',43) ELSE repeat('D',43) END,'S256',NULL,'race-next-'||index_value,clock_timestamp()+interval '5 minutes');
    PERFORM public.claim_downstream_authorization_transaction_by_handle(CASE index_value WHEN 1 THEN decode(repeat('bd',32),'hex') ELSE decode(repeat('be',32),'hex') END);
    PERFORM public.create_upstream_login_leg(next_a,next_leg,'google',CASE index_value WHEN 1 THEN decode(repeat('bf',32),'hex') ELSE decode(repeat('c0',32),'hex') END,CASE index_value WHEN 1 THEN decode(repeat('c1',32),'hex') ELSE decode(repeat('c2',32),'hex') END,CASE index_value WHEN 1 THEN decode(repeat('c3',32),'hex') ELSE decode(repeat('c4',32),'hex') END,CASE index_value WHEN 1 THEN repeat('E',43) ELSE repeat('F',43) END,decode(repeat('c5',17),'hex'),decode(repeat('c6',12),'hex'),1);
    PERFORM public.bind_downstream_authorization_transaction_upstream_leg(next_tx,next_leg);
    PERFORM public.claim_upstream_login_callback_by_state('google',CASE index_value WHEN 1 THEN decode(repeat('bf',32),'hex') ELSE decode(repeat('c0',32),'hex') END,CASE index_value WHEN 1 THEN decode(repeat('c1',32),'hex') ELSE decode(repeat('c2',32),'hex') END);
  END LOOP;
END $$;
SELECT 'PHASE10P_PROVISIONAL_RESUME_RACE_SETUP_OK' AS status;
