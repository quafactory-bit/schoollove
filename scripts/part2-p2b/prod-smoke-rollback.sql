-- Part 2 P2b production smoke — NEVER COMMITS.
-- Runs one complete brand-new Google sign-up through the real deployed functions
-- (attempt → downstream tx → upstream leg → recovery-optional decision → broker
-- code → token exchange → Auth principal → bind → activate) with a synthetic
-- subject, then ALWAYS raises an exception so the whole transaction rolls back.
-- The result is the text of that final exception: "P2B_SMOKE_RESULT ...".
-- Expected: decision=ACCOUNT_DECIDED_RECOVERY_DEFERRED issue=AUTHORIZATION_CODE_CREATED
--           consume=AUTHORIZATION_CODE_CONSUMED bind=AUTH_PRINCIPAL_BOUND
--           activate=SOCIAL_ACCOUNT_ACTIVATED recovery_rows=0 recovery_absent=true
DO $p2b_smoke$
DECLARE
  d bytea := extensions.digest('p2b-prod-smoke-'||gen_random_uuid()::text,'sha256');
  s text;
  a uuid; t uuid := gen_random_uuid(); l uuid := gen_random_uuid(); u uuid := gen_random_uuid();
  handle bytea := extensions.gen_random_bytes(32); st bytea := extensions.gen_random_bytes(32); bind_digest bytea := extensions.gen_random_bytes(32);
  code_digest bytea := extensions.gen_random_bytes(32);
  decision text; issued text; consumed text; bound text; activated text;
  recovery_rows bigint; delivery_rows bigint; absent boolean; acct_status text;
BEGIN
  s := 'slb:v1:k01:google:'||translate(rtrim(encode(d,'base64'),'='),'+/','-_');
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT count(*) INTO recovery_rows FROM private.recovery_email_verifications;
  SELECT count(*) INTO delivery_rows FROM private.recovery_delivery_attempts;

  a := public.create_social_login_attempt('att_p2bsmoke_'||replace(gen_random_uuid()::text,'-',''),'google',clock_timestamp()+interval '10 minutes');
  PERFORM public.create_downstream_authorization_transaction(t,a,handle,'p2b-smoke-client','https://smoke.invalid/auth/v1/callback','code','openid',repeat('A',43),'S256',NULL,'p2b-smoke',clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(handle);
  PERFORM public.create_upstream_login_leg(a,l,'google',st,bind_digest,extensions.gen_random_bytes(32),repeat('B',43),extensions.gen_random_bytes(17),extensions.gen_random_bytes(12),1);
  PERFORM public.bind_downstream_authorization_transaction_upstream_leg(t,l);
  PERFORM public.claim_upstream_login_callback_by_state('google',st,bind_digest);

  decision := public.record_verified_google_identity_recovery_optional(a,l,'google',s,d,1);
  SELECT x.outcome INTO issued FROM public.issue_transaction_bound_broker_authorization_code(t,gen_random_uuid(),code_digest,floor(extract(epoch FROM clock_timestamp()))::bigint-1,NULL,NULL,NULL,NULL,NULL) x;
  SELECT x.outcome INTO consumed FROM public.consume_broker_authorization_code(code_digest,'p2b-smoke-client','https://smoke.invalid/auth/v1/callback',repeat('A',43)) x;

  -- What Supabase Auth does for the first Custom OIDC token of a subject.
  INSERT INTO auth.users(id) VALUES(u);
  INSERT INTO auth.identities(id,user_id,provider_id,provider,identity_data)
    VALUES(gen_random_uuid(),u,s,'custom:schoollove-google',jsonb_build_object('sub',s));
  bound := public.bind_social_auth_principal_from_attempt_recovery_optional(a,u);
  activated := public.activate_social_account_from_attempt_recovery_optional(a);

  SELECT status, private.p2b_recovery_absent(acc) INTO acct_status, absent
    FROM private.private_accounts acc WHERE acc.primary_broker_subject=s;
  SELECT count(*)-recovery_rows INTO recovery_rows FROM private.recovery_email_verifications;
  SELECT count(*)-delivery_rows INTO delivery_rows FROM private.recovery_delivery_attempts;

  RAISE EXCEPTION 'P2B_SMOKE_RESULT decision=% issue=% consume=% bind=% activate=% account=% recovery_absent=% new_recovery_rows=% new_delivery_rows=% (rolled back)',
    decision, issued, consumed, bound, activated, acct_status, absent, recovery_rows, delivery_rows;
END $p2b_smoke$;
