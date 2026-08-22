SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  d bytea:=decode(repeat('91',32),'hex'); s text:='slb:v1:k01:google:'||translate(rtrim(encode(d,'base64'),'='),'+/','-_');
  a uuid; tx uuid:=gen_random_uuid(); leg uuid:=gen_random_uuid(); outcome text;
BEGIN
  -- PR #62 alone keeps this bound tuple fail-closed. The later PHASE 10P
  -- activation migration intentionally recognizes only its exact Auth-bound
  -- provisional shape and must not weaken any of the other negative cases.
  a:=public.create_social_login_attempt('att_10p_resume_bound_block','google',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(tx,a,decode(repeat('d1',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('G',43),'S256',NULL,'bound-block',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('d1',32),'hex'));
  PERFORM public.create_upstream_login_leg(a,leg,'google',decode(repeat('d2',32),'hex'),decode(repeat('d3',32),'hex'),decode(repeat('d4',32),'hex'),repeat('H',43),decode(repeat('d5',17),'hex'),decode(repeat('d6',12),'hex'),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(tx,leg);
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('d2',32),'hex'),decode(repeat('d3',32),'hex'));
  outcome:=public.record_verified_social_identity_from_upstream_leg(a,leg,'google',s,d,1);
  IF to_regprocedure('private.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)') IS NULL THEN
    IF outcome<>'IDENTITY_DECISION_IN_PROGRESS' OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'failed_safe'
    THEN RAISE EXCEPTION 'PHASE10P_RESUME_BOUND_PRINCIPAL_FAIL_OPEN %',outcome; END IF;
  ELSE
    IF outcome<>'BOUND_PROVISIONAL_REAUTH_READY' OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'auth_principal_bound'
    THEN RAISE EXCEPTION 'PHASE10P_RESUME_BOUND_PRINCIPAL_REAUTH_REJECTED %',outcome; END IF;
  END IF;
END $$;

DO $$
DECLARE
  d bytea:=decode(repeat('e1',32),'hex'); s text:='slb:v1:k01:naver:'||translate(rtrim(encode(d,'base64'),'='),'+/','-_');
  source uuid; source_tx uuid:=gen_random_uuid(); source_leg uuid:=gen_random_uuid(); verification uuid:=gen_random_uuid(); account uuid:=gen_random_uuid(); code uuid:=gen_random_uuid();
  next_attempt uuid; next_tx uuid:=gen_random_uuid(); next_leg uuid:=gen_random_uuid(); outcome text; before_verifications integer; before_deliveries integer;
BEGIN
  -- A live broker_code_ready source and its still-live code are not orphans.
  source:=public.create_social_login_attempt('att_10p_resume_live_source','naver',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(source_tx,source,decode(repeat('e2',32),'hex'),'slb-supabase-naver','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('I',43),'S256',NULL,'live-source',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('e2',32),'hex'));
  PERFORM public.create_upstream_login_leg(source,source_leg,'naver',decode(repeat('e3',32),'hex'),decode(repeat('e4',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(source_tx,source_leg);
  PERFORM public.claim_upstream_login_callback_by_state('naver',decode(repeat('e3',32),'hex'),decode(repeat('e4',32),'hex'));
  IF public.record_verified_social_identity_from_upstream_leg(source,source_leg,'naver',s,d,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10P_RESUME_LIVE_SOURCE_IDENTITY'; END IF;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(source,verification,account,decode(repeat('e5',32),'hex'),1,decode(repeat('e6',17),'hex'),decode(repeat('e7',12),'hex'),1,decode(repeat('e8',32),'hex'),1) x;
  PERFORM public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=verification));
  PERFORM public.consume_recovery_and_decide_social_account(source,verification,decode(repeat('e8',32),'hex'));
  PERFORM public.issue_transaction_bound_broker_authorization_code(source_tx,code,decode(repeat('e9',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL);
  SELECT count(*) INTO before_verifications FROM private.recovery_email_verifications; SELECT count(*) INTO before_deliveries FROM private.recovery_delivery_attempts;

  next_attempt:=public.create_social_login_attempt('att_10p_resume_live_block','naver',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(next_tx,next_attempt,decode(repeat('ea',32),'hex'),'slb-supabase-naver','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('J',43),'S256',NULL,'live-block',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('ea',32),'hex'));
  PERFORM public.create_upstream_login_leg(next_attempt,next_leg,'naver',decode(repeat('eb',32),'hex'),decode(repeat('ec',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(next_tx,next_leg);
  PERFORM public.claim_upstream_login_callback_by_state('naver',decode(repeat('eb',32),'hex'),decode(repeat('ec',32),'hex'));
  outcome:=public.record_verified_social_identity_from_upstream_leg(next_attempt,next_leg,'naver',s,d,1);
  IF outcome<>'IDENTITY_DECISION_IN_PROGRESS' OR (SELECT state FROM private.oauth_login_attempts WHERE id=source)<>'broker_code_ready'
    OR (SELECT state FROM private.broker_authorization_codes WHERE id=code)<>'ready'
    OR (SELECT count(*) FROM private.recovery_email_verifications)<>before_verifications OR (SELECT count(*) FROM private.recovery_delivery_attempts)<>before_deliveries
  THEN RAISE EXCEPTION 'PHASE10P_RESUME_LIVE_SOURCE_FAIL_OPEN %',outcome; END IF;
END $$;

SELECT CASE
  WHEN to_regprocedure('private.record_verified_identity_before_bound_reauth(uuid,uuid,text,text,bytea,integer)') IS NULL
    THEN 'PHASE10P_PROVISIONAL_RESUME_BOUND_PRINCIPAL_BLOCKED_OK'
  ELSE 'PHASE10P_BOUND_PROVISIONAL_REAUTH_READY_REGRESSION_OK'
END AS status;
SELECT 'PHASE10P_PROVISIONAL_RESUME_LIVE_SOURCE_AND_CODE_BLOCKED_OK' AS status;
