-- Disposable-DB helpers for Part 2 P2b. No remote data; postgres superuser only.
CREATE SCHEMA p2b_test;

CREATE FUNCTION p2b_test.subject(n integer) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'slb:v1:k01:google:'||translate(rtrim(encode(extensions.digest('p2b-subject-'||n,'sha256'),'base64'),'='),'+/','-_')
$$;
CREATE FUNCTION p2b_test.digest(n integer) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT extensions.digest('p2b-subject-'||n,'sha256')
$$;

-- One fresh broker flow up to callback_claimed: attempt, downstream tx, upstream leg.
CREATE TABLE p2b_test.flows(name text PRIMARY KEY, attempt_id uuid, tx_id uuid, leg_id uuid, code_digest bytea);
CREATE FUNCTION p2b_test.flow(flow_name text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; t uuid:=gen_random_uuid(); l uuid:=gen_random_uuid();
  handle bytea:=extensions.gen_random_bytes(32); st bytea:=extensions.gen_random_bytes(32); bind bytea:=extensions.gen_random_bytes(32);
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  a:=public.create_social_login_attempt('att_p2b_'||replace(gen_random_uuid()::text,'-',''),'google',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(t,a,handle,'slb-supabase-google','https://example.invalid/auth/v1/callback','code','openid',repeat('A',43),'S256',NULL,'p2b-state',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(handle);
  PERFORM public.create_upstream_login_leg(a,l,'google',st,bind,extensions.gen_random_bytes(32),repeat('B',43),extensions.gen_random_bytes(17),extensions.gen_random_bytes(12),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(t,l);
  PERFORM public.claim_upstream_login_callback_by_state('google',st,bind);
  INSERT INTO p2b_test.flows VALUES(flow_name,a,t,l,extensions.gen_random_bytes(32));
  RETURN a;
END $$;

CREATE FUNCTION p2b_test.decide(flow_name text, n integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE f p2b_test.flows%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT * INTO STRICT f FROM p2b_test.flows WHERE name=flow_name;
  RETURN public.record_verified_google_identity_recovery_optional(f.attempt_id,f.leg_id,'google',p2b_test.subject(n),p2b_test.digest(n),1);
END $$;

-- Broker code issuance and Supabase-side token exchange.
CREATE FUNCTION p2b_test.issue_and_consume(flow_name text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE f p2b_test.flows%ROWTYPE; o text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT * INTO STRICT f FROM p2b_test.flows WHERE name=flow_name;
  SELECT x.outcome INTO o FROM public.issue_transaction_bound_broker_authorization_code(f.tx_id,gen_random_uuid(),f.code_digest,floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL) x;
  IF o<>'AUTHORIZATION_CODE_CREATED' THEN RETURN 'ISSUE:'||o; END IF;
  SELECT x.outcome INTO o FROM public.consume_broker_authorization_code(f.code_digest,'slb-supabase-google','https://example.invalid/auth/v1/callback',repeat('A',43)) x;
  RETURN o;
END $$;

-- What Supabase Auth does on the first Custom OIDC token for a subject.
CREATE FUNCTION p2b_test.supabase_user(n integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE u uuid; s text:=p2b_test.subject(n);
BEGIN
  SELECT user_id INTO u FROM auth.identities WHERE provider='custom:schoollove-google' AND provider_id=s;
  IF u IS NOT NULL THEN RETURN u; END IF;
  u:=gen_random_uuid();
  INSERT INTO auth.users(id,email) VALUES(u,NULL);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data) VALUES(gen_random_uuid(),u,s,'custom:schoollove-google',jsonb_build_object('sub',s));
  RETURN u;
END $$;

CREATE FUNCTION p2b_test.complete(flow_name text, n integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE f p2b_test.flows%ROWTYPE; b text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT * INTO STRICT f FROM p2b_test.flows WHERE name=flow_name;
  b:=public.bind_social_auth_principal_from_attempt_recovery_optional(f.attempt_id,p2b_test.supabase_user(n));
  RETURN b||'/'||public.activate_social_account_from_attempt_recovery_optional(f.attempt_id);
END $$;

CREATE FUNCTION p2b_test.account_of(n integer) RETURNS private.private_accounts LANGUAGE sql AS $$
  SELECT a FROM private.private_accounts a WHERE a.primary_broker_subject=p2b_test.subject(n)
$$;

-- Age a whole flow so it can no longer issue or redeem anything.
CREATE FUNCTION p2b_test.age(flow_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f p2b_test.flows%ROWTYPE;
BEGIN
  SELECT * INTO STRICT f FROM p2b_test.flows WHERE name=flow_name;
  UPDATE private.oauth_login_attempts SET created_at=created_at-interval '1 hour',expires_at=expires_at-interval '1 hour' WHERE id=f.attempt_id;
END $$;

CREATE FUNCTION p2b_test.launch(open boolean) RETURNS void LANGUAGE sql AS $$
  UPDATE public.public_account_launch_control SET
    state=CASE WHEN open THEN 'open' ELSE 'closed' END,
    account_registration_enabled=open,private_profile_enabled=open,school_membership_enabled=open,emergency_stopped_at=NULL
$$;
