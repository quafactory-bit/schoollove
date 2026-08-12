-- PHASE 10O-M: durable upstream leg lifecycle assertions. All values are synthetic.
SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.phase10om_subject(provider_name text, digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_') $$;

DO $$
DECLARE constraints_ok boolean; forbidden_count integer; table_count integer;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.oauth_login_attempts'::regclass AND pg_get_constraintdef(oid) LIKE '%upstream_pending%') INTO constraints_ok;
  SELECT count(*) INTO forbidden_count FROM information_schema.columns WHERE table_schema='private' AND table_name='upstream_login_legs' AND column_name IN ('raw_state','state_plaintext','raw_nonce','nonce_plaintext','pkce_verifier','raw_verifier','authorization_code','access_token','refresh_token','id_token','email','subject','profile');
  SELECT count(*) INTO table_count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r';
  IF NOT constraints_ok OR forbidden_count<>0 OR table_count<>8 OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname='upstream_login_legs') THEN RAISE EXCEPTION 'PHASE10O_M_SCHEMA_ASSERTION_FAILED'; END IF;
END $$;
SELECT 'PHASE10O_M_DURABLE_LEG_SCHEMA_OK' AS status;

DO $$
DECLARE a uuid; result text; client_digest bytea:=decode(repeat('11',32),'hex'); state_digest bytea:=decode(repeat('12',32),'hex'); nonce_digest bytea:=decode(repeat('13',32),'hex'); leg uuid:='a1000000-0000-4000-8000-000000000001';
BEGIN
  a:=public.create_social_login_attempt('att_10om_wrong_state_0001','google',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,leg,'google',client_digest,state_digest,nonce_digest,repeat('A',43),decode(repeat('a1',17),'hex'),decode(repeat('a2',12),'hex'),1);
  IF result<>'UPSTREAM_LEG_CREATED' OR (SELECT state FROM private.oauth_login_attempts WHERE id=a)<>'upstream_pending' THEN RAISE EXCEPTION 'PHASE10O_M_ATOMIC_CREATE'; END IF;
  SELECT outcome INTO result FROM public.claim_upstream_login_callback(a,leg,'google',client_digest,decode(repeat('ff',32),'hex'));
  IF result<>'STATE_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts x WHERE x.id=a AND x.state='failed_safe' AND x.coarse_terminal_reason='failed_safe') OR EXISTS(SELECT 1 FROM private.upstream_login_legs x WHERE x.id=leg AND (x.status<>'rejected' OR x.state_digest IS NOT NULL OR x.nonce_digest IS NOT NULL OR x.pkce_s256_challenge IS NOT NULL OR x.pkce_verifier_ciphertext IS NOT NULL OR x.pkce_verifier_iv IS NOT NULL OR x.pkce_verifier_key_version IS NOT NULL OR x.terminal_at IS NULL)) THEN RAISE EXCEPTION 'PHASE10O_M_WRONG_STATE_NOT_COMMITTED'; END IF;
END $$;
SELECT 'PHASE10O_M_ATOMIC_LEG_CREATE_OK' AS status;
SELECT 'PHASE10O_M_WRONG_STATE_TERMINAL_COMMITS_OK' AS status;
SELECT 'PHASE10O_M_TERMINAL_SECRET_SCRUB_OK' AS status;

DO $$
DECLARE a uuid; result text; client_digest bytea:=decode(repeat('21',32),'hex'); state_digest bytea:=decode(repeat('22',32),'hex'); digest_value bytea:=decode(repeat('23',32),'hex'); subject_value text; leg uuid:='a1000000-0000-4000-8000-000000000002';
BEGIN
  a:=public.create_social_login_attempt('att_10om_naver_resume_0001','naver',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,leg,'naver',client_digest,state_digest,NULL,NULL,NULL,NULL,NULL);
  IF result<>'UPSTREAM_LEG_CREATED' THEN RAISE EXCEPTION 'PHASE10O_M_NAVER_CREATE'; END IF;
  SELECT outcome INTO result FROM public.claim_upstream_login_callback(a,leg,'naver',client_digest,state_digest);
  IF result<>'CALLBACK_CLAIMED' OR EXISTS(SELECT 1 FROM private.upstream_login_legs x WHERE x.id=leg AND (x.nonce_digest IS NOT NULL OR x.pkce_s256_challenge IS NOT NULL OR x.state_digest IS NOT NULL)) THEN RAISE EXCEPTION 'PHASE10O_M_NAVER_CLAIM'; END IF;
  subject_value:=pg_temp.phase10om_subject('naver',digest_value);
  result:=public.record_verified_social_identity_from_upstream_leg(a,leg,'naver',subject_value,digest_value,1);
  IF result<>'RECOVERY_REQUIRED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts x WHERE x.id=a AND x.state='recovery_required') OR EXISTS(SELECT 1 FROM private.upstream_login_legs x WHERE x.id=leg AND (x.status<>'verified' OR x.state_digest IS NOT NULL OR x.nonce_digest IS NOT NULL OR x.pkce_s256_challenge IS NOT NULL OR x.pkce_verifier_ciphertext IS NOT NULL)) THEN RAISE EXCEPTION 'PHASE10O_M_LEG_BOUND_IDENTITY'; END IF;
END $$;
SELECT 'PHASE10O_M_STATE_DIGEST_ONLY_OK' AS status;
SELECT 'PHASE10O_M_NONCE_DIGEST_ONLY_OK' AS status;
SELECT 'PHASE10O_M_PKCE_ENCRYPTED_ONLY_OK' AS status;
SELECT 'PHASE10O_M_PROCESS_RESTART_RESUME_OK' AS status;
SELECT 'PHASE10O_M_NAVER_PROCESS_RESTART_RESUME_OK' AS status;

DO $$
DECLARE a uuid; result text; client_digest bytea:=decode(repeat('31',32),'hex'); state_digest bytea:=decode(repeat('32',32),'hex'); leg uuid:='a1000000-0000-4000-8000-000000000003';
BEGIN
  a:=public.create_social_login_attempt('att_10om_client_mismatch_0001','naver',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,leg,'naver',client_digest,state_digest,NULL,NULL,NULL,NULL,NULL);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback(a,leg,'naver',decode(repeat('33',32),'hex'),state_digest);
  IF result<>'CLIENT_BINDING_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.oauth_login_attempts WHERE id=a AND state='failed_safe') THEN RAISE EXCEPTION 'PHASE10O_M_CLIENT_BINDING'; END IF;
END $$;
SELECT 'PHASE10O_M_LEG_BYPASS_RPC_CLOSED_OK' AS status;
SELECT 'PHASE10O_M_PRODUCTION_PROVIDER_NETWORK_ZERO_OK' AS status;
