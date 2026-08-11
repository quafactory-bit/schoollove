SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE OR REPLACE FUNCTION pg_temp.phase10oh_seed(safe_id text, provider_name text, digest_byte text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; d bytea:=decode(repeat(digest_byte,32),'hex'); s text;
BEGIN
  s:='slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(d,'base64'),'='),'+/','-_');
  a:=public.create_social_login_attempt(safe_id,provider_name,clock_timestamp()+interval '5 minutes');
  IF public.record_verified_social_identity(a,provider_name,s,d,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_H_CONCURRENCY_SEED'; END IF;
  RETURN a;
END $$;
SELECT pg_temp.phase10oh_seed('att_10ohreserveone0001','google','b1');
SELECT pg_temp.phase10oh_seed('att_10ohreservetwo0001','naver','b2');
SELECT pg_temp.phase10oh_seed('att_10ohsamechallenge01','kakao','b3');
SELECT pg_temp.phase10oh_seed('att_10ohhmacwinner0001','google','b4');
SELECT pg_temp.phase10oh_seed('att_10ohhmacloser00001','naver','b5');
