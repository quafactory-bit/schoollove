SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  target_account uuid:='d1000000-0000-4000-8000-000000000001';
  source_attempt uuid:='d1000000-0000-4000-8000-000000000003';
  d bytea:=decode(repeat('d1',32),'hex');
  s text:='slb:v1:k01:google:'||translate(rtrim(encode(d,'base64'),'='),'+/','-_');
  next_attempt uuid; next_tx uuid:='d2000000-0000-4000-8000-000000000001'; next_leg uuid:='d2000000-0000-4000-8000-000000000002'; next_code uuid:='d2000000-0000-4000-8000-000000000003';
  active_attempt uuid; active_tx uuid:='d3000000-0000-4000-8000-000000000001'; active_leg uuid:='d3000000-0000-4000-8000-000000000002';
  outcome text; before_recovery integer; before_delivery integer; check_name text;
BEGIN
  IF (SELECT count(*) FROM public.public_account_launch_control)<>1
    OR NOT EXISTS(SELECT 1 FROM public.public_account_launch_control WHERE control_key='public_account' AND state='closed'
      AND account_registration_enabled=false AND private_profile_enabled=false AND school_membership_enabled=false AND emergency_stopped_at IS NULL)
    OR (SELECT count(*) FROM public.public_account_launch_audit WHERE reason_code='MISSING_SINGLETON_RESTORED_CLOSED')<>1
    OR NOT EXISTS(SELECT 1 FROM private.private_accounts a WHERE a.id=target_account AND a.status='provisional' AND a.auth_user_id IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry r WHERE r.account_id=target_account AND r.status='provisional' AND r.auth_user_id IS NOT NULL)
  THEN RAISE EXCEPTION 'PHASE10P_SINGLETON_REPAIR_OR_ACCOUNT_PRESERVATION_FAILED'; END IF;

  IF public.activate_social_account_from_attempt(source_attempt)<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RAISE EXCEPTION 'PHASE10P_CLOSED_ACTIVATION'; END IF;
  UPDATE public.public_account_launch_control SET state='ready',account_registration_enabled=false,private_profile_enabled=false,school_membership_enabled=false,emergency_stopped_at=NULL;
  IF public.activate_social_account_from_attempt(source_attempt)<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RAISE EXCEPTION 'PHASE10P_READY_ACTIVATION'; END IF;
  UPDATE public.public_account_launch_control SET state='internal_test',account_registration_enabled=false,private_profile_enabled=true,school_membership_enabled=true,emergency_stopped_at=NULL;
  IF public.activate_social_account_from_attempt(source_attempt)<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RAISE EXCEPTION 'PHASE10P_INTERNAL_ACTIVATION'; END IF;
  UPDATE public.public_account_launch_control SET state='emergency_stopped',account_registration_enabled=false,private_profile_enabled=false,school_membership_enabled=false,emergency_stopped_at=clock_timestamp();
  IF public.activate_social_account_from_attempt(source_attempt)<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RAISE EXCEPTION 'PHASE10P_EMERGENCY_ACTIVATION'; END IF;

  DELETE FROM public.public_account_launch_control;
  IF public.activate_social_account_from_attempt(source_attempt)<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RAISE EXCEPTION 'PHASE10P_ZERO_ACTIVATION'; END IF;
  INSERT INTO public.public_account_launch_control(control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,emergency_stopped_at,last_reason_code,updated_by)
    VALUES('public_account','closed',false,false,false,NULL,'TEST_CLOSED','isolated_test');

  SELECT count(*) INTO before_recovery FROM private.recovery_email_verifications;
  SELECT count(*) INTO before_delivery FROM private.recovery_delivery_attempts;
  next_attempt:=public.create_social_login_attempt('att_10p_bound_reauth_001','google',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(next_tx,next_attempt,decode(repeat('d5',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('A',43),'S256',NULL,'bound-state',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('d5',32),'hex'));
  PERFORM public.create_upstream_login_leg(next_attempt,next_leg,'google',decode(repeat('d6',32),'hex'),decode(repeat('d7',32),'hex'),decode(repeat('d8',32),'hex'),repeat('B',43),decode(repeat('d9',17),'hex'),decode(repeat('da',12),'hex'),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(next_tx,next_leg);
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('d6',32),'hex'),decode(repeat('d7',32),'hex'));
  outcome:=public.record_verified_social_identity_from_upstream_leg(next_attempt,next_leg,'google',s,d,1);
  IF outcome<>'BOUND_PROVISIONAL_REAUTH_READY' OR (SELECT state FROM private.oauth_login_attempts WHERE id=next_attempt)<>'auth_principal_bound' THEN RAISE EXCEPTION 'PHASE10P_BOUND_REAUTH %',outcome; END IF;
  SELECT x.outcome INTO outcome FROM public.issue_transaction_bound_broker_authorization_code(next_tx,next_code,decode(repeat('db',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL) x;
  IF outcome<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10P_BOUND_REAUTH_ISSUE'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('db',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback',repeat('A',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_CONSUMED' OR public.activate_social_account_from_attempt(next_attempt)<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED'
    OR (SELECT count(*) FROM private.private_accounts)<>1 OR (SELECT count(*) FROM private.social_identity_registry)<>1
    OR (SELECT count(*) FROM private.recovery_email_verifications)<>before_recovery
    OR (SELECT count(*) FROM private.recovery_delivery_attempts)<>before_delivery
  THEN RAISE EXCEPTION 'PHASE10P_CLOSED_REAUTH_DELTAS'; END IF;

  -- Simulate malformed and ambiguous catalog states only after dropping launch
  -- checks in this disposable database. The hardened function must still reject.
  FOR check_name IN SELECT conname FROM pg_constraint WHERE conrelid='public.public_account_launch_control'::regclass AND contype='c'
  LOOP EXECUTE format('ALTER TABLE public.public_account_launch_control DROP CONSTRAINT %I',check_name); END LOOP;
  ALTER TABLE public.public_account_launch_control ALTER COLUMN state DROP NOT NULL;
  UPDATE public.public_account_launch_control SET state=NULL,account_registration_enabled=true,private_profile_enabled=true,school_membership_enabled=true;
  IF public.activate_social_account_from_attempt(next_attempt)<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RAISE EXCEPTION 'PHASE10P_MALFORMED_ACTIVATION'; END IF;
  SELECT conname INTO check_name FROM pg_constraint WHERE conrelid='public.public_account_launch_control'::regclass AND contype='p';
  EXECUTE format('ALTER TABLE public.public_account_launch_control DROP CONSTRAINT %I',check_name);
  UPDATE public.public_account_launch_control SET control_key='public_account',state='closed',account_registration_enabled=false,private_profile_enabled=false,school_membership_enabled=false,emergency_stopped_at=NULL;
  INSERT INTO public.public_account_launch_control(control_key,state,account_registration_enabled,private_profile_enabled,school_membership_enabled,emergency_stopped_at,last_reason_code,updated_by)
    VALUES('ambiguous','open',true,true,true,NULL,'TEST_AMBIGUOUS','isolated_test');
  IF public.activate_social_account_from_attempt(next_attempt)<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RAISE EXCEPTION 'PHASE10P_AMBIGUOUS_ACTIVATION'; END IF;
  DELETE FROM public.public_account_launch_control WHERE control_key='ambiguous';
  UPDATE public.public_account_launch_control SET state='open',account_registration_enabled=true,private_profile_enabled=true,school_membership_enabled=true,emergency_stopped_at=NULL;

  outcome:=public.activate_social_account_from_attempt(next_attempt);
  IF outcome<>'SOCIAL_ACCOUNT_ACTIVATED' THEN
    RAISE EXCEPTION 'PHASE10P_EXACT_OPEN_ACTIVATION_FIRST %',outcome;
  END IF;
  outcome:=public.activate_social_account_from_attempt(next_attempt);
  IF outcome<>'SOCIAL_ACCOUNT_ALREADY_ACTIVE'
    OR NOT EXISTS(SELECT 1 FROM private.private_accounts a WHERE a.id=target_account AND a.status='active' AND a.activated_at IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry r WHERE r.account_id=target_account AND r.status='active' AND r.activated_at IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM private.private_accounts a JOIN private.social_identity_registry r ON r.account_id=a.id
      WHERE a.id=target_account AND a.activated_at=r.activated_at)
  THEN RAISE EXCEPTION 'PHASE10P_EXACT_OPEN_ACTIVATION'; END IF;

  active_attempt:=public.create_social_login_attempt('att_10p_active_reauth_001','google',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(active_tx,active_attempt,decode(repeat('dc',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('C',43),'S256',NULL,'active-state',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('dc',32),'hex'));
  PERFORM public.create_upstream_login_leg(active_attempt,active_leg,'google',decode(repeat('dd',32),'hex'),decode(repeat('de',32),'hex'),decode(repeat('df',32),'hex'),repeat('D',43),decode(repeat('e0',17),'hex'),decode(repeat('e1',12),'hex'),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(active_tx,active_leg);
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('dd',32),'hex'),decode(repeat('de',32),'hex'));
  IF public.record_verified_social_identity_from_upstream_leg(active_attempt,active_leg,'google',s,d,1)<>'EXISTING_PRIMARY' THEN RAISE EXCEPTION 'PHASE10P_ACTIVE_EXISTING_PRIMARY'; END IF;
END $$;

SELECT 'PHASE10P_LAUNCH_SINGLETON_REPAIR_OK' AS status;
SELECT 'PHASE10P_ACTIVATION_FAIL_CLOSED_MATRIX_OK' AS status;
SELECT 'PHASE10P_BOUND_PROVISIONAL_REAUTH_READY_OK recovery_delta=0 delivery_delta=0 email_delta=0 otp_delta=0' AS status;
SELECT 'PHASE10P_EXACT_OPEN_ACTIVATION_AND_EXISTING_PRIMARY_OK' AS status;
