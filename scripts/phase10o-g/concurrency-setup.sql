-- Fresh, race-scoped fixtures only.  No lifecycle row is reused here.
SELECT set_config('request.jwt.claim.role','service_role',false);

CREATE OR REPLACE FUNCTION pg_temp.phase10og_seed_attempt(
  safe_id text, provider_name text, subject_value text, digest_byte text,
  hmac_byte text, otp_byte text
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE attempt_id uuid;
BEGIN
  attempt_id:=public.create_social_login_attempt(safe_id,provider_name,clock_timestamp()+interval '5 minutes');
  IF public.record_verified_social_identity(attempt_id,provider_name,subject_value,decode(repeat(digest_byte,32),'hex'),1)<>'RECOVERY_REQUIRED' THEN
    RAISE EXCEPTION 'PHASE10O_G_RACE_FIXTURE_IDENTITY';
  END IF;
  PERFORM public.create_login_attempt_recovery_verification(
    attempt_id,decode(repeat(hmac_byte,32),'hex'),1,decode(repeat('ab',17),'hex'),
    decode(repeat('cd',12),'hex'),1,decode(repeat(otp_byte,32),'hex'),1
  );
  RETURN attempt_id;
END $$;

-- Race A: distinct broker identities, one recovery HMAC.
SELECT pg_temp.phase10og_seed_attempt('att_racea11111111111','google','slb:v1:k01:google:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','11','a1','a2');
SELECT pg_temp.phase10og_seed_attempt('att_racea22222222222','naver','slb:v1:k01:naver:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB','12','a1','a3');

-- Race C: one exact fresh pending challenge shared by two independent consumers.
SELECT pg_temp.phase10og_seed_attempt('att_racec11111111111','kakao','slb:v1:k01:kakao:JJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJ','13','c1','c2');

-- Race D is intentionally independent from Race A, including its recovery namespace.
SELECT pg_temp.phase10og_seed_attempt('att_raced11111111111','google','slb:v1:k01:google:KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK','14','d1','d2');
SELECT pg_temp.phase10og_seed_attempt('att_raced22222222222','naver','slb:v1:k01:naver:LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL','15','d1','d3');

DO $$
DECLARE race_name text; attempt_count integer; challenge_count integer;
BEGIN
  FOREACH race_name IN ARRAY ARRAY['racea','racec','raced'] LOOP
    SELECT count(*) INTO attempt_count FROM private.oauth_login_attempts WHERE safe_attempt_id LIKE 'att_'||race_name||'%';
    SELECT count(*) INTO challenge_count FROM private.recovery_email_verifications v JOIN private.oauth_login_attempts a ON a.id=v.login_attempt_id WHERE a.safe_attempt_id LIKE 'att_'||race_name||'%' AND v.status='pending' AND v.failed_attempts=0 AND v.consumed_at IS NULL AND v.account_id IS NULL;
    IF attempt_count<>(CASE WHEN race_name='racec' THEN 1 ELSE 2 END) OR challenge_count<>attempt_count THEN
      RAISE EXCEPTION 'PHASE10O_G_%_FIXTURE_INVALID', upper(race_name);
    END IF;
  END LOOP;
END $$;
