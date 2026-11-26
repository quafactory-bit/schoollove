-- Part 2 P2b disposable-DB matrix: new sign-up, re-login, interrupted sign-up,
-- duplicates, later recovery registration, withdrawal, constraints, grants.
SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE FUNCTION p2b_test.expect(actual text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL % : got % expected %',label,actual,expected; END IF; END $$;

-- 1. New Google identity: no recovery step, one transaction decides the account.
DO $$
DECLARE a private.private_accounts;
BEGIN
  PERFORM p2b_test.launch(true);
  PERFORM p2b_test.flow('new1');
  PERFORM p2b_test.expect(p2b_test.decide('new1',1),'ACCOUNT_DECIDED_RECOVERY_DEFERRED','new decision');
  a:=p2b_test.account_of(1);
  IF a.id IS NULL OR a.status<>'provisional' OR NOT private.p2b_recovery_absent(a) OR a.auth_user_id IS NOT NULL THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL new account shape'; END IF;
  PERFORM p2b_test.expect((SELECT state FROM private.oauth_login_attempts o JOIN p2b_test.flows f ON f.attempt_id=o.id WHERE f.name='new1'),'account_decided','new attempt state');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('new1'),'AUTHORIZATION_CODE_CONSUMED','new code');
  PERFORM p2b_test.expect(p2b_test.complete('new1',1),'AUTH_PRINCIPAL_BOUND/SOCIAL_ACCOUNT_ACTIVATED','new completion');
  PERFORM p2b_test.expect(public.activate_social_account_from_attempt_recovery_optional((SELECT attempt_id FROM p2b_test.flows WHERE name='new1')),'SOCIAL_ACCOUNT_ALREADY_ACTIVE','idempotent activation');
  a:=p2b_test.account_of(1);
  IF a.status<>'active' OR a.activated_at IS NULL OR NOT private.p2b_recovery_absent(a)
    OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry r WHERE r.account_id=a.id AND r.status='active' AND r.auth_user_id=a.auth_user_id)
  THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL active without recovery'; END IF;
  IF (SELECT count(*) FROM private.recovery_email_verifications)<>0 OR (SELECT count(*) FROM private.recovery_delivery_attempts)<>0
  THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL recovery rows created during sign-up'; END IF;
END $$;
SELECT 'P2B_NEW_SIGNUP_WITHOUT_RECOVERY_OK' AS status;

-- 2. Re-login of an active recovery-less account is the ordinary EXISTING_PRIMARY path.
DO $$ BEGIN
  PERFORM p2b_test.flow('relogin1');
  PERFORM p2b_test.expect(p2b_test.decide('relogin1',1),'EXISTING_PRIMARY','active relogin');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('relogin1'),'AUTHORIZATION_CODE_CONSUMED','relogin code');
  PERFORM p2b_test.expect(p2b_test.complete('relogin1',1),'AUTH_PRINCIPAL_ALREADY_BOUND/SOCIAL_ACCOUNT_ALREADY_ACTIVE','relogin completion');
  PERFORM p2b_test.expect((SELECT count(*)::text FROM private.private_accounts),'1','no duplicate on relogin');
  -- The legacy wrapper agrees (rollback safety: active recovery-less users keep logging in).
  PERFORM p2b_test.flow('relogin1-legacy');
  PERFORM p2b_test.expect(public.record_verified_social_identity_from_upstream_leg((SELECT attempt_id FROM p2b_test.flows WHERE name='relogin1-legacy'),(SELECT leg_id FROM p2b_test.flows WHERE name='relogin1-legacy'),'google',p2b_test.subject(1),p2b_test.digest(1),1),'EXISTING_PRIMARY','legacy relogin after rollback');
END $$;
SELECT 'P2B_RELOGIN_EXISTING_PRIMARY_OK legacy_wrapper_too=true' AS status;

-- 3. Launch closed at completion: bound provisional, then reauth once open.
DO $$ BEGIN
  PERFORM p2b_test.flow('closed2');
  PERFORM p2b_test.expect(p2b_test.decide('closed2',2),'ACCOUNT_DECIDED_RECOVERY_DEFERRED','closed decision');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('closed2'),'AUTHORIZATION_CODE_CONSUMED','closed code');
  PERFORM p2b_test.launch(false);
  PERFORM p2b_test.expect(p2b_test.complete('closed2',2),'AUTH_PRINCIPAL_BOUND/SOCIAL_ACCOUNT_LAUNCH_CLOSED','closed completion');
  PERFORM p2b_test.flow('closed2-again');
  PERFORM p2b_test.expect(p2b_test.decide('closed2-again',2),'BOUND_PROVISIONAL_REAUTH_READY','bound reauth');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('closed2-again'),'AUTHORIZATION_CODE_CONSUMED','bound reauth code while closed');
  PERFORM p2b_test.launch(true);
  PERFORM p2b_test.expect(p2b_test.complete('closed2-again',2),'AUTH_PRINCIPAL_ALREADY_BOUND/SOCIAL_ACCOUNT_ACTIVATED','bound reauth activation');
  PERFORM p2b_test.expect((SELECT count(*)::text FROM private.private_accounts WHERE primary_broker_subject=p2b_test.subject(2)),'1','one account for subject 2');
END $$;
SELECT 'P2B_CLOSED_THEN_BOUND_REAUTH_OK' AS status;

-- 4. Interrupted first sign-up (browser closed before the code was issued).
DO $$ BEGIN
  PERFORM p2b_test.flow('int3');
  PERFORM p2b_test.expect(p2b_test.decide('int3',3),'ACCOUNT_DECIDED_RECOVERY_DEFERRED','interrupted decision');
  PERFORM p2b_test.flow('int3-live');
  PERFORM p2b_test.expect(p2b_test.decide('int3-live',3),'IDENTITY_DECISION_IN_PROGRESS','live sibling blocks resume');
  PERFORM p2b_test.age('int3');
  PERFORM p2b_test.flow('int3-resume');
  PERFORM p2b_test.expect(p2b_test.decide('int3-resume',3),'PROVISIONAL_RESUME_READY','resume after expiry');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('int3-resume'),'AUTHORIZATION_CODE_CONSUMED','resume code');
  PERFORM p2b_test.expect(p2b_test.complete('int3-resume',3),'AUTH_PRINCIPAL_BOUND/SOCIAL_ACCOUNT_ACTIVATED','resume completion');
  PERFORM p2b_test.expect((SELECT count(*)::text FROM private.private_accounts WHERE primary_broker_subject=p2b_test.subject(3)),'1','one account for subject 3');
END $$;
-- 4b. Interrupted after the token exchange (Supabase user exists, never bound).
DO $$ BEGIN
  PERFORM p2b_test.flow('int4');
  PERFORM p2b_test.expect(p2b_test.decide('int4',4),'ACCOUNT_DECIDED_RECOVERY_DEFERRED','int4 decision');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('int4'),'AUTHORIZATION_CODE_CONSUMED','int4 code');
  PERFORM p2b_test.supabase_user(4);
  PERFORM p2b_test.flow('int4-resume');
  PERFORM p2b_test.expect(p2b_test.decide('int4-resume',4),'PROVISIONAL_RESUME_READY','resume with existing Supabase user');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('int4-resume'),'AUTHORIZATION_CODE_CONSUMED','int4 resume code');
  PERFORM p2b_test.expect(p2b_test.complete('int4-resume',4),'AUTH_PRINCIPAL_BOUND/SOCIAL_ACCOUNT_ACTIVATED','int4 completion');
  PERFORM p2b_test.expect((SELECT count(*)::text FROM auth.users u JOIN auth.identities i ON i.user_id=u.id WHERE i.provider_id=p2b_test.subject(4)),'1','one Supabase user for subject 4');
END $$;
-- 4c. A foreign Auth mapping for the subject keeps the account fail-closed.
DO $$
DECLARE u uuid:=gen_random_uuid();
BEGIN
  PERFORM p2b_test.flow('int5');
  PERFORM p2b_test.expect(p2b_test.decide('int5',5),'ACCOUNT_DECIDED_RECOVERY_DEFERRED','int5 decision');
  PERFORM p2b_test.age('int5');
  INSERT INTO auth.users(id) VALUES(u);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) VALUES(gen_random_uuid(),u,p2b_test.subject(5),'custom:schoollove-google',jsonb_build_object('sub','tampered'));
  PERFORM p2b_test.flow('int5-resume');
  PERFORM p2b_test.expect(p2b_test.decide('int5-resume',5),'IDENTITY_DECISION_IN_PROGRESS','ambiguous Auth mapping');
  DELETE FROM auth.identities WHERE user_id=u; DELETE FROM auth.users WHERE id=u;
END $$;
SELECT 'P2B_INTERRUPTED_SIGNUP_RESUME_OK before_code=true after_exchange=true ambiguous_auth_fail_closed=true' AS status;

-- 5. Duplicates: different subjects are different accounts; same subject never two.
DO $$ BEGIN
  PERFORM p2b_test.flow('dup6');
  PERFORM p2b_test.expect(p2b_test.decide('dup6',6),'ACCOUNT_DECIDED_RECOVERY_DEFERRED','subject 6');
  PERFORM p2b_test.expect(p2b_test.issue_and_consume('dup6'),'AUTHORIZATION_CODE_CONSUMED','dup6 code');
  PERFORM p2b_test.expect(p2b_test.complete('dup6',6),'AUTH_PRINCIPAL_BOUND/SOCIAL_ACCOUNT_ACTIVATED','dup6 completion');
  PERFORM p2b_test.flow('dup6-again');
  PERFORM p2b_test.expect(p2b_test.decide('dup6-again',6),'EXISTING_PRIMARY','subject 6 again');
  IF (SELECT count(DISTINCT primary_broker_subject) FROM private.private_accounts)<>(SELECT count(*) FROM private.private_accounts)
    OR (SELECT count(*) FROM private.social_identity_registry)<>(SELECT count(*) FROM private.private_accounts)
  THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL duplicate account'; END IF;
END $$;
SELECT 'P2B_DUPLICATE_RULE_ONE_SUBJECT_ONE_ACCOUNT_OK' AS status;

-- 6. Later recovery registration from /account.
DO $$
DECLARE a1 private.private_accounts:=p2b_test.account_of(1); a6 private.private_accounts:=p2b_test.account_of(6);
  v uuid:=gen_random_uuid(); v2 uuid:=gen_random_uuid(); v3 uuid:=gen_random_uuid(); v4 uuid:=gen_random_uuid();
  h1 bytea:=extensions.digest('p2b-email-1','sha256'); h2 bytea:=extensions.digest('p2b-email-2','sha256');
  otp bytea:=extensions.digest('p2b-otp','sha256'); wrong bytea:=extensions.digest('p2b-wrong','sha256');
  r record; i integer;
BEGIN
  -- wrong account id / unknown user
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a1.auth_user_id,a6.id,v,h1,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'ACCOUNT_RECOVERY_UNAVAILABLE','mismatched account id');
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a1.auth_user_id,a1.id,v,h1,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'RECOVERY_DELIVERY_RESERVED','reserve');
  -- unsent delivery cannot be consumed
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a1.auth_user_id,v,otp),'ACCOUNT_RECOVERY_REJECTED','consume before sent');
  PERFORM p2b_test.expect(public.mark_login_attempt_recovery_delivery_sent(r.delivery_id),'RECOVERY_DELIVERY_SENT','mark sent');
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a1.auth_user_id,a1.id,gen_random_uuid(),h1,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'RECOVERY_DELIVERY_ALREADY_SENT','idempotent replay');
  PERFORM p2b_test.expect(r.verification_id::text,v::text,'replay returns same challenge');
  -- someone else's session cannot consume it
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a6.auth_user_id,v,otp),'ACCOUNT_RECOVERY_REJECTED','foreign consume');
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a1.auth_user_id,v,wrong),'OTP_REJECTED','wrong otp');
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a1.auth_user_id,v,otp),'RECOVERY_REGISTERED','right otp');
  a1:=p2b_test.account_of(1);
  IF NOT private.p2b_recovery_complete(a1) OR a1.status<>'active' THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL registered shape'; END IF;
  PERFORM p2b_test.expect((SELECT status FROM private.recovery_email_verifications WHERE id=v),'consumed','challenge consumed');
  PERFORM p2b_test.expect((SELECT destination_ciphertext IS NULL AND otp_mac IS NULL FROM private.recovery_email_verifications WHERE id=v)::text,'true','terminal material cleared');
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a1.auth_user_id,a1.id,gen_random_uuid(),h2,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'ACCOUNT_RECOVERY_ALREADY_REGISTERED','second registration');

  -- Same address on another account: only after proving ownership, coarse answer.
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a6.auth_user_id,a6.id,v2,h1,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'RECOVERY_DELIVERY_RESERVED','reserve taken address (indistinguishable)');
  PERFORM public.mark_login_attempt_recovery_delivery_sent(r.delivery_id);
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a6.auth_user_id,v2,wrong),'OTP_REJECTED','taken address wrong otp stays generic');
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a6.auth_user_id,v2,otp),'RECOVERY_EMAIL_UNAVAILABLE','taken address after ownership');
  IF NOT private.p2b_recovery_absent(p2b_test.account_of(6)) THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL taken address written'; END IF;

  -- 60s pacing and lockout.
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a6.auth_user_id,a6.id,v3,h2,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'RECOVERY_DELIVERY_LIMITED','60s pacing');
  UPDATE private.recovery_delivery_attempts SET reserved_at=reserved_at-interval '2 minutes' WHERE account_id=a6.id;
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a6.auth_user_id,a6.id,v3,h2,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'RECOVERY_DELIVERY_RESERVED','reserve after pacing');
  PERFORM public.mark_login_attempt_recovery_delivery_sent(r.delivery_id);
  FOR i IN 1..4 LOOP PERFORM p2b_test.expect(public.consume_account_recovery_verification(a6.auth_user_id,v3,wrong),'OTP_REJECTED','wrong '||i); END LOOP;
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a6.auth_user_id,v3,wrong),'LOCKED','fifth wrong locks');
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a6.auth_user_id,v3,otp),'LOCKED','locked stays locked');
  -- 3 per account per 24h (v2, v3, and this one; the 4th is refused)
  UPDATE private.recovery_delivery_attempts SET reserved_at=reserved_at-interval '2 minutes' WHERE account_id=a6.id;
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a6.auth_user_id,a6.id,gen_random_uuid(),h2,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'RECOVERY_DELIVERY_RESERVED','third reservation');
  UPDATE private.recovery_delivery_attempts SET reserved_at=reserved_at-interval '2 minutes' WHERE account_id=a6.id;
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a6.auth_user_id,a6.id,v4,h2,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'RECOVERY_DELIVERY_LIMITED','account daily budget');
  -- expiry
  UPDATE private.recovery_delivery_attempts SET reserved_at=reserved_at-interval '25 hours' WHERE account_id=a6.id;
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a6.auth_user_id,a6.id,v4,h2,1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,otp,1);
  PERFORM p2b_test.expect(r.outcome,'RECOVERY_DELIVERY_RESERVED','budget window rolls');
  PERFORM public.mark_login_attempt_recovery_delivery_sent(r.delivery_id);
  UPDATE private.recovery_email_verifications SET created_at=created_at-interval '1 hour',expires_at=expires_at-interval '1 hour' WHERE id=v4;
  PERFORM p2b_test.expect(public.consume_account_recovery_verification(a6.auth_user_id,v4,otp),'EXPIRED','expired challenge');
  -- housekeeping removed the >24h account ledger rows on that reservation
  PERFORM p2b_test.expect((SELECT count(*)::text FROM private.recovery_delivery_attempts WHERE account_id=a6.id AND reserved_at<=clock_timestamp()-interval '24 hours' AND state<>'reserved'),'0','account ledger housekeeping');
END $$;
SELECT 'P2B_LATER_RECOVERY_REGISTRATION_OK replay=true foreign_session=false taken_address_after_otp=true pacing=true lock=5 daily=3 expiry=true' AS status;

-- 7. Withdrawal of a recovery-less active account, then the same Google signs up again.
DO $$
DECLARE a private.private_accounts:=p2b_test.account_of(6); req uuid:=gen_random_uuid(); r record; att uuid;
BEGIN
  INSERT INTO public.account_deletion_requests(id,user_id,status) VALUES(req,a.auth_user_id,'pending');
  SELECT * INTO r FROM public.create_and_reserve_account_recovery_delivery(a.auth_user_id,a.id,gen_random_uuid(),extensions.digest('p2b-email-9','sha256'),1,extensions.gen_random_bytes(40),extensions.gen_random_bytes(12),1,extensions.digest('x','sha256'),1);
  PERFORM p2b_test.expect(r.outcome,'ACCOUNT_RECOVERY_UNAVAILABLE','registration blocked while withdrawing');
  PERFORM public.admin_prepare_public_account_deletion(req,'USER_REQUEST','p2b-test');
  a:=p2b_test.account_of(6);
  IF a.status<>'deletion_pending' OR EXISTS(SELECT 1 FROM private.social_identity_registry WHERE account_id=a.id AND status<>'revoked')
    OR NOT EXISTS(SELECT 1 FROM private.auth_principal_cleanup_jobs WHERE account_id=a.id)
  THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL withdrawal prepare'; END IF;
  PERFORM p2b_test.flow('wd6');
  PERFORM p2b_test.expect(p2b_test.decide('wd6',6),'IDENTITY_DECISION_IN_PROGRESS','login during withdrawal is fail-closed');
  IF to_regprocedure('private.purge_expired_login_attempt(uuid)') IS NULL THEN
    -- Pre-0915 baseline (Preview project): no retention purge function exists there.
    RAISE NOTICE 'P2B_WITHDRAWAL_PURGE_SKIPPED_PRE_0915_BASELINE';
    RETURN;
  END IF;
  -- Emulate the Auth admin delete + retention purge (same statements as run_privacy_retention_cleanup).
  DELETE FROM auth.identities WHERE user_id=a.auth_user_id; DELETE FROM auth.users WHERE id=a.auth_user_id;
  UPDATE private.oauth_login_attempts SET created_at=created_at-interval '1 hour',expires_at=expires_at-interval '1 hour' WHERE account_id=a.id;
  FOR att IN SELECT id FROM private.oauth_login_attempts WHERE account_id=a.id LOOP
    IF NOT private.purge_expired_login_attempt(att) THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL purge attempt'; END IF;
  END LOOP;
  DELETE FROM private.auth_principal_cleanup_jobs WHERE account_id=a.id;
  DELETE FROM private.private_accounts WHERE id=a.id;
  IF EXISTS(SELECT 1 FROM private.social_identity_registry WHERE broker_subject=p2b_test.subject(6))
    OR EXISTS(SELECT 1 FROM private.recovery_delivery_attempts WHERE account_id=a.id)
  THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL withdrawal cascade'; END IF;
  PERFORM p2b_test.flow('wd6-new');
  PERFORM p2b_test.expect(p2b_test.decide('wd6-new',6),'ACCOUNT_DECIDED_RECOVERY_DEFERRED','fresh sign-up after deletion');
END $$;
SELECT CASE WHEN to_regprocedure('private.purge_expired_login_attempt(uuid)') IS NULL
  THEN 'P2B_WITHDRAWAL_RECOVERY_LESS_OK prepare=true login_fail_closed=true purge=not_in_pre_0915_baseline'
  ELSE 'P2B_WITHDRAWAL_RECOVERY_LESS_OK prepare=true login_fail_closed=true cascade=true resignup=true' END AS status;

-- 8. Constraints E1/E2.
DO $$ BEGIN
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET recovery_email_verified_at=clock_timestamp() WHERE id=(p2b_test.account_of(2)).id;
  RAISE EXCEPTION 'P2B_MATRIX_FAIL partial recovery accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO private.recovery_delivery_attempts(verification_id,login_attempt_id,account_id,recovery_email_hmac,hmac_key_version,state)
    VALUES((SELECT id FROM private.recovery_email_verifications LIMIT 1),(SELECT id FROM private.oauth_login_attempts LIMIT 1),(p2b_test.account_of(1)).id,extensions.digest('z','sha256'),1,'reserved');
  RAISE EXCEPTION 'P2B_MATRIX_FAIL two-owner delivery accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO private.recovery_delivery_attempts(verification_id,recovery_email_hmac,hmac_key_version,state)
    VALUES((SELECT id FROM private.recovery_email_verifications LIMIT 1),extensions.digest('z','sha256'),1,'reserved');
  RAISE EXCEPTION 'P2B_MATRIX_FAIL ownerless reserved delivery accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
SELECT 'P2B_CONSTRAINTS_E1_E2_OK' AS status;

-- 9. Grants: service_role only; anon/authenticated cannot execute; private helpers closed.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.record_verified_google_identity_recovery_optional(uuid,uuid,text,text,bytea,integer)',
    'public.bind_social_auth_principal_from_attempt_recovery_optional(uuid,uuid)',
    'public.activate_social_account_from_attempt_recovery_optional(uuid)',
    'public.create_and_reserve_account_recovery_delivery(uuid,uuid,uuid,bytea,integer,bytea,bytea,integer,bytea,integer)',
    'public.consume_account_recovery_verification(uuid,uuid,bytea)'] LOOP
    IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE')
    THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL grant %',f; END IF;
  END LOOP;
  IF has_function_privilege('service_role','private.p2b_recovery_absent(private.private_accounts)','EXECUTE') THEN RAISE EXCEPTION 'P2B_MATRIX_FAIL private helper grant'; END IF;
END $$;
-- A non-service caller is refused even with EXECUTE (defence in depth).
DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM public.record_verified_google_identity_recovery_optional(gen_random_uuid(),gen_random_uuid(),'google',p2b_test.subject(1),p2b_test.digest(1),1);
  RAISE EXCEPTION 'P2B_MATRIX_FAIL non-service accepted';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SOCIAL_ATTEMPT_SERVICE_ROLE_REQUIRED' THEN RAISE; END IF; END $$;
SELECT 'P2B_GRANTS_SERVICE_ROLE_ONLY_OK' AS status;
