\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users(id,email) VALUES
('81000000-0000-4000-8000-000000000001','one@example.invalid'),
('81000000-0000-4000-8000-000000000002','two@example.invalid'),
('81000000-0000-4000-8000-000000000003','three@example.invalid');

DO $$
DECLARE a uuid; b uuid; c uuid; verify_a uuid; verify_locked uuid; verify_expired uuid; cleanup_a uuid; cleanup_again uuid;
  hmac_a bytea:=decode(repeat('a',64),'hex'); hmac_b bytea:=decode(repeat('b',64),'hex'); nonce bytea:=decode(repeat('c',24),'hex'); mac bytea:=decode(repeat('d',64),'hex'); digest_a bytea:=decode(repeat('e',64),'hex');
BEGIN
  a:=public.create_provisional_social_account('kakao','slb:v1:k01:kakao:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',digest_a,1);
  BEGIN PERFORM public.create_provisional_social_account('kakao','slb:v1:k01:kakao:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',digest_a,1); RAISE EXCEPTION 'duplicate broker subject accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN UPDATE private.private_accounts SET primary_provider='naver' WHERE id=a; RAISE EXCEPTION 'provider mutation accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PRIMARY_PROVIDER_IMMUTABLE' THEN RAISE; END IF; END;
  BEGIN UPDATE private.private_accounts SET primary_broker_subject='slb:v1:k01:kakao:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE id=a; RAISE EXCEPTION 'subject mutation accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PRIMARY_BROKER_SUBJECT_IMMUTABLE' THEN RAISE; END IF; END;
  PERFORM public.bind_social_auth_principal(a,'81000000-0000-4000-8000-000000000001');
  verify_locked:=public.create_recovery_email_verification(a,'activation',hmac_a,1,decode(repeat('1',96),'hex'),nonce,1,mac,1);
  FOR i IN 1..5 LOOP PERFORM public.consume_recovery_email_verification(verify_locked,decode(repeat('f',64),'hex')); END LOOP;
  IF (SELECT status FROM private.recovery_email_verifications WHERE id=verify_locked)<>'locked' THEN RAISE EXCEPTION 'five failures did not lock'; END IF;
  verify_a:=public.create_recovery_email_verification(a,'activation',hmac_a,1,decode(repeat('2',96),'hex'),nonce,1,mac,1);
  IF public.consume_recovery_email_verification(verify_a,mac)<>'CONSUMED' OR public.consume_recovery_email_verification(verify_a,mac)<>'TERMINAL' THEN RAISE EXCEPTION 'challenge consume reuse contract failed'; END IF;
  BEGIN PERFORM public.activate_social_account(a); RAISE EXCEPTION 'closed launch activated social account'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'SOCIAL_ACCOUNT_LAUNCH_CLOSED' THEN RAISE; END IF; END;
  UPDATE public.public_account_launch_control SET state='open',account_registration_enabled=true,private_profile_enabled=true,school_membership_enabled=true WHERE control_key='public_account';
  PERFORM public.activate_social_account(a);
  IF NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id=a AND status='active') OR NOT EXISTS(SELECT 1 FROM private.social_identity_registry WHERE account_id=a AND status='active') THEN RAISE EXCEPTION 'verified activation failed'; END IF;
  b:=public.create_provisional_social_account('naver','slb:v1:k01:naver:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',decode(repeat('1',64),'hex'),1);
  PERFORM public.bind_social_auth_principal(b,'81000000-0000-4000-8000-000000000002');
  verify_expired:=gen_random_uuid();
  INSERT INTO private.recovery_email_verifications(id,account_id,purpose,recovery_email_hmac,hmac_key_version,destination_ciphertext,destination_nonce,encryption_key_version,otp_mac,otp_key_version,created_at,expires_at)
  VALUES(verify_expired,b,'activation',hmac_b,1,decode(repeat('3',96),'hex'),nonce,1,mac,1,now()-interval '20 minutes',now()-interval '10 minutes');
  IF public.consume_recovery_email_verification(verify_expired,mac)<>'EXPIRED' THEN RAISE EXCEPTION 'expired challenge accepted'; END IF;
  verify_expired:=public.create_recovery_email_verification(b,'activation',hmac_a,1,decode(repeat('4',96),'hex'),nonce,1,mac,1);
  BEGIN PERFORM public.consume_recovery_email_verification(verify_expired,mac); RAISE EXCEPTION 'duplicate verified hmac accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  c:=public.create_provisional_social_account('google','slb:v1:k01:google:ccccccccccccccccccccccccccccccccccccccccccc',decode(repeat('2',64),'hex'),1);
  PERFORM public.bind_social_auth_principal(c,'81000000-0000-4000-8000-000000000003');
  verify_expired:=public.create_recovery_email_verification(c,'activation',hmac_b,1,decode(repeat('5',96),'hex'),nonce,1,mac,1);
  IF public.consume_recovery_email_verification(verify_expired,mac)<>'CONSUMED' THEN RAISE EXCEPTION 'different hmac was rejected'; END IF;
  SELECT account_id INTO cleanup_a FROM public.get_social_account_state_for_owner() WHERE account_id=a;
  IF cleanup_a<>a THEN RAISE EXCEPTION 'safe owner state unavailable'; END IF;
  PERFORM public.revoke_social_identity_for_deletion(a);
  IF EXISTS(SELECT 1 FROM private.private_accounts WHERE id=a AND recovery_email_ciphertext IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id=a AND recovery_email_hmac=hmac_a) THEN RAISE EXCEPTION 'deletion crypto clear/retention contract failed'; END IF;
  cleanup_a:=public.enqueue_auth_principal_cleanup(a,NULL); cleanup_again:=public.enqueue_auth_principal_cleanup(a,NULL);
  IF cleanup_a<>cleanup_again OR (SELECT count(*) FROM private.auth_principal_cleanup_jobs WHERE account_id=a)<>1 THEN RAISE EXCEPTION 'cleanup queue idempotency failed'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN SELECT * FROM private.private_accounts; RAISE EXCEPTION 'authenticated read private crypto table'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO private.private_accounts(status,primary_provider,primary_broker_subject) VALUES('provisional','google','slb:v1:k01:google:ddddddddddddddddddddddddddddddddddddddddddd'); RAISE EXCEPTION 'authenticated direct private write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.get_social_account_state_for_owner()) THEN RAISE EXCEPTION 'safe owner status missing'; END IF;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'PHASE10O_F_LIFECYCLE_OK' status;
