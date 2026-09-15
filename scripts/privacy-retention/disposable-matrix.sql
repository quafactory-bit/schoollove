\set ON_ERROR_STOP on
-- Only the schema-only disposable clone, never a remote database.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('private.social_transition','approved',true);
INSERT INTO auth.users(id) VALUES
 ('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002'),('a1000000-0000-4000-8000-000000000003');
INSERT INTO private.private_accounts(id,auth_user_id,status,primary_provider,primary_broker_subject)
SELECT ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'provisional','google','slb:v1:k01:google:'||repeat(n::text,43)
FROM generate_series(1,3) n;
INSERT INTO private.social_identity_registry(broker_subject,provider,subject_digest,subject_key_version,account_id,auth_user_id,status)
SELECT primary_broker_subject,'google',decode(repeat('ab',32),'hex'),1,id,auth_user_id,'provisional' FROM private.private_accounts;
INSERT INTO public.account_deletion_requests(id,user_id,status) VALUES
 ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','pending'),
 ('c1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','pending');
INSERT INTO public.safety_account_restrictions(user_id,status) VALUES('a1000000-0000-4000-8000-000000000003','suspended');
INSERT INTO auth.sessions(id,user_id) VALUES('d1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');

SELECT public.admin_prepare_public_account_deletion('c1000000-0000-4000-8000-000000000001','USER_REQUEST','test');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.sessions WHERE user_id='a1000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'SESSION_REVOCATION_FAILED'; END IF;
END $$;
SELECT public.admin_begin_public_account_auth_deletion('c1000000-0000-4000-8000-000000000001','test');
DO $$ BEGIN
 BEGIN
  PERFORM public.admin_finalize_public_account_auth_deletion('c1000000-0000-4000-8000-000000000001','USER_REQUEST','test');
  RAISE EXCEPTION 'LIVE_AUTH_WAS_ACCEPTED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AUTH_IDENTITY_STILL_LINKED' THEN RAISE; END IF; END;
END $$;
-- Retry after the Auth step failed: preparation and begin are idempotent.
SELECT public.admin_mark_public_account_auth_deletion_failed('c1000000-0000-4000-8000-000000000001','AUTH_FAILED','test');
SELECT public.admin_prepare_public_account_deletion('c1000000-0000-4000-8000-000000000001','USER_REQUEST','test');
SELECT public.admin_begin_public_account_auth_deletion('c1000000-0000-4000-8000-000000000001','test');
DELETE FROM auth.users WHERE id='a1000000-0000-4000-8000-000000000001';
SELECT public.admin_prepare_public_account_deletion('c1000000-0000-4000-8000-000000000001','USER_REQUEST','test');
SELECT public.admin_begin_public_account_auth_deletion('c1000000-0000-4000-8000-000000000001','test');
SELECT public.admin_finalize_public_account_auth_deletion('c1000000-0000-4000-8000-000000000001','USER_REQUEST','test');
SELECT public.admin_finalize_public_account_auth_deletion('c1000000-0000-4000-8000-000000000001','USER_REQUEST','test');
SELECT public.run_privacy_retention_cleanup();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id='b1000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'REPLAY_GRACE_REMOVED_EARLY'; END IF;
END $$;

-- One expired and one live challenge. Preserve the rolling budget even when its owner is purged.
INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,created_at,expires_at)
SELECT ('e1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'att_'||repeat(n::text,20),'google','created',
 now()+CASE WHEN n=1 THEN interval '-11 minutes' ELSE interval '0 minutes' END,
 now()+CASE WHEN n=1 THEN interval '-1 minute' ELSE interval '9 minutes' END FROM generate_series(1,2) n;
INSERT INTO private.recovery_email_verifications(id,login_attempt_id,purpose,recovery_email_hmac,hmac_key_version,
 destination_ciphertext,destination_nonce,encryption_key_version,otp_mac,otp_key_version,created_at,expires_at,reserved_account_id)
SELECT ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('e1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'login_decision',decode(repeat('cd',32),'hex'),1,
 decode(repeat('11',32),'hex'),decode(repeat('22',12),'hex'),1,decode(repeat('33',32),'hex'),1,
 now()+CASE WHEN n=1 THEN interval '-11 minutes' ELSE interval '0 minutes' END,
 now()+CASE WHEN n=1 THEN interval '-1 minute' ELSE interval '9 minutes' END,
 ('f2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,2) n;
INSERT INTO private.recovery_delivery_attempts(id,verification_id,login_attempt_id,recovery_email_hmac,hmac_key_version,state,reserved_at)
SELECT ('d2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('e1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,decode(repeat('cd',32),'hex'),1,'reserved',now()-interval '5 minutes'
FROM generate_series(1,2) n;
UPDATE public.account_deletion_requests SET resolved_at=now()-interval '16 minutes',purge_after=now()-interval '1 minute'
 WHERE id='c1000000-0000-4000-8000-000000000001';
SELECT public.run_privacy_retention_cleanup();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.private_accounts WHERE id='b1000000-0000-4000-8000-000000000001')
 OR EXISTS(SELECT 1 FROM private.auth_principal_cleanup_jobs WHERE auth_user_id='a1000000-0000-4000-8000-000000000001')
 OR EXISTS(SELECT 1 FROM public.public_account_launch_audit WHERE target_id='c1000000-0000-4000-8000-000000000001')
 OR EXISTS(SELECT 1 FROM public.account_deletion_requests WHERE id='c1000000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'IDENTIFIERS_REMAIN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id='b1000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'UNRELATED_ACCOUNT_REMOVED'; END IF;
 IF EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id='f1000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'EXPIRED_SECRET_REMAINS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.recovery_email_verifications WHERE id='f1000000-0000-4000-8000-000000000002' AND otp_mac IS NOT NULL) THEN RAISE EXCEPTION 'LIVE_SECRET_REMOVED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.recovery_delivery_attempts WHERE id='d2000000-0000-4000-8000-000000000001'
  AND state='failed' AND login_attempt_id IS NULL AND verification_id IS NULL) THEN RAISE EXCEPTION 'RATE_BUDGET_CASCADED'; END IF;
END $$;
UPDATE private.recovery_delivery_attempts SET reserved_at=now()-interval '24 hours 1 second' WHERE id='d2000000-0000-4000-8000-000000000001';
INSERT INTO private.privacy_deletion_daily_totals VALUES((now() AT TIME ZONE 'Asia/Seoul')::date-91,7);
SELECT public.run_privacy_retention_cleanup();
SELECT public.run_privacy_retention_cleanup();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.recovery_delivery_attempts WHERE id='d2000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'EXPIRED_BUDGET_REMAINS'; END IF;
 IF (SELECT sum(completed_count) FROM private.privacy_deletion_daily_totals)<>1 THEN RAISE EXCEPTION 'AGGREGATE_DUPLICATED_OR_EXPIRED'; END IF;
END $$;

-- Safety hold is deliberately not swept as an ordinary voluntary deletion.
SELECT public.admin_prepare_public_account_deletion('c1000000-0000-4000-8000-000000000003','USER_REQUEST','test');
SELECT public.admin_begin_public_account_auth_deletion('c1000000-0000-4000-8000-000000000003','test');
DELETE FROM auth.users WHERE id='a1000000-0000-4000-8000-000000000003';
SELECT public.admin_finalize_public_account_auth_deletion('c1000000-0000-4000-8000-000000000003','USER_REQUEST','test');
UPDATE public.account_deletion_requests SET resolved_at=now()-interval '16 minutes',purge_after=now()-interval '1 minute'
 WHERE id='c1000000-0000-4000-8000-000000000003';
SELECT public.run_privacy_retention_cleanup();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.private_accounts WHERE id='b1000000-0000-4000-8000-000000000003' AND deletion_safety_hold) THEN RAISE EXCEPTION 'SAFETY_HOLD_REMOVED'; END IF;
 IF (SELECT sum(completed_count) FROM private.privacy_deletion_daily_totals)<>1 THEN RAISE EXCEPTION 'HELD_REQUEST_COUNTED'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.run_privacy_retention_cleanup(); RAISE EXCEPTION 'PUBLIC_CLEANUP_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Real RESTRICT dependencies must be removed leaf-first, including encrypted code material.
INSERT INTO private.oauth_login_attempts(id,safe_attempt_id,provider,state,created_at,expires_at)
VALUES('e3000000-0000-4000-8000-000000000001','att_33333333333333333333','google','created',now()-interval '11 minutes',now()-interval '1 minute');
INSERT INTO private.upstream_login_legs(id,login_attempt_id,provider,status,client_binding_digest,created_at,expires_at,terminal_at)
VALUES('e3000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000001','google','expired',decode(repeat('44',32),'hex'),now()-interval '11 minutes',now()-interval '1 minute',now());
INSERT INTO private.downstream_authorization_transactions(id,login_attempt_id,upstream_login_leg_id,client_id,redirect_uri,response_type,requested_scopes,pkce_s256_challenge,pkce_method,status,created_at,expires_at,terminal_at)
VALUES('e3000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002',
 'test','https://example.invalid/callback','code','openid',repeat('A',43),'S256','expired',now()-interval '11 minutes',now()-interval '1 minute',now());
INSERT INTO private.broker_authorization_codes(id,login_attempt_id,code_digest,client_id,redirect_uri,pkce_s256_challenge,authentication_time,state,created_at,expires_at,rejected_at,authorization_transaction_id)
VALUES('e3000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-000000000001',decode(repeat('55',32),'hex'),
 'test','https://example.invalid/callback',repeat('A',43),extract(epoch FROM now())::bigint,'expired',now()-interval '11 minutes',now()-interval '1 minute',now(),'e3000000-0000-4000-8000-000000000003');
SELECT public.run_privacy_retention_cleanup();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE id='e3000000-0000-4000-8000-000000000004')
 OR EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id='e3000000-0000-4000-8000-000000000003')
 OR EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id='e3000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'AUTH_DEPENDENCIES_REMAIN'; END IF;
END $$;
SELECT 'PRIVACY_RETENTION_MATRIX_PASS' AS result;
ROLLBACK;
