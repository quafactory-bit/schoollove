SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE
  attempt_id uuid;
  transaction_id uuid;
  leg_id uuid;
  fixture_seed text;
  outcome text;
  index_value integer;
BEGIN
  FOR index_value IN 1..2 LOOP
    transaction_id:=CASE index_value WHEN 1 THEN '63000000-0000-4000-8000-000000000001'::uuid ELSE '63000000-0000-4000-8000-000000000011'::uuid END;
    leg_id:=CASE index_value WHEN 1 THEN '63000000-0000-4000-8000-000000000002'::uuid ELSE '63000000-0000-4000-8000-000000000012'::uuid END;
    fixture_seed:='phase10p-expiry-race-'||index_value::text;
    attempt_id:=public.create_social_login_attempt('att_10p_expiry_race_00'||index_value::text,'google',clock_timestamp()+interval '10 minutes');
    SELECT x.outcome INTO outcome FROM public.create_downstream_authorization_transaction(
      transaction_id,attempt_id,extensions.digest(convert_to(fixture_seed||':handle','UTF8'),'sha256'),
      'slb-supabase-google','https://hukokfyphyrpfouazxhq.supabase.co/auth/v1/callback',
      'code','openid',repeat('R',43),'S256','nonce-'||fixture_seed,'state-'||fixture_seed,
      clock_timestamp()+interval '10 minutes'
    ) x;
    IF outcome<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_RACE_TX'; END IF;
    SELECT x.outcome INTO outcome FROM public.claim_downstream_authorization_transaction_by_handle(
      extensions.digest(convert_to(fixture_seed||':handle','UTF8'),'sha256')
    ) x;
    IF outcome<>'TRANSACTION_CLAIMED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_RACE_CLAIM'; END IF;
    PERFORM public.create_upstream_login_leg(
      attempt_id,leg_id,'google',
      extensions.digest(convert_to(fixture_seed||':binding','UTF8'),'sha256'),
      extensions.digest(convert_to(fixture_seed||':state','UTF8'),'sha256'),
      extensions.digest(convert_to(fixture_seed||':nonce','UTF8'),'sha256'),repeat('P',43),
      substring(extensions.digest(convert_to(fixture_seed||':ciphertext','UTF8'),'sha256') FROM 1 FOR 17),
      substring(extensions.digest(convert_to(fixture_seed||':cipher-nonce','UTF8'),'sha256') FROM 1 FOR 12),1
    );
    IF public.bind_downstream_authorization_transaction_upstream_leg(transaction_id,leg_id)<>'UPSTREAM_BOUND' THEN
      RAISE EXCEPTION 'PHASE10P_EXPIRY_RACE_BIND';
    END IF;
    SELECT x.outcome INTO outcome FROM public.claim_upstream_login_callback_by_state(
      'google',extensions.digest(convert_to(fixture_seed||':binding','UTF8'),'sha256'),
      extensions.digest(convert_to(fixture_seed||':state','UTF8'),'sha256')
    ) x;
    IF outcome<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'PHASE10P_EXPIRY_RACE_CALLBACK'; END IF;
  END LOOP;
END $$;

SELECT 'PHASE10P_STALE_EXPIRY_RACE_FIXTURES_OK' AS status;
