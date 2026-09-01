SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE FUNCTION pg_temp.assert_bound_provisional_reauth_rejected(case_name text, mutation text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  fixture_account_id uuid:=gen_random_uuid();
  fixture_user_id uuid:=gen_random_uuid();
  other_auth_user_id uuid:=gen_random_uuid();
  fixture_attempt_id uuid;
  fixture_tx_id uuid:=gen_random_uuid();
  fixture_leg_id uuid:=gen_random_uuid();
  digest_value bytea:=decode(md5(case_name)||md5(case_name||':subject'),'hex');
  other_digest bytea:=decode(md5(case_name||':other')||md5(case_name||':other-subject'),'hex');
  subject_value text;
  other_subject text;
  other_kakao_subject text;
  account_provider text:='google';
  account_subject text;
  account_status text:='provisional';
  account_auth_user uuid;
  identity_provider text:='google';
  identity_digest bytea;
  identity_key_version integer:=1;
  identity_auth_user uuid;
  identity_status text:='provisional';
  auth_provider text:='custom:schoollove-google';
  auth_provider_id text;
  auth_subject text;
  result text;
  accounts_before integer;
  identities_before integer;
  recovery_before integer;
  delivery_before integer;
BEGIN
  subject_value:='slb:v1:k01:google:'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_');
  other_subject:='slb:v1:k01:google:'||translate(rtrim(encode(other_digest,'base64'),'='),'+/','-_');
  other_kakao_subject:='slb:v1:k01:kakao:'||translate(rtrim(encode(other_digest,'base64'),'='),'+/','-_');
  IF length(split_part(subject_value,':',5))<>43 THEN RAISE EXCEPTION 'PHASE10P_NEGATIVE_SUBJECT_LENGTH'; END IF;

  account_subject:=subject_value;
  account_auth_user:=fixture_user_id;
  identity_digest:=digest_value;
  identity_auth_user:=fixture_user_id;
  auth_provider_id:=subject_value;
  auth_subject:=subject_value;

  IF mutation='account_unbound' THEN account_auth_user:=NULL;
  ELSIF mutation='identity_unbound' THEN identity_auth_user:=NULL;
  ELSIF mutation='differing_auth_user' THEN identity_auth_user:=other_auth_user_id;
  ELSIF mutation='missing_auth_user' THEN account_auth_user:=NULL; identity_auth_user:=NULL;
  ELSIF mutation='wrong_custom_provider' THEN auth_provider:='custom:schoollove-kakao';
  ELSIF mutation='wrong_provider_id' THEN auth_provider_id:=other_subject;
  ELSIF mutation='wrong_identity_sub' THEN auth_subject:=other_subject;
  ELSIF mutation='provider_mismatch' THEN account_provider:='kakao'; account_subject:=other_kakao_subject;
  ELSIF mutation='broker_subject_mismatch' THEN account_subject:=other_subject;
  ELSIF mutation='digest_key_mismatch' THEN identity_digest:=other_digest;
  ELSIF mutation='revoked_identity' THEN identity_status:='revoked';
  ELSIF mutation='active_provisional_inconsistent' THEN account_status:='active';
  ELSIF mutation<>'missing_auth_identity' THEN RAISE EXCEPTION 'PHASE10P_NEGATIVE_MUTATION_UNKNOWN %',mutation;
  END IF;

  IF mutation<>'missing_auth_user' THEN INSERT INTO auth.users(id,email) VALUES(fixture_user_id,NULL); END IF;
  IF mutation='differing_auth_user' THEN INSERT INTO auth.users(id,email) VALUES(other_auth_user_id,NULL); END IF;
  IF mutation NOT IN ('missing_auth_user','missing_auth_identity') THEN
    INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data)
      VALUES(gen_random_uuid(),fixture_user_id,auth_provider_id,auth_provider,jsonb_build_object('sub',auth_subject));
  END IF;
  INSERT INTO private.private_accounts(
    id,auth_user_id,status,primary_provider,primary_broker_subject,
    recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,
    recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at,activated_at
  ) VALUES(
    fixture_account_id,account_auth_user,account_status,account_provider,account_subject,
    decode(md5(case_name||':recovery')||md5(case_name||':recovery-2'),'hex'),1,
    decode(md5(case_name||':cipher')||'00','hex'),decode(substr(md5(case_name||':nonce'),1,24),'hex'),1,clock_timestamp(),
    CASE WHEN account_status='active' THEN clock_timestamp() ELSE NULL END
  );
  INSERT INTO private.social_identity_registry(
    broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status,revoked_at
  ) VALUES(subject_value,identity_provider,identity_digest,identity_key_version,fixture_account_id,identity_auth_user,identity_status,
    CASE WHEN identity_status='revoked' THEN clock_timestamp() ELSE NULL END);

  fixture_attempt_id:=public.create_social_login_attempt('att_neg_'||substr(md5(case_name),1,24),'google',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(
    fixture_tx_id,fixture_attempt_id,decode(md5(case_name||':handle')||md5(case_name||':handle-2'),'hex'),
    'slb-supabase-google','https://preview.invalid/auth/v1/callback','code','openid',
    repeat('A',43),'S256',NULL,'negative-state-'||case_name,clock_timestamp()+interval '5 minutes'
  );
  PERFORM public.claim_downstream_authorization_transaction_by_handle(
    decode(md5(case_name||':handle')||md5(case_name||':handle-2'),'hex')
  );
  PERFORM public.create_upstream_login_leg(
    fixture_attempt_id,fixture_leg_id,'google',
    decode(md5(case_name||':state')||md5(case_name||':state-2'),'hex'),
    decode(md5(case_name||':binding')||md5(case_name||':binding-2'),'hex'),
    decode(md5(case_name||':pkce')||md5(case_name||':pkce-2'),'hex'),
    repeat('B',43),decode(md5(case_name||':context')||'00','hex'),
    decode(substr(md5(case_name||':context-nonce'),1,24),'hex'),1
  );
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(fixture_tx_id,fixture_leg_id);
  PERFORM public.claim_upstream_login_callback_by_state(
    'google',decode(md5(case_name||':state')||md5(case_name||':state-2'),'hex'),
    decode(md5(case_name||':binding')||md5(case_name||':binding-2'),'hex')
  );

  SELECT count(*) INTO accounts_before FROM private.private_accounts;
  SELECT count(*) INTO identities_before FROM private.social_identity_registry;
  SELECT count(*) INTO recovery_before FROM private.recovery_email_verifications;
  SELECT count(*) INTO delivery_before FROM private.recovery_delivery_attempts;
  result:=public.record_verified_social_identity_from_upstream_leg(fixture_attempt_id,fixture_leg_id,'google',subject_value,digest_value,1);
  IF result='BOUND_PROVISIONAL_REAUTH_READY'
    OR (SELECT count(*) FROM private.private_accounts)<>accounts_before
    OR (SELECT count(*) FROM private.social_identity_registry)<>identities_before
    OR (SELECT count(*) FROM private.recovery_email_verifications)<>recovery_before
    OR (SELECT count(*) FROM private.recovery_delivery_attempts)<>delivery_before
  THEN RAISE EXCEPTION 'PHASE10P_BOUND_NEGATIVE_FAILED case=% result=%',case_name,result; END IF;
  IF EXISTS(SELECT 1 FROM private.downstream_authorization_transactions
    WHERE status IN ('consumed','rejected','expired') AND (downstream_nonce IS NOT NULL OR downstream_state IS NOT NULL))
  THEN RAISE EXCEPTION 'PHASE10P_BOUND_NEGATIVE_RAW_CONTEXT case=%',case_name; END IF;
END $$;

SELECT pg_temp.assert_bound_provisional_reauth_rejected(case_name,case_name)
FROM unnest(ARRAY[
  'account_unbound','identity_unbound','differing_auth_user','missing_auth_user',
  'missing_auth_identity','wrong_custom_provider','wrong_provider_id','wrong_identity_sub',
  'provider_mismatch','broker_subject_mismatch','digest_key_mismatch','revoked_identity',
  'active_provisional_inconsistent'
]) AS cases(case_name);

SELECT 'PHASE10P_BOUND_PROVISIONAL_REAUTH_NEGATIVE_MATRIX_OK cases=13 recovery_delta=0 delivery_delta=0' AS status;
