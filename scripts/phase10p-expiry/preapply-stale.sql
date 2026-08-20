SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='61000000-0000-4000-8000-000000000001';
  leg_id uuid:='61000000-0000-4000-8000-000000000002';
  verification_id uuid:='61000000-0000-4000-8000-000000000003';
  reserved_account_id uuid:='61000000-0000-4000-8000-000000000004';
  expiry timestamptz:=clock_timestamp()+interval '2 seconds';
  digest_value bytea:=decode(repeat('c1',32),'hex');
  subject_value text;
  outcome text;
  delivery_id uuid;
BEGIN
  subject_value:='slb:v1:k01:google:'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_');
  attempt_id:=public.create_social_login_attempt('att_10p_preapply_stale_01','google',expiry);
  SELECT x.outcome INTO outcome FROM public.create_downstream_authorization_transaction(
    tx_id,attempt_id,decode(repeat('c2',32),'hex'),'slb-supabase-google',
    'https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('A',43),'S256',
    'preapply-nonce','preapply-state',expiry
  ) x;
  IF outcome<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PREAPPLY_TX'; END IF;
  IF (SELECT x.outcome FROM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('c2',32),'hex')) x)<>'TRANSACTION_CLAIMED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PREAPPLY_CLAIM'; END IF;
  PERFORM public.create_upstream_login_leg(attempt_id,leg_id,'google',decode(repeat('c3',32),'hex'),decode(repeat('c4',32),'hex'),decode(repeat('c5',32),'hex'),repeat('B',43),decode(repeat('c6',17),'hex'),decode(repeat('c7',12),'hex'),1);
  IF public.bind_downstream_authorization_transaction_upstream_leg(tx_id,leg_id)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PREAPPLY_BIND'; END IF;
  IF (SELECT x.outcome FROM public.claim_upstream_login_callback_by_state('google',decode(repeat('c3',32),'hex'),decode(repeat('c4',32),'hex')) x)<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PREAPPLY_CALLBACK'; END IF;
  IF public.record_verified_social_identity_from_upstream_leg(attempt_id,leg_id,'google',subject_value,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PREAPPLY_IDENTITY'; END IF;
  SELECT x.outcome,x.delivery_id INTO outcome,delivery_id FROM public.create_and_reserve_login_attempt_recovery_delivery(
    attempt_id,verification_id,reserved_account_id,decode(repeat('c8',32),'hex'),1,
    decode(repeat('c9',17),'hex'),decode(repeat('ca',12),'hex'),1,decode(repeat('cb',32),'hex'),1
  ) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent(delivery_id)<>'RECOVERY_DELIVERY_SENT' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PREAPPLY_DELIVERY'; END IF;
  UPDATE private.downstream_authorization_transactions
    SET continuation_handle_digest=decode(repeat('cc',32),'hex')
    WHERE id=tx_id AND status='upstream_bound';
  IF NOT FOUND THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_PREAPPLY_CONTINUATION_FIXTURE'; END IF;
  PERFORM pg_sleep(2.2);
END $$;

SELECT 'PHASE10P_STALE_PREAPPLY_FIXTURE_OK' AS status;
