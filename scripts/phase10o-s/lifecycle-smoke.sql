-- PHASE 10O-S acceptance: service RPCs only.  No raw browser or provider values are emitted.
SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.phase10os_attempt(safe_id text, provider_name text DEFAULT 'naver')
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.create_social_login_attempt(safe_id,provider_name,clock_timestamp()+interval '5 minutes');
END $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10os_tx(a uuid, tx uuid, digest_value bytea, expiry timestamptz DEFAULT clock_timestamp()+interval '4 minutes')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE outcome_value text;
BEGIN
  SELECT outcome INTO outcome_value FROM public.create_downstream_authorization_transaction(tx,a,digest_value,'slb-supabase-naver','https://consumer.invalid/callback','code','openid',repeat('A',43),'S256','n','s',expiry);
  IF outcome_value<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10O_S_SETUP_TX'; END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10os_bind(digest_value bytea, leg uuid, provider_name text DEFAULT 'naver')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE result text;
BEGIN
  SELECT outcome INTO result FROM public.create_or_resume_durable_upstream_continuation(
    digest_value,leg,provider_name,decode(repeat('a1',32),'hex'),extensions.digest(digest_value||convert_to('phase10os-state','UTF8'),'sha256'),
    CASE WHEN provider_name='naver' THEN NULL ELSE decode(repeat('c1',32),'hex') END,
    CASE WHEN provider_name='naver' THEN NULL ELSE repeat('B',43) END,
    CASE WHEN provider_name='naver' THEN NULL ELSE decode(repeat('d1',17),'hex') END,
    CASE WHEN provider_name='naver' THEN NULL ELSE decode(repeat('e1',12),'hex') END,
    CASE WHEN provider_name='naver' THEN NULL ELSE 1 END,
    decode(repeat('f1',17),'hex'),decode(repeat('01',12),'hex'),1);
  RETURN result;
END $$;

DO $$
DECLARE a uuid; tx uuid:='51000000-0000-4000-8000-000000000001'; leg uuid:='51000000-0000-4000-8000-000000000011'; h bytea:=decode(repeat('11',32),'hex'); outcome_value text; resolver text;
BEGIN
  a:=pg_temp.phase10os_attempt('att_10os_resolve_crash'); PERFORM pg_temp.phase10os_tx(a,tx,h);
  SELECT outcome INTO resolver FROM public.resolve_durable_continuation_by_digest(h);
  IF resolver<>'CONTINUATION_PENDING' OR EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE login_attempt_id=a) OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='pending' AND broker_handle_digest IS NOT NULL AND continuation_handle_digest=h) THEN RAISE EXCEPTION 'PHASE10O_S_CASE1_RESOLVE_MUTATED'; END IF;
  outcome_value:=pg_temp.phase10os_bind(h,leg);
  IF outcome_value<>'CONTINUATION_BOUND' THEN RAISE EXCEPTION 'PHASE10O_S_CASE1_RETRY'; END IF;
END $$;
SELECT 'PHASE10O_S_CASE1_RESOLVE_CRASH_RETRY_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='51000000-0000-4000-8000-000000000002'; leg uuid:='51000000-0000-4000-8000-000000000012'; h bytea:=decode(repeat('12',32),'hex'); first_outcome text; second_outcome text;
BEGIN
  a:=pg_temp.phase10os_attempt('att_10os_response_lost','google'); PERFORM pg_temp.phase10os_tx(a,tx,h);
  first_outcome:=pg_temp.phase10os_bind(h,leg,'google'); second_outcome:=pg_temp.phase10os_bind(h,'51000000-0000-4000-8000-000000000112','google');
  IF first_outcome<>'CONTINUATION_BOUND' OR second_outcome<>'CONTINUATION_RESUMED' OR (SELECT count(*) FROM private.upstream_login_legs WHERE login_attempt_id=a)<>1 OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions t JOIN private.upstream_login_legs l ON l.id=t.upstream_login_leg_id WHERE t.id=tx AND t.status='upstream_bound' AND t.continuation_handle_digest=h AND l.continuation_ciphertext IS NOT NULL AND l.continuation_iv IS NOT NULL AND l.continuation_key_version=1) THEN RAISE EXCEPTION 'PHASE10O_S_CASE2_RESPONSE_LOSS'; END IF;
END $$;
SELECT 'PHASE10O_S_CASE2_RESPONSE_LOSS_CANONICAL_RESUME_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='51000000-0000-4000-8000-000000000003'; leg uuid:='51000000-0000-4000-8000-000000000013'; h bytea:=decode(repeat('13',32),'hex'); wrong text; good text;
BEGIN
  a:=pg_temp.phase10os_attempt('att_10os_wrong_binding'); PERFORM pg_temp.phase10os_tx(a,tx,h);
  SELECT outcome INTO wrong FROM public.create_or_resume_durable_upstream_continuation(decode(repeat('ff',32),'hex'),leg,'naver',decode(repeat('a1',32),'hex'),decode(repeat('b1',32),'hex'),NULL,NULL,NULL,NULL,NULL,decode(repeat('f1',17),'hex'),decode(repeat('01',12),'hex'),1);
  good:=pg_temp.phase10os_bind(h,leg);
  IF wrong<>'CORRELATION_REJECTED' OR good<>'CONTINUATION_BOUND' OR (SELECT count(*) FROM private.upstream_login_legs WHERE login_attempt_id=a)<>1 THEN RAISE EXCEPTION 'PHASE10O_S_CASE5_WRONG_BINDING_DOS'; END IF;
END $$;
SELECT 'PHASE10O_S_CASE5_WRONG_BINDING_NO_MUTATION_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='51000000-0000-4000-8000-000000000004'; leg uuid:='51000000-0000-4000-8000-000000000014'; h bytea:=decode(repeat('14',32),'hex'); outcome_value text;
BEGIN
  a:=pg_temp.phase10os_attempt('att_10os_no_callback_expiry'); PERFORM pg_temp.phase10os_tx(a,tx,h,clock_timestamp()+interval '1 second');
  IF pg_temp.phase10os_bind(h,leg)<>'CONTINUATION_BOUND' THEN RAISE EXCEPTION 'PHASE10O_S_CASE6_SETUP'; END IF;
  PERFORM pg_sleep(1.05); outcome_value:=public.expire_abandoned_downstream_authorization_transaction(tx);
  IF outcome_value<>'EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='expired') OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg AND status='expired' AND state_digest IS NULL AND nonce_digest IS NULL AND pkce_s256_challenge IS NULL AND pkce_verifier_ciphertext IS NULL AND continuation_ciphertext IS NULL) OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='expired' AND broker_handle_digest IS NULL AND continuation_handle_digest IS NULL AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_S_CASE6_EXPIRY_SCRUB'; END IF;
END $$;
SELECT 'PHASE10O_S_CASE6_NO_CALLBACK_EXPIRY_SCRUB_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='51000000-0000-4000-8000-000000000005'; leg uuid:='51000000-0000-4000-8000-000000000015'; h bytea:=decode(repeat('15',32),'hex'); outcome_value text;
BEGIN
  a:=pg_temp.phase10os_attempt('att_10os_callback_claimed_expiry'); PERFORM pg_temp.phase10os_tx(a,tx,h,clock_timestamp()+interval '1 second');
  IF pg_temp.phase10os_bind(h,leg)<>'CONTINUATION_BOUND' THEN RAISE EXCEPTION 'PHASE10O_S_CASE7_SETUP'; END IF;
  SELECT outcome INTO outcome_value FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('a1',32),'hex'),extensions.digest(h||convert_to('phase10os-state','UTF8'),'sha256'));
  IF outcome_value<>'CALLBACK_CLAIMED' OR EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND continuation_handle_digest IS NOT NULL) OR EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg AND continuation_ciphertext IS NOT NULL) THEN RAISE EXCEPTION 'PHASE10O_S_CASE7_CALLBACK_SCRUB'; END IF;
  PERFORM pg_sleep(1.05); outcome_value:=public.expire_abandoned_downstream_authorization_transaction(tx);
  IF outcome_value<>'EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='expired') OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg AND status='expired' AND state_digest IS NULL AND nonce_digest IS NULL AND pkce_s256_challenge IS NULL AND continuation_ciphertext IS NULL) OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='expired' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_S_CASE7_CALLBACK_EXPIRY'; END IF;
END $$;
SELECT 'PHASE10O_S_CASE7_CALLBACK_CLAIMED_EXPIRY_SCRUB_OK' AS status;

DO $$
DECLARE violations integer;
BEGIN
  SELECT count(*) INTO violations FROM private.downstream_authorization_transactions WHERE status IN ('expired','rejected','consumed') AND (downstream_nonce IS NOT NULL OR downstream_state IS NOT NULL);
  IF violations<>0 THEN RAISE EXCEPTION 'PHASE10O_S_R_TERMINAL_CONTEXT_VIOLATION'; END IF;
END $$;
SELECT 'PHASE10O_S_TERMINAL_RAW_CONTEXT_VIOLATIONS_0' AS status;
