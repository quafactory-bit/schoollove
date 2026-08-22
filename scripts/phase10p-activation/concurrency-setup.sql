SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE
  d bytea:=decode(repeat('e2',32),'hex'); s text:='slb:v1:k01:google:'||translate(rtrim(encode(d,'base64'),'='),'+/','-_');
  account_id uuid:='e2000000-0000-4000-8000-000000000001'; user_id uuid:='e2000000-0000-4000-8000-000000000002'; source_attempt uuid:='e2000000-0000-4000-8000-000000000003';
  target_attempt uuid; tx uuid:='e2000000-0000-4000-8000-000000000004'; leg uuid:='e2000000-0000-4000-8000-000000000005';
BEGIN
  UPDATE public.public_account_launch_control SET state='open',account_registration_enabled=true,private_profile_enabled=true,school_membership_enabled=true,emergency_stopped_at=NULL;
  INSERT INTO auth.users(id,email) VALUES(user_id,NULL);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) VALUES(gen_random_uuid(),user_id,s,'custom:schoollove-google',jsonb_build_object('sub',s));
  INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at)
    VALUES(account_id,user_id,'provisional','google',s,decode(repeat('e3',32),'hex'),1,decode(repeat('e4',17),'hex'),decode(repeat('e5',12),'hex'),1,clock_timestamp());
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status) VALUES(s,'google',d,1,account_id,user_id,'provisional');
  INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,account_id,created_at,expires_at,updated_at,consumed_at)
    VALUES(source_attempt,'att_10p_activation_race_src','google','consumed',s,d,1,account_id,clock_timestamp(),clock_timestamp()+interval '9 minutes',clock_timestamp(),clock_timestamp());
  target_attempt:=public.create_social_login_attempt('att_10p_activation_race_new','google',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_downstream_authorization_transaction(tx,target_attempt,decode(repeat('e6',32),'hex'),'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback','code','openid',repeat('E',43),'S256',NULL,'race-state',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('e6',32),'hex'));
  PERFORM public.create_upstream_login_leg(target_attempt,leg,'google',decode(repeat('e7',32),'hex'),decode(repeat('e8',32),'hex'),decode(repeat('e9',32),'hex'),repeat('F',43),decode(repeat('ea',17),'hex'),decode(repeat('eb',12),'hex'),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(tx,leg);
  PERFORM public.claim_upstream_login_callback_by_state('google',decode(repeat('e7',32),'hex'),decode(repeat('e8',32),'hex'));
END $$;
SELECT 'PHASE10P_ACTIVATION_REAUTH_RACE_SETUP_OK' AS status;
