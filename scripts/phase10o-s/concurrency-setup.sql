SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE OR REPLACE FUNCTION pg_temp.phase10os_race_tx(safe_id text, tx uuid, digest_value bytea, expiry timestamptz DEFAULT clock_timestamp()+interval '4 minutes')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; outcome_value text;
BEGIN
  a:=public.create_social_login_attempt(safe_id,'naver',clock_timestamp()+interval '5 minutes');
  SELECT outcome INTO outcome_value FROM public.create_downstream_authorization_transaction(tx,a,digest_value,'slb-supabase-naver','https://consumer.invalid/callback','code','openid',repeat('A',43),'S256','n','s',expiry);
  IF outcome_value<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10O_S_RACE_SETUP'; END IF;
  RETURN a;
END $$;
SELECT pg_temp.phase10os_race_tx('att_10os_race_double','52000000-0000-4000-8000-000000000001',decode(repeat('21',32),'hex'));
SELECT pg_temp.phase10os_race_tx('att_10os_race_expiry','52000000-0000-4000-8000-000000000002',decode(repeat('22',32),'hex'),clock_timestamp()+interval '1 second');
SELECT pg_temp.phase10os_race_tx('att_10os_race_callback','52000000-0000-4000-8000-000000000003',decode(repeat('23',32),'hex'),clock_timestamp()+interval '1 second');
SELECT 'PHASE10O_S_RACE_SETUP_OK' AS status;
