SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid;
BEGIN
  a:=public.create_social_login_attempt('att_10oo_race_handle_01','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_downstream_authorization_transaction('d1000000-0000-4000-8000-000000000001',a,decode(repeat('91',32),'hex'),'slb-supabase-naver','https://example.invalid/callback','code','openid',repeat('A',43),'S256',NULL,NULL,clock_timestamp()+interval '5 minutes');
  b:=public.create_social_login_attempt('att_10oo_race_bind_0001','naver',clock_timestamp()+interval '9 minutes');
  c:=public.create_social_login_attempt('att_10oo_race_bind_0002','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_downstream_authorization_transaction('d1000000-0000-4000-8000-000000000002',b,decode(repeat('92',32),'hex'),'slb-supabase-naver','https://example.invalid/callback','code','openid',repeat('A',43),'S256',NULL,NULL,clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('92',32),'hex'));
  PERFORM public.create_upstream_login_leg(b,'d1000000-0000-4000-8000-000000000003','naver',decode(repeat('93',32),'hex'),decode(repeat('94',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  PERFORM public.create_upstream_login_leg(c,'d1000000-0000-4000-8000-000000000004','naver',decode(repeat('95',32),'hex'),decode(repeat('96',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  d:=public.create_social_login_attempt('att_10oo_race_legx_0001','naver',clock_timestamp()+interval '9 minutes');
  e:=public.create_social_login_attempt('att_10oo_race_legx_0002','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_downstream_authorization_transaction('d1000000-0000-4000-8000-000000000005',d,decode(repeat('97',32),'hex'),'slb-supabase-naver','https://example.invalid/callback','code','openid',repeat('A',43),'S256',NULL,NULL,clock_timestamp()+interval '5 minutes');
  PERFORM public.create_downstream_authorization_transaction('d1000000-0000-4000-8000-000000000006',e,decode(repeat('98',32),'hex'),'slb-supabase-naver','https://example.invalid/callback','code','openid',repeat('A',43),'S256',NULL,NULL,clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('97',32),'hex')); PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('98',32),'hex'));
  PERFORM public.create_upstream_login_leg(d,'d1000000-0000-4000-8000-000000000007','naver',decode(repeat('99',32),'hex'),decode(repeat('9a',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  f:=public.create_social_login_attempt('att_10oo_race_exp_0001','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_downstream_authorization_transaction('d1000000-0000-4000-8000-000000000008',f,decode(repeat('95',32),'hex'),'slb-supabase-naver','https://example.invalid/callback','code','openid',repeat('A',43),'S256',NULL,NULL,clock_timestamp()+interval '5 minutes');
  UPDATE private.downstream_authorization_transactions SET created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id='d1000000-0000-4000-8000-000000000008';
  g:=public.create_social_login_attempt('att_10oo_race_valid0001','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_downstream_authorization_transaction('d1000000-0000-4000-8000-000000000009',g,decode(repeat('9b',32),'hex'),'slb-supabase-naver','https://example.invalid/callback','code','openid',repeat('A',43),'S256',NULL,NULL,clock_timestamp()+interval '5 minutes');
  PERFORM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('9b',32),'hex'));
  PERFORM public.create_upstream_login_leg(g,'d1000000-0000-4000-8000-000000000010','naver',decode(repeat('9c',32),'hex'),decode(repeat('9d',32),'hex'),NULL,NULL,NULL,NULL,NULL);
END $$;
