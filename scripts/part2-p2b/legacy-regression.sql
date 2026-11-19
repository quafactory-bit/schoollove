-- The legacy recovery path and legacy-shaped accounts keep their exact behaviour.
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE f p2b_test.flows%ROWTYPE; s text:=p2b_test.subject(20); d bytea:=p2b_test.digest(20);
  acct uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); src uuid:=gen_random_uuid();
BEGIN
  -- Old wrapper, never-seen subject: still RECOVERY_REQUIRED (unchanged, only no longer called).
  PERFORM p2b_test.flow('legacy20');
  SELECT * INTO STRICT f FROM p2b_test.flows WHERE name='legacy20';
  PERFORM p2b_test.expect(public.record_verified_social_identity_from_upstream_leg(f.attempt_id,f.leg_id,'google',s,d,1),'RECOVERY_REQUIRED','legacy wrapper new subject');
  -- New function while that live legacy recovery attempt exists: delegated, in progress, no account.
  PERFORM p2b_test.flow('legacy20-new');
  PERFORM p2b_test.expect(p2b_test.decide('legacy20-new',20),'IDENTITY_DECISION_IN_PROGRESS','live legacy recovery attempt');
  PERFORM p2b_test.expect((SELECT count(*)::text FROM private.private_accounts WHERE primary_broker_subject=s),'0','no account while legacy recovery live');

  -- A recovery-verified bound provisional (old flow, launch closed) reauths through the new
  -- entry point via delegation and activates through the new activator.
  s:=p2b_test.subject(21); d:=p2b_test.digest(21);
  INSERT INTO auth.users(id) VALUES(u);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) VALUES(gen_random_uuid(),u,s,'custom:schoollove-google',jsonb_build_object('sub',s));
  INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject,recovery_email_hmac,recovery_email_hmac_key_version,recovery_email_ciphertext,recovery_email_nonce,recovery_email_encryption_key_version,recovery_email_verified_at)
    VALUES(acct,u,'provisional','google',s,extensions.digest('legacy-email','sha256'),1,extensions.gen_random_bytes(20),extensions.gen_random_bytes(12),1,clock_timestamp());
  INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status) VALUES(s,'google',d,1,acct,u,'provisional');
  PERFORM p2b_test.flow('legacy21');
  PERFORM p2b_test.expect(p2b_test.decide('legacy21',21),'BOUND_PROVISIONAL_REAUTH_READY','legacy bound reauth via delegation');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('legacy21'),'AUTHORIZATION_CODE_CONSUMED','legacy21 code');
  PERFORM p2b_test.expect(p2b_test.complete('legacy21',21),'AUTH_PRINCIPAL_ALREADY_BOUND/SOCIAL_ACCOUNT_ACTIVATED','legacy21 activation');
  IF NOT private.p2b_recovery_complete(p2b_test.account_of(21)) THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL legacy recovery lost'; END IF;
END $$;
SELECT 'P2B_LEGACY_RECOVERY_PATH_UNCHANGED_OK' AS status;
