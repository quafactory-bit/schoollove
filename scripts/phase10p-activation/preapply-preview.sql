SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE d bytea:=decode(repeat('d1',32),'hex'); s text:='slb:v1:k01:google:'||translate(rtrim(encode(d,'base64'),'='),'+/','-_');
  account_id uuid:='d1000000-0000-4000-8000-000000000001'; user_id uuid:='d1000000-0000-4000-8000-000000000002'; attempt_id uuid:='d1000000-0000-4000-8000-000000000003';
BEGIN
  INSERT INTO auth.users(id,email) VALUES(user_id,NULL);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) VALUES(gen_random_uuid(),user_id,s,'custom:schoollove-google',jsonb_build_object('sub',s));
  INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at)
    VALUES(account_id,user_id,'provisional','google',s,decode(repeat('d2',32),'hex'),1,decode(repeat('d3',17),'hex'),decode(repeat('d4',12),'hex'),1,clock_timestamp());
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status)
    VALUES(s,'google',d,1,account_id,user_id,'provisional');
  INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,broker_subject,subject_digest,subject_key_version,account_id,consumed_at)
    VALUES(attempt_id,'att_10p_activation_source','google','consumed',s,d,1,account_id,clock_timestamp());
  DELETE FROM public.public_account_launch_control;
  IF (SELECT count(*) FROM public.public_account_launch_control)<>0 OR (SELECT count(*) FROM public.public_account_launch_audit)<>0 THEN RAISE EXCEPTION 'PHASE10P_PREAPPLY_PREVIEW_SHAPE'; END IF;
END $$;
