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
