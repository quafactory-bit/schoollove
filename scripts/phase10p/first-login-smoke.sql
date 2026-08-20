SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  attempt_id uuid; recovery_verification_id uuid:=gen_random_uuid(); reserved_account_id uuid:=gen_random_uuid();
  transaction_id uuid:=gen_random_uuid(); leg_id uuid:=gen_random_uuid(); code_id uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid(); other_auth_id uuid:=gen_random_uuid(); wrong_provider_auth_id uuid:=gen_random_uuid(); wrong_provider_id_auth_id uuid:=gen_random_uuid();
  retained_attempt uuid; retained_verification uuid:=gen_random_uuid(); retained_reserved uuid:=gen_random_uuid(); retained_tx uuid:=gen_random_uuid(); retained_leg uuid:=gen_random_uuid(); retained_digest bytea:=decode(repeat('e1',32),'hex'); retained_subject text; retained_provider text;
  subject_digest bytea:=decode(repeat('d1',32),'hex'); subject_value text; outcome text; context_row record; rejected boolean:=false;
BEGIN
  subject_value:='slb:v1:k01:google:'||translate(rtrim(encode(subject_digest,'base64'),'='),'+/','-_');
  attempt_id:=public.create_social_login_attempt('att_phase10p_first_login_01','google',clock_timestamp()+interval '10 minutes');
  SELECT x.outcome INTO outcome FROM public.create_downstream_authorization_transaction(transaction_id,attempt_id,decode(repeat('d2',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('A',43),'S256',NULL,'exact state +/%? 한글',clock_timestamp()+interval '5 minutes') x;
  IF outcome<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10P_TX'; END IF;
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('d2',32),'hex'));
  PERFORM public.create_upstream_login_leg(attempt_id,leg_id,'google',decode(repeat('d3',32),'hex'),decode(repeat('d4',32),'hex'),decode(repeat('d5',32),'hex'),repeat('B',43),decode(repeat('d6',17),'hex'),decode(repeat('d7',12),'hex'),1);
  IF public.bind_downstream_authorization_transaction_upstream_leg(transaction_id,leg_id)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10P_BIND_LEG'; END IF;
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('d3',32),'hex'),decode(repeat('d4',32),'hex'));
  IF public.record_verified_social_identity_from_upstream_leg(attempt_id,leg_id,'google',subject_value,subject_digest,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_IDENTITY'; END IF;
  IF public.get_social_recovery_http_context(attempt_id)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_RECOVERY_CONTEXT'; END IF;
  SELECT * INTO context_row FROM public.get_transaction_bound_broker_code_issuance_context(attempt_id);
  IF FOUND OR EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE login_attempt_id=attempt_id) THEN RAISE EXCEPTION 'PHASE10P_PREMATURE_CODE'; END IF;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(attempt_id,recovery_verification_id,reserved_account_id,decode(repeat('d8',32),'hex'),1,decode(repeat('d9',17),'hex'),decode(repeat('da',12),'hex'),1,decode(repeat('db',32),'hex'),1) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent((SELECT delivery.id FROM private.recovery_delivery_attempts delivery WHERE delivery.verification_id=recovery_verification_id))<>'RECOVERY_DELIVERY_SENT' THEN RAISE EXCEPTION 'PHASE10P_DELIVERY'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_recovery_and_decide_social_account(attempt_id,recovery_verification_id,decode(repeat('db',32),'hex')) x;
  IF outcome<>'ACCOUNT_DECIDED' THEN RAISE EXCEPTION 'PHASE10P_DECISION'; END IF;
  IF EXISTS(SELECT 1 FROM private.recovery_email_verifications recovery WHERE recovery.id=recovery_verification_id AND (recovery.recovery_email_hmac IS NOT NULL OR recovery.destination_ciphertext IS NOT NULL OR recovery.destination_nonce IS NOT NULL OR recovery.otp_mac IS NOT NULL)) THEN RAISE EXCEPTION 'PHASE10P_TERMINAL_RECOVERY_SECRET'; END IF;
  SELECT * INTO context_row FROM public.get_transaction_bound_broker_code_issuance_context(attempt_id);
  IF context_row.authorization_transaction_id<>transaction_id OR context_row.redirect_uri<>'https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback' OR context_row.downstream_state<>'exact state +/%? 한글' THEN RAISE EXCEPTION 'PHASE10P_CONTEXT'; END IF;
  SELECT x.outcome INTO outcome FROM public.issue_transaction_bound_broker_authorization_code(transaction_id,code_id,decode(repeat('dc',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL) x;
  IF outcome<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10P_ISSUE'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('dc',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback',repeat('A',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_CONSUMED' THEN RAISE EXCEPTION 'PHASE10P_CODE_CONSUME'; END IF;
  INSERT INTO auth.users(id,email) VALUES(auth_id,NULL),(other_auth_id,NULL),(wrong_provider_auth_id,NULL),(wrong_provider_id_auth_id,NULL);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) VALUES
    (gen_random_uuid(),auth_id,subject_value,'schoollove-google',jsonb_build_object('sub',subject_value)),
    (gen_random_uuid(),other_auth_id,'wrong-subject','schoollove-google',jsonb_build_object('sub','wrong-subject')),
    (gen_random_uuid(),wrong_provider_auth_id,subject_value,'schoollove-kakao',jsonb_build_object('sub',subject_value)),
    (gen_random_uuid(),wrong_provider_id_auth_id,'wrong-provider-id','schoollove-google',jsonb_build_object('sub',subject_value));
  BEGIN PERFORM public.bind_social_auth_principal_from_attempt(attempt_id,other_auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10P_WRONG_SESSION'; END IF;
  rejected:=false; BEGIN PERFORM public.bind_social_auth_principal_from_attempt(attempt_id,wrong_provider_auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10P_WRONG_CUSTOM_PROVIDER'; END IF;
  rejected:=false; BEGIN PERFORM public.bind_social_auth_principal_from_attempt(attempt_id,wrong_provider_id_auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10P_WRONG_PROVIDER_SUBJECT'; END IF;
  rejected:=false; BEGIN PERFORM public.bind_social_auth_principal_from_attempt(gen_random_uuid(),auth_id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SOCIAL_PRINCIPAL_BINDING_REJECTED%'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'PHASE10P_WRONG_ATTEMPT'; END IF;
  IF public.bind_social_auth_principal_from_attempt(attempt_id,auth_id)<>'AUTH_PRINCIPAL_BOUND' OR public.bind_social_auth_principal_from_attempt(attempt_id,auth_id)<>'AUTH_PRINCIPAL_ALREADY_BOUND' THEN RAISE EXCEPTION 'PHASE10P_PRINCIPAL'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id=reserved_account_id AND auth_user_id=auth_id AND status='provisional')
    OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject=subject_value AND auth_user_id=auth_id AND status='provisional')
    OR EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=transaction_id AND (status<>'consumed' OR downstream_nonce IS NOT NULL OR downstream_state IS NOT NULL))
  THEN RAISE EXCEPTION 'PHASE10P_FINAL_INVARIANT'; END IF;

  -- Retained recovery identity: the new provider must not be attached or issued.
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET status='active',activated_at=clock_timestamp() WHERE id=reserved_account_id;
  UPDATE private.social_identity_registry SET status='active',activated_at=clock_timestamp() WHERE account_id=reserved_account_id;
  retained_subject:='slb:v1:k01:kakao:'||translate(rtrim(encode(retained_digest,'base64'),'='),'+/','-_');
  retained_attempt:=public.create_social_login_attempt('att_phase10p_retained_00001','kakao',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(retained_tx,retained_attempt,decode(repeat('e2',32),'hex'),'slb-supabase-kakao','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('E',43),'S256',NULL,'retained-state',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('e2',32),'hex'));
  PERFORM public.create_upstream_login_leg(retained_attempt,retained_leg,'kakao',decode(repeat('e3',32),'hex'),decode(repeat('e4',32),'hex'),decode(repeat('e5',32),'hex'),repeat('F',43),decode(repeat('e6',17),'hex'),decode(repeat('e7',12),'hex'),1);
  IF public.bind_downstream_authorization_transaction_upstream_leg(retained_tx,retained_leg)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10P_RETAINED_LEG'; END IF;
  PERFORM public.claim_upstream_login_callback_by_state('kakao',decode(repeat('e3',32),'hex'),decode(repeat('e4',32),'hex'));
  IF public.record_verified_social_identity_from_upstream_leg(retained_attempt,retained_leg,'kakao',retained_subject,retained_digest,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_RETAINED_IDENTITY'; END IF;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(retained_attempt,retained_verification,retained_reserved,decode(repeat('d8',32),'hex'),1,decode(repeat('e8',17),'hex'),decode(repeat('e9',12),'hex'),1,decode(repeat('ea',32),'hex'),1) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent((SELECT delivery.id FROM private.recovery_delivery_attempts delivery WHERE delivery.verification_id=retained_verification))<>'RECOVERY_DELIVERY_SENT' THEN RAISE EXCEPTION 'PHASE10P_RETAINED_DELIVERY'; END IF;
  SELECT x.outcome,x.primary_provider INTO outcome,retained_provider FROM public.consume_recovery_and_decide_social_account(retained_attempt,retained_verification,decode(repeat('ea',32),'hex')) x;
  IF outcome<>'USE_PRIMARY_PROVIDER' OR retained_provider<>'google'
    OR EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject=retained_subject)
    OR EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE login_attempt_id=retained_attempt)
    OR (SELECT count(*) FROM private.private_accounts)<>1
  THEN RAISE EXCEPTION 'PHASE10P_RETAINED_PROVIDER_CROSS_LINK'; END IF;
END $$;

SELECT 'PHASE10P_FIRST_LOGIN_RECOVERY_FINALIZATION_OK' AS status;
SELECT 'PHASE10P_POST_OIDC_PRINCIPAL_BINDING_OK' AS status;
SELECT 'PHASE10P_USE_PRIMARY_PROVIDER_NO_CROSS_LINK_OK' AS status;
