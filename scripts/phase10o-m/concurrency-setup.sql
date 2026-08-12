SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE OR REPLACE FUNCTION pg_temp.phase10om_subject(provider_name text, digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_') $$;
DO $$
DECLARE a uuid; result text;
BEGIN
  a:=public.create_social_login_attempt('att_10om_concurrent_claim_0001','google',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,'a1000000-0000-4000-8000-000000000101','google',decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),decode(repeat('43',32),'hex'),repeat('A',43),decode(repeat('44',17),'hex'),decode(repeat('45',12),'hex'),1);
  IF result<>'UPSTREAM_LEG_CREATED' THEN RAISE EXCEPTION 'PHASE10O_M_CONCURRENCY_SETUP'; END IF;
END $$;

DO $$
DECLARE a uuid; result text; digest_value bytea:=decode(repeat('51',32),'hex'); subject_value text;
BEGIN
  a:=public.create_social_login_attempt('att_10om_wrong_correct_0001','naver',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,'a1000000-0000-4000-8000-000000000102','naver',decode(repeat('52',32),'hex'),decode(repeat('53',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  IF result<>'UPSTREAM_LEG_CREATED' THEN RAISE EXCEPTION 'PHASE10O_M_RACE_B_SETUP'; END IF;
  a:=public.create_social_login_attempt('att_10om_identity_race_0001','naver',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,'a1000000-0000-4000-8000-000000000103','naver',decode(repeat('54',32),'hex'),decode(repeat('55',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback(a,'a1000000-0000-4000-8000-000000000103','naver',decode(repeat('54',32),'hex'),decode(repeat('55',32),'hex'));
  IF result<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'PHASE10O_M_RACE_C_SETUP'; END IF;
  a:=public.create_social_login_attempt('att_10om_fail_verify_0001','naver',clock_timestamp()+interval '10 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,'a1000000-0000-4000-8000-000000000104','naver',decode(repeat('56',32),'hex'),decode(repeat('57',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  SELECT outcome INTO result FROM public.claim_upstream_login_callback(a,'a1000000-0000-4000-8000-000000000104','naver',decode(repeat('56',32),'hex'),decode(repeat('57',32),'hex'));
  IF result<>'CALLBACK_CLAIMED' THEN RAISE EXCEPTION 'PHASE10O_M_RACE_D_SETUP'; END IF;
END $$;
