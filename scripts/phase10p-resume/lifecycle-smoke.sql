SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  subject_digest bytea:=decode(repeat('91',32),'hex');
  subject_value text:='slb:v1:k01:google:'||translate(rtrim(encode(subject_digest,'base64'),'='),'+/','-_');
  source_attempt uuid; source_tx uuid:=gen_random_uuid(); source_leg uuid:=gen_random_uuid();
  source_verification uuid:=gen_random_uuid(); reserved_account_id uuid:=gen_random_uuid(); source_code uuid:=gen_random_uuid();
  next_attempt uuid; next_tx uuid:=gen_random_uuid(); next_leg uuid:=gen_random_uuid(); next_code uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid();
  outcome text; verification_count integer; delivery_count integer;
BEGIN
  source_attempt:=public.create_social_login_attempt('att_10p_resume_source_001','google',clock_timestamp()+interval '12 seconds');
  PERFORM public.create_downstream_authorization_transaction(source_tx,source_attempt,decode(repeat('92',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('A',43),'S256',NULL,'source-state',clock_timestamp()+interval '11 seconds');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('92',32),'hex'));
  PERFORM public.create_upstream_login_leg(source_attempt,source_leg,'google',decode(repeat('93',32),'hex'),decode(repeat('94',32),'hex'),decode(repeat('95',32),'hex'),repeat('B',43),decode(repeat('96',17),'hex'),decode(repeat('97',12),'hex'),1);
  IF public.bind_downstream_authorization_transaction_upstream_leg(source_tx,source_leg)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10P_RESUME_SOURCE_BIND'; END IF;
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('93',32),'hex'),decode(repeat('94',32),'hex'));
  IF public.record_verified_social_identity_from_upstream_leg(source_attempt,source_leg,'google',subject_value,subject_digest,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_RESUME_SOURCE_IDENTITY'; END IF;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(source_attempt,source_verification,reserved_account_id,decode(repeat('98',32),'hex'),1,decode(repeat('99',17),'hex'),decode(repeat('9a',12),'hex'),1,decode(repeat('9b',32),'hex'),1) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' THEN RAISE EXCEPTION 'PHASE10P_RESUME_SOURCE_RECOVERY'; END IF;
  IF public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=source_verification))<>'RECOVERY_DELIVERY_SENT' THEN RAISE EXCEPTION 'PHASE10P_RESUME_SOURCE_SENT'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_recovery_and_decide_social_account(source_attempt,source_verification,decode(repeat('9b',32),'hex')) x;
  IF outcome<>'ACCOUNT_DECIDED' THEN RAISE EXCEPTION 'PHASE10P_RESUME_SOURCE_DECISION'; END IF;
  SELECT x.outcome INTO outcome FROM public.issue_transaction_bound_broker_authorization_code(source_tx,source_code,decode(repeat('9c',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL) x;
  IF outcome<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10P_RESUME_SOURCE_CODE'; END IF;
  SELECT count(*) INTO verification_count FROM private.recovery_email_verifications;
  SELECT count(*) INTO delivery_count FROM private.recovery_delivery_attempts;
  PERFORM pg_sleep(13);

  next_attempt:=public.create_social_login_attempt('att_10p_resume_next_0001','google',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(next_tx,next_attempt,decode(repeat('9d',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('C',43),'S256',NULL,'next-state',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('9d',32),'hex'));
  PERFORM public.create_upstream_login_leg(next_attempt,next_leg,'google',decode(repeat('9e',32),'hex'),decode(repeat('9f',32),'hex'),decode(repeat('a0',32),'hex'),repeat('D',43),decode(repeat('a1',17),'hex'),decode(repeat('a2',12),'hex'),1);
  IF public.bind_downstream_authorization_transaction_upstream_leg(next_tx,next_leg)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10P_RESUME_NEXT_BIND'; END IF;
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('9e',32),'hex'),decode(repeat('9f',32),'hex'));
  outcome:=public.record_verified_social_identity_from_upstream_leg(next_attempt,next_leg,'google',subject_value,subject_digest,1);
  IF outcome<>'PROVISIONAL_RESUME_READY' THEN RAISE EXCEPTION 'PHASE10P_RESUME_OUTCOME %',outcome; END IF;
  IF (SELECT state FROM private.oauth_login_attempts WHERE id=source_attempt)<>'expired'
    OR (SELECT state FROM private.broker_authorization_codes WHERE id=source_code)<>'expired'
    OR (SELECT status FROM private.downstream_authorization_transactions WHERE id=source_tx)<>'consumed'
    OR (SELECT status FROM private.upstream_login_legs WHERE id=source_leg)<>'verified'
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts a WHERE a.id=next_attempt AND a.state='account_decided' AND a.account_id=reserved_account_id)
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=next_leg AND status='verified')
    OR (SELECT count(*) FROM private.private_accounts)<>1 OR (SELECT count(*) FROM private.social_identity_registry)<>1
    OR (SELECT count(*) FROM private.recovery_email_verifications)<>verification_count
    OR (SELECT count(*) FROM private.recovery_delivery_attempts)<>delivery_count
  THEN RAISE EXCEPTION 'PHASE10P_RESUME_ADOPTION_INVARIANT'; END IF;

  SELECT x.outcome INTO outcome FROM public.issue_transaction_bound_broker_authorization_code(next_tx,next_code,decode(repeat('a3',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL) x;
  IF outcome<>'AUTHORIZATION_CODE_CREATED' OR (SELECT state FROM private.oauth_login_attempts WHERE id=next_attempt)<>'broker_code_ready' THEN RAISE EXCEPTION 'PHASE10P_RESUME_FRESH_CODE'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('a3',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback',repeat('C',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_CONSUMED' THEN RAISE EXCEPTION 'PHASE10P_RESUME_TOKEN_CONSUME'; END IF;
  INSERT INTO auth.users(id,email) VALUES(auth_id,NULL);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) VALUES(gen_random_uuid(),auth_id,subject_value,'custom:schoollove-google',jsonb_build_object('sub',subject_value));
  IF public.bind_social_auth_principal_from_attempt(next_attempt,auth_id)<>'AUTH_PRINCIPAL_BOUND' THEN RAISE EXCEPTION 'PHASE10P_RESUME_PRINCIPAL'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.private_accounts a WHERE a.id=reserved_account_id AND a.auth_user_id=auth_id)
    OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry r WHERE r.broker_subject=subject_value AND r.account_id=reserved_account_id AND r.auth_user_id=auth_id)
    OR (SELECT count(*) FROM private.broker_authorization_codes)<>2
  THEN RAISE EXCEPTION 'PHASE10P_RESUME_FINAL_BINDING'; END IF;
END $$;

SELECT 'PHASE10P_EXPIRED_UNBOUND_PROVISIONAL_RESUME_OK' AS status;
SELECT 'PHASE10P_PROVISIONAL_RESUME_NO_SECOND_RECOVERY_OK' AS status;
SELECT 'PHASE10P_PROVISIONAL_RESUME_TOKEN_AND_PRINCIPAL_BINDING_OK' AS status;
