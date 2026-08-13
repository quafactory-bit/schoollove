-- PHASE 10O-P: all authorization-code creation flows through the transaction-bound RPC.
SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.phase10op_subject(provider_name text, digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_') $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10op_ready_auth_bound(
  safe_id text, digest_value bytea, tx_id uuid, leg_id uuid, handle_digest bytea, tx_nonce text, tx_state text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; verification uuid:=gen_random_uuid(); reserved uuid:=gen_random_uuid(); auth_id uuid:=gen_random_uuid(); outcome text; subject text; client_digest bytea:=decode(repeat('91',32),'hex'); state_digest bytea:=decode(repeat('92',32),'hex');
BEGIN
  subject:=pg_temp.phase10op_subject('naver',digest_value);
  a:=public.create_social_login_attempt(safe_id,'naver',clock_timestamp()+interval '10 minutes');
  SELECT x.outcome INTO outcome FROM public.create_downstream_authorization_transaction(tx_id,a,handle_digest,'slb-supabase-naver','https://consumer.invalid/return?fixed=1','code','openid',repeat('A',43),'S256',tx_nonce,tx_state,clock_timestamp()+interval '5 minutes') x;
  IF outcome<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10O_P_TX_CREATE'; END IF;
  SELECT x.outcome INTO outcome FROM public.claim_downstream_authorization_transaction_by_handle(handle_digest) x; IF outcome<>'TRANSACTION_CLAIMED' THEN RAISE EXCEPTION 'PHASE10O_P_TX_CLAIM'; END IF;
  SELECT x.outcome INTO outcome FROM public.create_upstream_login_leg(a,leg_id,'naver',client_digest,state_digest,NULL,NULL,NULL,NULL,NULL) x; IF outcome<>'UPSTREAM_LEG_CREATED' THEN RAISE EXCEPTION 'PHASE10O_P_LEG_CREATE'; END IF;
  IF public.bind_downstream_authorization_transaction_upstream_leg(tx_id,leg_id)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10O_P_TX_BIND'; END IF;
  SELECT x.outcome INTO outcome FROM public.claim_upstream_login_callback_by_state('naver',client_digest,state_digest) x; IF outcome<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'PHASE10O_P_CALLBACK'; END IF;
  IF public.record_verified_social_identity_from_upstream_leg(a,leg_id,'naver',subject,digest_value,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_P_IDENTITY'; END IF;
  SELECT x.outcome INTO outcome FROM public.create_and_reserve_login_attempt_recovery_delivery(a,verification,reserved,digest_value,1,decode(repeat('a1',17),'hex'),decode(repeat('a2',12),'hex'),1,decode(repeat('a3',32),'hex'),1) x;
  IF outcome<>'RECOVERY_DELIVERY_RESERVED' OR public.mark_login_attempt_recovery_delivery_sent((SELECT id FROM private.recovery_delivery_attempts WHERE verification_id=verification))<>'RECOVERY_DELIVERY_SENT' THEN RAISE EXCEPTION 'PHASE10O_P_RECOVERY_SETUP'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_recovery_and_decide_social_account(a,verification,decode(repeat('a3',32),'hex')) x; IF outcome<>'ACCOUNT_DECIDED' THEN RAISE EXCEPTION 'PHASE10O_P_ACCOUNT'; END IF;
  INSERT INTO auth.users(id,email) VALUES(auth_id,NULL);
  IF NOT public.bind_social_auth_principal(reserved,auth_id) THEN RAISE EXCEPTION 'PHASE10O_P_PRINCIPAL'; END IF;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10op_ready_existing_primary(
  safe_id text, digest_value bytea, tx_id uuid, leg_id uuid, handle_digest bytea
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; outcome text; subject text; client_digest bytea:=decode(repeat('93',32),'hex'); state_digest bytea:=decode(repeat('94',32),'hex');
BEGIN
  subject:=pg_temp.phase10op_subject('naver',digest_value);
  a:=public.create_social_login_attempt(safe_id,'naver',clock_timestamp()+interval '10 minutes');
  SELECT x.outcome INTO outcome FROM public.create_downstream_authorization_transaction(tx_id,a,handle_digest,'slb-supabase-naver','https://consumer.invalid/return?fixed=1','code','openid',repeat('B',43),'S256',NULL,'exact state /+%?',clock_timestamp()+interval '5 minutes') x;
  IF outcome<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10O_P_EXISTING_TX'; END IF;
  PERFORM public.claim_downstream_authorization_transaction_by_handle(handle_digest);
  PERFORM public.create_upstream_login_leg(a,leg_id,'naver',client_digest,state_digest,NULL,NULL,NULL,NULL,NULL);
  IF public.bind_downstream_authorization_transaction_upstream_leg(tx_id,leg_id)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10O_P_EXISTING_BIND'; END IF;
  PERFORM public.claim_upstream_login_callback_by_state('naver',client_digest,state_digest);
  IF public.record_verified_social_identity_from_upstream_leg(a,leg_id,'naver',subject,digest_value,1)<>'EXISTING_PRIMARY' THEN RAISE EXCEPTION 'PHASE10O_P_EXISTING_IDENTITY'; END IF;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10op_issue(tx_id uuid, code_id uuid, digest_value bytea, nonce_value text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT outcome FROM public.issue_transaction_bound_broker_authorization_code(
    tx_id,code_id,digest_value,floor(extract(epoch FROM clock_timestamp()))::bigint-1,nonce_value,
    CASE WHEN nonce_value IS NULL THEN NULL ELSE extensions.digest(convert_to('schoollove:broker-code-downstream-nonce-digest:v1','UTF8')||decode('00','hex')||convert_to(nonce_value,'UTF8'),'sha256') END,
    CASE WHEN nonce_value IS NULL THEN NULL ELSE decode(repeat('ab',17),'hex') END,
    CASE WHEN nonce_value IS NULL THEN NULL ELSE decode(repeat('cd',12),'hex') END,
    CASE WHEN nonce_value IS NULL THEN NULL ELSE 1 END)
$$;

DO $$
DECLARE a uuid; account uuid; outcome text; state_value text; resolved record; tx uuid:='e1000000-0000-4000-8000-000000000001'; code uuid:='e1000000-0000-4000-8000-000000000001'; digest_value bytea:=decode(repeat('11',32),'hex');
BEGIN
  a:=pg_temp.phase10op_ready_auth_bound('att_10op_bound_00000001',digest_value,tx,'e1000000-0000-4000-8000-000000000011',decode(repeat('21',32),'hex'),'nonce-A','state +/%? exact');
  SELECT account_id INTO account FROM private.oauth_login_attempts WHERE id=a;
  SELECT * INTO resolved FROM public.get_transaction_bound_broker_code_issuance_context(a);
  IF resolved.authorization_transaction_id<>tx OR resolved.login_attempt_id<>a OR resolved.client_id<>'slb-supabase-naver'
    OR resolved.redirect_uri<>'https://consumer.invalid/return?fixed=1' OR resolved.pkce_s256_challenge<>repeat('A',43)
    OR resolved.downstream_nonce<>'nonce-A' OR resolved.downstream_state<>'state +/%? exact' THEN RAISE EXCEPTION 'PHASE10O_P_CONTEXT_RESOLVER_BOUND'; END IF;
  IF pg_temp.phase10op_issue(tx,code,decode(repeat('31',32),'hex'),'nonce-B')<>'AUTHORIZATION_CODE_REJECTED'
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='upstream_bound' AND downstream_nonce='nonce-A') THEN RAISE EXCEPTION 'PHASE10O_P_NONCE_SUBSTITUTION'; END IF;
  SELECT x.outcome,x.downstream_state INTO outcome,state_value FROM public.issue_transaction_bound_broker_authorization_code(tx,code,decode(repeat('31',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,'nonce-A',extensions.digest(convert_to('schoollove:broker-code-downstream-nonce-digest:v1','UTF8')||decode('00','hex')||convert_to('nonce-A','UTF8'),'sha256'),decode(repeat('ab',17),'hex'),decode(repeat('cd',12),'hex'),1) x;
  IF outcome<>'AUTHORIZATION_CODE_CREATED' OR state_value<>'state +/%? exact'
    OR NOT EXISTS(SELECT 1 FROM private.broker_authorization_codes c WHERE c.id=code AND c.authorization_transaction_id=tx AND c.login_attempt_id=a AND c.client_id='slb-supabase-naver' AND c.redirect_uri='https://consumer.invalid/return?fixed=1' AND c.pkce_s256_challenge=repeat('A',43))
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='consumed' AND downstream_nonce IS NULL AND downstream_state IS NULL AND terminal_at IS NOT NULL)
    OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'broker_code_ready' THEN RAISE EXCEPTION 'PHASE10O_P_AUTH_BOUND_ISSUE'; END IF;
  SELECT x.outcome INTO outcome FROM public.consume_broker_authorization_code(decode(repeat('31',32),'hex'),'slb-supabase-naver','https://consumer.invalid/return?fixed=1',repeat('A',43)) x;
  IF outcome<>'AUTHORIZATION_CODE_CONSUMED' THEN RAISE EXCEPTION 'PHASE10O_P_CONSUME'; END IF;
  PERFORM set_config('private.social_transition','approved',true);
  UPDATE private.private_accounts SET status='active',activated_at=clock_timestamp() WHERE id=account;
  UPDATE private.social_identity_registry SET status='active',activated_at=clock_timestamp() WHERE account_id=account;
END $$;
SELECT 'PHASE10O_P_AUTH_BOUND_TRANSACTION_ISSUANCE_OK' AS status;
SELECT 'PHASE10O_P_NONCE_SUBSTITUTION_REJECTED_OK' AS status;
SELECT 'PHASE10O_P_EXACT_CLIENT_REDIRECT_PKCE_AND_SCRUB_OK' AS status;
SELECT 'PHASE10O_P_CONSUME_REGRESSION_OK' AS status;
SELECT 'PHASE10O_P_CONTEXT_RESOLVER_AUTH_BOUND_OK' AS status;

DO $$
DECLARE a uuid; outcome text; issued text; resolved record; tx uuid:='e1000000-0000-4000-8000-000000000002'; digest_value bytea:=decode(repeat('11',32),'hex');
BEGIN
  a:=pg_temp.phase10op_ready_existing_primary('att_10op_existing_000001',digest_value,tx,'e1000000-0000-4000-8000-000000000012',decode(repeat('22',32),'hex'));
  SELECT * INTO resolved FROM public.get_transaction_bound_broker_code_issuance_context(a);
  IF resolved.authorization_transaction_id<>tx OR resolved.downstream_nonce IS NOT NULL OR resolved.downstream_state<>'exact state /+%?' THEN RAISE EXCEPTION 'PHASE10O_P_CONTEXT_RESOLVER_EXISTING'; END IF;
  issued:=pg_temp.phase10op_issue(tx,'e1000000-0000-4000-8000-000000000002',decode(repeat('32',32),'hex'));
  IF issued<>'AUTHORIZATION_CODE_CREATED'
    OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'broker_code_ready'
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='consumed') THEN RAISE EXCEPTION 'PHASE10O_P_EXISTING_PRIMARY outcome=% attempt=% tx=%',issued,(SELECT state FROM private.oauth_login_attempts WHERE id=a),(SELECT status FROM private.downstream_authorization_transactions WHERE id=tx); END IF;
END $$;
SELECT 'PHASE10O_P_EXISTING_PRIMARY_TRANSACTION_ISSUANCE_OK' AS status;
SELECT 'PHASE10O_P_CONTEXT_RESOLVER_EXISTING_PRIMARY_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='e1000000-0000-4000-8000-000000000003'; code uuid:='e1000000-0000-4000-8000-000000000003'; result text;
BEGIN
  a:=pg_temp.phase10op_ready_auth_bound('att_10op_retry_00000001',decode(repeat('41',32),'hex'),tx,'e1000000-0000-4000-8000-000000000013',decode(repeat('23',32),'hex'),NULL,NULL);
  IF pg_temp.phase10op_issue(tx,'e1000000-0000-4000-8000-000000000002',decode(repeat('32',32),'hex'))<>'AUTHORIZATION_CODE_REJECTED'
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='upstream_bound') THEN RAISE EXCEPTION 'PHASE10O_P_COLLISION_MUTATED'; END IF;
  IF pg_temp.phase10op_issue(tx,code,decode(repeat('42',32),'hex'))<>'AUTHORIZATION_CODE_CREATED' THEN RAISE EXCEPTION 'PHASE10O_P_COLLISION_RETRY'; END IF;
  IF pg_temp.phase10op_issue(tx,'e1000000-0000-4000-8000-000000000004',decode(repeat('43',32),'hex'))<>'AUTHORIZATION_CODE_REJECTED' THEN RAISE EXCEPTION 'PHASE10O_P_REPLAY'; END IF;
END $$;
SELECT 'PHASE10O_P_COLLISION_ROLLBACK_RETRY_OK' AS status;
SELECT 'PHASE10O_P_SEQUENTIAL_REPLAY_REJECTED_OK' AS status;

-- This eligible row is intentionally left for the fresh-process race runner.
DO $$
DECLARE a uuid;
BEGIN
  a:=pg_temp.phase10op_ready_auth_bound('att_10op_race_000000001',decode(repeat('51',32),'hex'),'e1000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000015',decode(repeat('25',32),'hex'),NULL,NULL);
  IF (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'auth_principal_bound'
    OR (SELECT status FROM private.downstream_authorization_transactions WHERE id='e1000000-0000-4000-8000-000000000005')<>'upstream_bound' THEN RAISE EXCEPTION 'PHASE10O_P_RACE_SETUP'; END IF;
END $$;
SELECT 'PHASE10O_P_RACE_SETUP_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='e1000000-0000-4000-8000-000000000007'; outcome text;
BEGIN
  a:=pg_temp.phase10op_ready_auth_bound('att_10op_expiry_0000001',decode(repeat('71',32),'hex'),tx,'e1000000-0000-4000-8000-000000000017',decode(repeat('27',32),'hex'),NULL,NULL);
  UPDATE private.downstream_authorization_transactions SET created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id=tx;
  SELECT x.outcome INTO outcome FROM public.issue_transaction_bound_broker_authorization_code(tx,'e1000000-0000-4000-8000-000000000007',decode(repeat('72',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL) x;
  IF outcome<>'AUTHORIZATION_CODE_EXPIRED' OR EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE authorization_transaction_id=tx)
    OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='expired' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_P_EXPIRY'; END IF;
END $$;
SELECT 'PHASE10O_P_EXPIRY_NO_RESURRECTION_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='e1000000-0000-4000-8000-000000000008'; resolved record;
BEGIN
  a:=public.create_social_login_attempt('att_10op_context_reject_1','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_downstream_authorization_transaction(tx,a,decode(repeat('81',32),'hex'),'slb-supabase-naver','https://consumer.invalid/return?fixed=1','code','openid',repeat('A',43),'S256',NULL,NULL,clock_timestamp()+interval '5 minutes');
  SELECT * INTO resolved FROM public.get_transaction_bound_broker_code_issuance_context(a);
  IF FOUND OR EXISTS(SELECT 1 FROM public.get_transaction_bound_broker_code_issuance_context(gen_random_uuid())) THEN RAISE EXCEPTION 'PHASE10O_P_CONTEXT_REJECT_PENDING'; END IF;
END $$;
SELECT 'PHASE10O_P_CONTEXT_RESOLVER_COARSE_REJECTION_OK' AS status;

-- These rows are deliberately left eligible. The direct-TCP harness starts
-- fresh OS processes that know only each trusted attempt ID, test nonce key,
-- and DB connection, then must resolve context through the service RPC.
DO $$
DECLARE a uuid;
BEGIN
  a:=pg_temp.phase10op_ready_auth_bound('att_10op_restart_nonce_01',decode(repeat('91',32),'hex'),'e1000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000019',decode(repeat('29',32),'hex'),'restart-nonce','restart state +/%?');
  a:=pg_temp.phase10op_ready_auth_bound('att_10op_restart_plain_01',decode(repeat('92',32),'hex'),'e1000000-0000-4000-8000-000000000010','e1000000-0000-4000-8000-000000000020',decode(repeat('2a',32),'hex'),NULL,'restart plain state');
  a:=pg_temp.phase10op_ready_auth_bound('att_10op_expiry_race_001',decode(repeat('93',32),'hex'),'e1000000-0000-4000-8000-000000000011','e1000000-0000-4000-8000-000000000021',decode(repeat('2b',32),'hex'),NULL,NULL);
END $$;
SELECT 'PHASE10O_P_FRESH_PROCESS_RESUME_SETUP_OK' AS status;
