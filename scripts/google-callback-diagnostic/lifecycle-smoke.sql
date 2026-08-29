SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.diag_subject(digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'slb:v1:k01:google:'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_')
$$;

CREATE OR REPLACE FUNCTION pg_temp.diag_bound(
  safe_id text, tx_id uuid, leg_id uuid, handle_digest bytea, state_digest bytea
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  attempt_id uuid;
  outcome_value text;
BEGIN
  attempt_id:=public.create_social_login_attempt(safe_id,'google',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO outcome_value FROM public.create_downstream_authorization_transaction(
    tx_id,attempt_id,handle_digest,'slb-supabase-google','https://consumer.invalid/return',
    'code','openid',repeat('A',43),'S256','downstream-nonce','downstream-state',
    clock_timestamp()+interval '5 minutes'
  );
  IF outcome_value<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'DIAGNOSTIC_TX_CREATE'; END IF;
  SELECT outcome INTO outcome_value FROM public.claim_downstream_authorization_transaction_by_handle(handle_digest);
  IF outcome_value<>'TRANSACTION_CLAIMED' THEN RAISE EXCEPTION 'DIAGNOSTIC_TX_CLAIM'; END IF;
  SELECT outcome INTO outcome_value FROM public.create_upstream_login_leg(
    attempt_id,leg_id,'google',decode(repeat('a1',32),'hex'),state_digest,
    decode(repeat('b1',32),'hex'),repeat('B',43),decode(repeat('c1',17),'hex'),
    decode(repeat('d1',12),'hex'),1
  );
  IF outcome_value<>'UPSTREAM_LEG_CREATED' THEN RAISE EXCEPTION 'DIAGNOSTIC_LEG_CREATE'; END IF;
  IF public.bind_downstream_authorization_transaction_upstream_leg(tx_id,leg_id)<>'UPSTREAM_BOUND' THEN
    RAISE EXCEPTION 'DIAGNOSTIC_TX_BIND';
  END IF;
  SELECT outcome INTO outcome_value FROM public.claim_upstream_login_callback_by_state(
    'google',decode(repeat('a1',32),'hex'),state_digest
  );
  IF outcome_value<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'DIAGNOSTIC_CALLBACK_CLAIM'; END IF;
  RETURN attempt_id;
END $$;

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='d9000000-0000-4000-8000-000000000001';
  leg_id uuid:='d9000000-0000-4000-8000-000000000011';
  result text;
BEGIN
  attempt_id:=pg_temp.diag_bound('att_diag_nonce_failed_0001',tx_id,leg_id,decode(repeat('01',32),'hex'),decode(repeat('11',32),'hex'));
  result:=public.fail_upstream_login_leg_with_diagnostic(attempt_id,leg_id,'provider_failure','nonce_failed',NULL);
  IF result<>'REJECTED'
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=attempt_id AND state='failed_safe')
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg_id AND status='rejected' AND diagnostic_reason='nonce_failed' AND diagnostic_upstream_status IS NULL AND terminal_at IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx_id AND status='rejected' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN
    RAISE EXCEPTION 'DIAGNOSTIC_NONCE_ATOMIC_FAILURE';
  END IF;
END $$;
SELECT 'GOOGLE_DIAGNOSTIC_NONCE_FAILED_ATOMIC_OK' AS status;

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='d9000000-0000-4000-8000-000000000002';
  leg_id uuid:='d9000000-0000-4000-8000-000000000012';
  result text;
BEGIN
  attempt_id:=pg_temp.diag_bound('att_diag_http_failed_0002',tx_id,leg_id,decode(repeat('02',32),'hex'),decode(repeat('12',32),'hex'));
  result:=public.fail_upstream_login_leg_with_diagnostic(attempt_id,leg_id,'provider_failure','token_exchange_http_failed',400);
  IF result<>'REJECTED' OR NOT EXISTS(
    SELECT 1 FROM private.upstream_login_legs
    WHERE id=leg_id AND diagnostic_reason='token_exchange_http_failed' AND diagnostic_upstream_status=400
  ) THEN RAISE EXCEPTION 'DIAGNOSTIC_HTTP_STATUS_FAILURE'; END IF;

  result:=public.fail_upstream_login_leg_with_diagnostic(attempt_id,leg_id,'provider_failure','nonce_failed',401);
  IF result<>'REPLAY_REJECTED' OR NOT EXISTS(
    SELECT 1 FROM private.upstream_login_legs
    WHERE id=leg_id AND diagnostic_reason='token_exchange_http_failed' AND diagnostic_upstream_status=400
  ) THEN RAISE EXCEPTION 'DIAGNOSTIC_REPLAY_OVERWRITE'; END IF;

  BEGIN
    UPDATE private.upstream_login_legs SET diagnostic_reason='nonce_failed',diagnostic_upstream_status=401 WHERE id=leg_id;
    RAISE EXCEPTION 'DIAGNOSTIC_REWRITE_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='DIAGNOSTIC_REWRITE_ACCEPTED' THEN RAISE; END IF;
  END;
END $$;
SELECT 'GOOGLE_DIAGNOSTIC_HTTP_STATUS_AND_IMMUTABILITY_OK' AS status;

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='d9000000-0000-4000-8000-000000000003';
  leg_id uuid:='d9000000-0000-4000-8000-000000000013';
  result text;
BEGIN
  attempt_id:=pg_temp.diag_bound('att_diag_fallback_0003',tx_id,leg_id,decode(repeat('03',32),'hex'),decode(repeat('13',32),'hex'));
  result:=public.fail_upstream_login_leg_with_diagnostic(attempt_id,leg_id,'provider_failure','verifier_unclassified_failure',NULL);
  IF result<>'REJECTED'
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg_id AND diagnostic_reason='verifier_unclassified_failure') THEN
    RAISE EXCEPTION 'DIAGNOSTIC_FALLBACK_FAILURE result=% status=% reason=%',result,
      (SELECT status FROM private.upstream_login_legs WHERE id=leg_id),
      (SELECT diagnostic_reason FROM private.upstream_login_legs WHERE id=leg_id);
  END IF;
END $$;
SELECT 'GOOGLE_DIAGNOSTIC_FALLBACK_OK' AS status;

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='d9000000-0000-4000-8000-000000000004';
  leg_id uuid:='d9000000-0000-4000-8000-000000000014';
  result text;
BEGIN
  attempt_id:=pg_temp.diag_bound('att_diag_time_failed_0004',tx_id,leg_id,decode(repeat('04',32),'hex'),decode(repeat('14',32),'hex'));
  result:=public.fail_upstream_login_leg_with_diagnostic(attempt_id,leg_id,'expired','token_time_failed',NULL);
  IF result<>'EXPIRED'
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=attempt_id AND state='expired')
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg_id AND status='expired' AND diagnostic_reason='token_time_failed')
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx_id AND status='expired') THEN
    RAISE EXCEPTION 'DIAGNOSTIC_TIME_LIFECYCLE_FAILURE result=% attempt=% leg=% tx=% reason=%',result,
      (SELECT state FROM private.oauth_login_attempts WHERE id=attempt_id),
      (SELECT status FROM private.upstream_login_legs WHERE id=leg_id),
      (SELECT status FROM private.downstream_authorization_transactions WHERE id=tx_id),
      (SELECT diagnostic_reason FROM private.upstream_login_legs WHERE id=leg_id);
  END IF;
END $$;
SELECT 'GOOGLE_DIAGNOSTIC_TOKEN_TIME_EXPIRED_OK' AS status;

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='d9000000-0000-4000-8000-000000000005';
  leg_id uuid:='d9000000-0000-4000-8000-000000000015';
  rejected boolean:=false;
BEGIN
  attempt_id:=pg_temp.diag_bound('att_diag_required_0005',tx_id,leg_id,decode(repeat('05',32),'hex'),decode(repeat('15',32),'hex'));
  BEGIN
    PERFORM public.fail_upstream_login_leg_with_diagnostic(attempt_id,leg_id,'provider_failure',NULL,NULL);
  EXCEPTION WHEN raise_exception THEN rejected:=true;
  END;
  IF NOT rejected
    OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=attempt_id AND state='upstream_pending')
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg_id AND status='callback_claimed' AND diagnostic_reason IS NULL)
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx_id AND status='upstream_bound') THEN
    RAISE EXCEPTION 'DIAGNOSTIC_REQUIRED_ATOMICITY_FAILURE';
  END IF;
END $$;
SELECT 'GOOGLE_DIAGNOSTIC_REQUIRED_NO_PARTIAL_TERMINALIZATION_OK' AS status;

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='d9000000-0000-4000-8000-000000000006';
  leg_id uuid:='d9000000-0000-4000-8000-000000000016';
  rejected boolean:=false;
BEGIN
  attempt_id:=pg_temp.diag_bound('att_diag_pending_guard_06',tx_id,leg_id,decode(repeat('06',32),'hex'),decode(repeat('16',32),'hex'));
  -- Return the row to a coherent pending state solely inside this disposable DB.
  UPDATE private.upstream_login_legs SET status='pending',state_digest=decode(repeat('16',32),'hex'),callback_claimed_at=NULL WHERE id=leg_id;
  BEGIN
    UPDATE private.upstream_login_legs SET diagnostic_reason='nonce_failed' WHERE id=leg_id;
  EXCEPTION WHEN raise_exception OR check_violation THEN rejected:=true;
  END;
  IF NOT rejected OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg_id AND status='pending' AND diagnostic_reason IS NULL) THEN
    RAISE EXCEPTION 'DIAGNOSTIC_PENDING_PERSISTENCE_FAILURE';
  END IF;
END $$;
SELECT 'GOOGLE_DIAGNOSTIC_PENDING_PERSISTENCE_REJECTED_OK' AS status;

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='d9000000-0000-4000-8000-000000000007';
  leg_id uuid:='d9000000-0000-4000-8000-000000000017';
  digest_value bytea:=decode(repeat('e1',32),'hex');
  result text;
BEGIN
  attempt_id:=pg_temp.diag_bound('att_diag_success_null_0007',tx_id,leg_id,decode(repeat('07',32),'hex'),decode(repeat('17',32),'hex'));
  result:=public.record_verified_social_identity_from_upstream_leg(attempt_id,leg_id,'google',pg_temp.diag_subject(digest_value),digest_value,1);
  IF result<>'RECOVERY_REQUIRED'
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg_id AND status='verified' AND diagnostic_reason IS NULL AND diagnostic_upstream_status IS NULL) THEN
    RAISE EXCEPTION 'DIAGNOSTIC_SUCCESS_NULL_FAILURE result=% attempt=% leg=% diag=%',result,
      (SELECT state FROM private.oauth_login_attempts WHERE id=attempt_id),
      (SELECT status FROM private.upstream_login_legs WHERE id=leg_id),
      (SELECT diagnostic_reason FROM private.upstream_login_legs WHERE id=leg_id);
  END IF;
END $$;
SELECT 'GOOGLE_DIAGNOSTIC_SUCCESS_PATH_NULL_OK' AS status;

DO $$
DECLARE
  attempt_id uuid;
  tx_id uuid:='d9000000-0000-4000-8000-000000000008';
  leg_id uuid:='d9000000-0000-4000-8000-000000000018';
  result text;
BEGIN
  attempt_id:=pg_temp.diag_bound('att_diag_legacy_null_0008',tx_id,leg_id,decode(repeat('08',32),'hex'),decode(repeat('18',32),'hex'));
  result:=public.fail_upstream_login_leg(attempt_id,leg_id,'provider_failure');
  IF result<>'REJECTED'
    OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg_id AND status='rejected' AND diagnostic_reason IS NULL AND diagnostic_upstream_status IS NULL) THEN
    RAISE EXCEPTION 'DIAGNOSTIC_LEGACY_COMPATIBILITY_FAILURE result=% attempt=% leg=% reason=% status=%',result,
      (SELECT state FROM private.oauth_login_attempts WHERE id=attempt_id),
      (SELECT status FROM private.upstream_login_legs WHERE id=leg_id),
      (SELECT diagnostic_reason FROM private.upstream_login_legs WHERE id=leg_id),
      (SELECT diagnostic_upstream_status FROM private.upstream_login_legs WHERE id=leg_id);
  END IF;
END $$;
SELECT 'GOOGLE_DIAGNOSTIC_LEGACY_RPC_COMPATIBLE_OK' AS status;
