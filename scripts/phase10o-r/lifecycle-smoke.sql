-- PHASE 10O-R: durable downstream context is live only until a terminal outcome.
SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.phase10or_subject(provider_name text, digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_') $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10or_bound(
  safe_id text, tx_id uuid, leg_id uuid, handle_digest bytea, state_digest bytea, nonce_value text DEFAULT 'nonce-r', state_value text DEFAULT 'state-r'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; result text; client_digest bytea:=decode(repeat('a1',32),'hex');
BEGIN
  a:=public.create_social_login_attempt(safe_id,'naver',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO result FROM public.create_downstream_authorization_transaction(tx_id,a,handle_digest,'slb-supabase-naver','https://consumer.invalid/return?fixed=1','code','openid',repeat('A',43),'S256',nonce_value,state_value,clock_timestamp()+interval '5 minutes');
  IF result<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10O_R_TX_CREATE'; END IF;
  SELECT outcome INTO result FROM public.claim_downstream_authorization_transaction_by_handle(handle_digest); IF result<>'TRANSACTION_CLAIMED' THEN RAISE EXCEPTION 'PHASE10O_R_TX_CLAIM'; END IF;
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,leg_id,'naver',client_digest,state_digest,NULL,NULL,NULL,NULL,NULL); IF result<>'UPSTREAM_LEG_CREATED' THEN RAISE EXCEPTION 'PHASE10O_R_LEG_CREATE'; END IF;
  IF public.bind_downstream_authorization_transaction_upstream_leg(tx_id,leg_id)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10O_R_TX_BIND'; END IF;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.phase10or_callback(a uuid, state_digest bytea)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE result text;
BEGIN
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('a1',32),'hex'),state_digest);
  IF result<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'PHASE10O_R_CALLBACK'; END IF;
END $$;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000030'; leg uuid:='f1000000-0000-4000-8000-000000000040'; state_digest bytea:=decode(repeat('10',32),'hex'); result text;
BEGIN
  a:=public.create_social_login_attempt('att_10or_claimed_unbound','naver',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(tx,a,decode(repeat('20',32),'hex'),'slb-supabase-naver','https://consumer.invalid/return','code','openid',repeat('A',43),'S256','nonce-unbound','state-unbound',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('20',32),'hex'));
  PERFORM public.create_upstream_login_leg(a,leg,'naver',decode(repeat('a1',32),'hex'),state_digest,NULL,NULL,NULL,NULL,NULL);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('a1',32),'hex'),state_digest);
  IF result<>'CORRELATION_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='claimed' AND upstream_login_leg_id IS NULL) OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs l WHERE l.id=leg AND l.status='pending' AND l.state_digest=decode(repeat('10',32),'hex')) THEN RAISE EXCEPTION 'PHASE10O_R_CALLBACK_UNBOUND_MUTATED'; END IF;
  IF public.bind_downstream_authorization_transaction_upstream_leg(tx,leg)<>'UPSTREAM_BOUND' THEN RAISE EXCEPTION 'PHASE10O_R_CALLBACK_UNBOUND_BIND'; END IF;
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('a1',32),'hex'),state_digest);
  IF result<>'CALLBACK_CLAIMED' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='upstream_bound' AND upstream_login_leg_id=leg) THEN RAISE EXCEPTION 'PHASE10O_R_CALLBACK_UNBOUND_SUCCESS'; END IF;
END $$;
SELECT 'PHASE10O_R_CLAIMED_UNBOUND_CALLBACK_REJECTS_THEN_BOUND_SUCCEEDS_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000001'; leg uuid:='f1000000-0000-4000-8000-000000000011'; state_digest bytea:=decode(repeat('11',32),'hex'); result text;
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_provider_failure',tx,leg,decode(repeat('21',32),'hex'),state_digest);
  PERFORM pg_temp.phase10or_callback(a,state_digest);
  result:=public.fail_upstream_login_leg(a,leg,'provider_failure');
  IF result<>'REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='failed_safe') OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg AND status='rejected') OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='rejected' AND downstream_nonce IS NULL AND downstream_state IS NULL AND terminal_at IS NOT NULL) OR EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE login_attempt_id=a) THEN RAISE EXCEPTION 'PHASE10O_R_PROVIDER_FAILURE'; END IF;
END $$;
SELECT 'PHASE10O_R_PROVIDER_FAILURE_ATOMIC_TERMINAL_SCRUB_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000002'; leg uuid:='f1000000-0000-4000-8000-000000000012'; state_digest bytea:=decode(repeat('12',32),'hex'); result text;
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_identity_failure',tx,leg,decode(repeat('22',32),'hex'),state_digest);
  PERFORM pg_temp.phase10or_callback(a,state_digest);
  result:=public.record_verified_social_identity_from_upstream_leg(a,leg,'naver','invalid',decode(repeat('31',32),'hex'),1);
  IF result<>'IDENTITY_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='failed_safe') OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg AND status='rejected') OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='rejected' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_R_IDENTITY_FAILURE'; END IF;
END $$;
SELECT 'PHASE10O_R_IDENTITY_FAILURE_ATOMIC_TERMINAL_SCRUB_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000003'; leg uuid:='f1000000-0000-4000-8000-000000000013'; state_digest bytea:=decode(repeat('13',32),'hex'); result text;
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_explicit_expiry',tx,leg,decode(repeat('23',32),'hex'),state_digest);
  PERFORM pg_temp.phase10or_callback(a,state_digest);
  result:=public.fail_upstream_login_leg(a,leg,'expired');
  IF result<>'EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='expired') OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg AND status='expired') OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='expired' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_R_EXPLICIT_EXPIRY'; END IF;
END $$;
SELECT 'PHASE10O_R_EXPLICIT_EXPIRY_TERMINAL_SCRUB_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000004'; leg uuid:='f1000000-0000-4000-8000-000000000014'; state_digest bytea:=decode(repeat('14',32),'hex'); digest_value bytea:=decode(repeat('f1',32),'hex'); result text;
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_identity_success',tx,leg,decode(repeat('24',32),'hex'),state_digest,'nonce-success','state-success');
  PERFORM pg_temp.phase10or_callback(a,state_digest);
  result:=public.record_verified_social_identity_from_upstream_leg(a,leg,'naver',pg_temp.phase10or_subject('naver',digest_value),digest_value,1);
  IF result<>'RECOVERY_REQUIRED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='recovery_required') OR NOT EXISTS(SELECT 1 FROM private.upstream_login_legs WHERE id=leg AND status='verified') OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='upstream_bound' AND downstream_nonce='nonce-success' AND downstream_state='state-success') THEN RAISE EXCEPTION 'PHASE10O_R_IDENTITY_SUCCESS_RETAINS'; END IF;
END $$;
SELECT 'PHASE10O_R_SUCCESS_RETAINS_CONTEXT_UNTIL_P_ISSUANCE_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000021'; leg uuid:='f1000000-0000-4000-8000-000000000031'; code uuid:='f1000000-0000-4000-8000-000000000041'; state_digest bytea:=decode(repeat('51',32),'hex'); digest_value bytea:=decode(repeat('11',32),'hex'); result text;
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_p_issuance_x',tx,leg,decode(repeat('61',32),'hex'),state_digest,'nonce-p','state-p');
  PERFORM pg_temp.phase10or_callback(a,state_digest);
  result:=public.record_verified_social_identity_from_upstream_leg(a,leg,'naver',pg_temp.phase10or_subject('naver',digest_value),digest_value,1);
  IF result<>'EXISTING_PRIMARY' THEN RAISE EXCEPTION 'PHASE10O_R_P_EXISTING_SETUP result=%',result; END IF;
  SELECT outcome INTO result FROM public.issue_transaction_bound_broker_authorization_code(tx,code,decode(repeat('71',32),'hex'),floor(extract(epoch FROM clock_timestamp()))::bigint-1,'nonce-p',extensions.digest(convert_to('schoollove:broker-code-downstream-nonce-digest:v1','UTF8')||decode('00','hex')||convert_to('nonce-p','UTF8'),'sha256'),decode(repeat('ab',17),'hex'),decode(repeat('cd',12),'hex'),1);
  IF result<>'AUTHORIZATION_CODE_CREATED' OR NOT EXISTS(SELECT 1 FROM private.broker_authorization_codes WHERE id=code) OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='consumed' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_R_P_ISSUANCE'; END IF;
END $$;
SELECT 'PHASE10O_R_P_SUCCESSFUL_ISSUANCE_CONSUMES_AND_SCRUBS_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000005'; leg uuid:='f1000000-0000-4000-8000-000000000015'; state_digest bytea:=decode(repeat('15',32),'hex'); result text;
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_callback_mismatch',tx,leg,decode(repeat('25',32),'hex'),state_digest);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('google',decode(repeat('a1',32),'hex'),state_digest);
  IF result<>'PROVIDER_MISMATCH' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='rejected' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_R_CALLBACK_PROVIDER_MISMATCH'; END IF;
  IF (SELECT count(*) FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('a1',32),'hex'),decode(repeat('ff',32),'hex')))<>'1' THEN RAISE EXCEPTION 'PHASE10O_R_CALLBACK_UNKNOWN'; END IF;
END $$;
SELECT 'PHASE10O_R_CALLBACK_TERMINAL_SCRUB_AND_UNKNOWN_NO_MUTATION_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000006'; leg uuid:='f1000000-0000-4000-8000-000000000016'; state_digest bytea:=decode(repeat('16',32),'hex'); result text;
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_callback_client',tx,leg,decode(repeat('26',32),'hex'),state_digest);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback_by_state('naver',decode(repeat('ff',32),'hex'),state_digest);
  IF result<>'CLIENT_BINDING_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='rejected' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_R_CALLBACK_CLIENT'; END IF;
END $$;
SELECT 'PHASE10O_R_CALLBACK_CLIENT_BINDING_TERMINAL_SCRUB_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000007'; result text;
BEGIN
  a:=public.create_social_login_attempt('att_10or_claim_expiry','naver',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(tx,a,decode(repeat('27',32),'hex'),'slb-supabase-naver','https://consumer.invalid/return','code','openid',repeat('A',43),'S256','nonce-expire','state-expire',clock_timestamp()+interval '1 millisecond');
  PERFORM pg_sleep(0.01);
  SELECT outcome INTO result FROM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('27',32),'hex'));
  IF result<>'EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='expired' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_R_CLAIM_EXPIRY'; END IF;
END $$;
SELECT 'PHASE10O_R_O_CLAIM_EXPIRY_SCRUB_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000008'; leg uuid:='f1000000-0000-4000-8000-000000000018'; result text;
BEGIN
  a:=public.create_social_login_attempt('att_10or_bind_expiry','naver',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(tx,a,decode(repeat('28',32),'hex'),'slb-supabase-naver','https://consumer.invalid/return','code','openid',repeat('A',43),'S256','nonce-bind','state-bind',clock_timestamp()+interval '1 second');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('28',32),'hex'));
  PERFORM public.create_upstream_login_leg(a,leg,'naver',decode(repeat('a1',32),'hex'),decode(repeat('18',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  PERFORM pg_sleep(1.01);
  result:=public.bind_downstream_authorization_transaction_upstream_leg(tx,leg);
  IF result<>'EXPIRED' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='expired' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_R_BIND_EXPIRY'; END IF;
END $$;
SELECT 'PHASE10O_R_O_BIND_EXPIRY_SCRUB_OK' AS status;

DO $$
DECLARE a uuid; b uuid; tx uuid:='f1000000-0000-4000-8000-000000000009'; leg_a uuid:='f1000000-0000-4000-8000-000000000019'; leg_b uuid:='f1000000-0000-4000-8000-000000000029'; state_digest bytea:=decode(repeat('19',32),'hex'); result text;
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_wrong_leg_a',tx,leg_a,decode(repeat('29',32),'hex'),state_digest); PERFORM pg_temp.phase10or_callback(a,state_digest);
  b:=public.create_social_login_attempt('att_10or_wrong_leg_b','naver',clock_timestamp()+interval '10 minutes'); PERFORM public.create_upstream_login_leg(b,leg_b,'naver',decode(repeat('a1',32),'hex'),decode(repeat('29',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  result:=public.fail_upstream_login_leg(a,leg_b,'provider_failure');
  IF result<>'REPLAY_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='upstream_bound' AND downstream_nonce IS NOT NULL) THEN RAISE EXCEPTION 'PHASE10O_R_WRONG_LEG_DOS'; END IF;
  result:=public.fail_upstream_login_leg(a,leg_a,'provider_failure');
  IF result<>'REJECTED' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='rejected' AND downstream_nonce IS NULL AND downstream_state IS NULL) THEN RAISE EXCEPTION 'PHASE10O_R_CORRECT_LEG result=% tx_status=% leg_status=% attempt_state=%',result,(SELECT status FROM private.downstream_authorization_transactions WHERE id=tx),(SELECT status FROM private.upstream_login_legs WHERE id=leg_a),(SELECT state FROM private.oauth_login_attempts WHERE id=a); END IF;
END $$;
SELECT 'PHASE10O_R_WRONG_LEG_NO_DOS_AND_REPLAY_NO_RESURRECTION_OK' AS status;

DO $$
DECLARE tx uuid:='f1000000-0000-4000-8000-000000000004'; failed boolean:=false;
BEGIN
  BEGIN
    UPDATE private.downstream_authorization_transactions SET status='rejected',broker_handle_digest=NULL,terminal_at=clock_timestamp() WHERE id=tx;
  EXCEPTION WHEN check_violation THEN failed:=true;
  END;
  IF NOT failed OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='upstream_bound' AND downstream_nonce IS NOT NULL) THEN RAISE EXCEPTION 'PHASE10O_R_STRUCTURAL_CHECK'; END IF;
END $$;
SELECT 'PHASE10O_R_TERMINAL_SCRUB_CHECK_STRUCTURAL_OK' AS status;

-- The direct-TCP race starts from this callback-claimed, transaction-bound row.
CREATE FUNCTION private.phase10or_test_live_collision_delay()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.safe_attempt_id='att_10or_live_collision' AND NEW.state='upstream_verified' THEN PERFORM pg_sleep(1); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.phase10or_test_live_collision_delay() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER phase10or_test_live_collision_delay BEFORE UPDATE OF state ON private.oauth_login_attempts
  FOR EACH ROW EXECUTE FUNCTION private.phase10or_test_live_collision_delay();

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000050'; leg uuid:='f1000000-0000-4000-8000-000000000060'; state_digest bytea:=decode(repeat('50',32),'hex');
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_live_collision',tx,leg,decode(repeat('60',32),'hex'),state_digest); PERFORM pg_temp.phase10or_callback(a,state_digest);
END $$;
SELECT 'PHASE10O_R_LIVE_SUBJECT_UNIQUENESS_RACE_SETUP_OK' AS status;

DO $$
DECLARE a uuid; tx uuid:='f1000000-0000-4000-8000-000000000010'; leg uuid:='f1000000-0000-4000-8000-000000000020'; state_digest bytea:=decode(repeat('20',32),'hex');
BEGIN
  a:=pg_temp.phase10or_bound('att_10or_identity_failure_race',tx,leg,decode(repeat('30',32),'hex'),state_digest); PERFORM pg_temp.phase10or_callback(a,state_digest);
END $$;
SELECT 'PHASE10O_R_IDENTITY_FAILURE_RACE_SETUP_OK' AS status;
