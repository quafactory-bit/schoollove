-- Fresh coherent identities for the 10O-I independent-connection races.
SELECT set_config('request.jwt.claim.role','service_role',false);
CREATE OR REPLACE FUNCTION pg_temp.phase10oi_race_subject(provider_name text, digest_value bytea)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'slb:v1:k01:'||provider_name||':'||translate(rtrim(encode(digest_value,'base64'),'='),'+/','-_') $$;
CREATE OR REPLACE FUNCTION pg_temp.phase10oi_race_attempt(safe_id text, digest_hex text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; d bytea:=decode(digest_hex,'hex'); s text;
BEGIN
  s:=pg_temp.phase10oi_race_subject('google',d);
  a:=public.create_social_login_attempt(safe_id,'google',clock_timestamp()+interval '10 minutes');
  IF public.record_verified_social_identity(a,'google',s,d,1)<>'RECOVERY_REQUIRED' THEN RAISE EXCEPTION 'PHASE10O_I_RACE_ATTEMPT_SETUP'; END IF;
  RETURN a;
END $$;

-- Same-attempt race target: exactly one reservation may pass the locked budget.
SELECT pg_temp.phase10oi_race_attempt('att_10oi_race_attempt_01',repeat('91',32));

-- Four prior reservations consume four of the rolling address budget.  The two
-- independent contenders below race for the fifth and sixth slots.
DO $$
DECLARE a uuid; i integer; h bytea:=decode(repeat('92',32),'hex');
BEGIN
  FOR i IN 1..4 LOOP
    a:=pg_temp.phase10oi_race_attempt('att_10oi_race_email_seed_'||i, lpad(to_hex(146+i),2,'0')||repeat('93',31));
    PERFORM 1 FROM public.create_and_reserve_login_attempt_recovery_delivery(
      a, ('93000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      ('94000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      h,1,decode(repeat('94',17),'hex'),decode(repeat('95',12),'hex'),1,decode(repeat('96',32),'hex'),1
    );
  END LOOP;
END $$;
SELECT pg_temp.phase10oi_race_attempt('att_10oi_race_email_05',repeat('97',32));
SELECT pg_temp.phase10oi_race_attempt('att_10oi_race_email_06',repeat('98',32));
