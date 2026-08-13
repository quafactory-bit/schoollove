SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE a uuid; result text;
BEGIN
  a:=public.create_social_login_attempt('att_10on_concurrent_0001','naver',clock_timestamp()+interval '9 minutes');
  SELECT outcome INTO result FROM public.create_upstream_login_leg(a,'b1000000-0000-4000-8000-000000000101','naver',decode(repeat('71',32),'hex'),decode(repeat('72',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  IF result<>'UPSTREAM_LEG_CREATED' THEN RAISE EXCEPTION 'PHASE10O_N_CONCURRENCY_SETUP'; END IF;
END $$;
