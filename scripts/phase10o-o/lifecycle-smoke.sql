SELECT set_config('request.jwt.claim.role','service_role',false);

DO $$
DECLARE a uuid; tx uuid:='c1000000-0000-4000-8000-000000000001'; h bytea:=decode(repeat('11',32),'hex'); result text; claimed uuid;
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relkind='r')<>9 THEN RAISE EXCEPTION 'PHASE10O_O_PRIVATE_TABLE_COUNT'; END IF;
  a:=public.create_social_login_attempt('att_10oo_validx_0001','naver',clock_timestamp()+interval '9 minutes');
  SELECT outcome INTO result FROM public.create_downstream_authorization_transaction(tx,a,h,'slb-supabase-naver','https://example.invalid/callback','code','openid',repeat('A',43),'S256','nonce','state',clock_timestamp()+interval '5 minutes');
  IF result<>'TRANSACTION_CREATED' THEN RAISE EXCEPTION 'PHASE10O_O_CREATE'; END IF;
  SELECT outcome,transaction_id INTO result,claimed FROM public.claim_downstream_authorization_transaction_by_handle(decode(repeat('ff',32),'hex'));
  IF result<>'CORRELATION_REJECTED' OR EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status<>'pending') THEN RAISE EXCEPTION 'PHASE10O_O_UNKNOWN_MUTATION'; END IF;
  SELECT outcome,transaction_id INTO result,claimed FROM public.claim_downstream_authorization_transaction_by_handle(h);
  IF result<>'TRANSACTION_CLAIMED' OR claimed<>tx OR EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND broker_handle_digest IS NOT NULL) THEN RAISE EXCEPTION 'PHASE10O_O_CLAIM'; END IF;
  SELECT outcome INTO result FROM public.claim_downstream_authorization_transaction_by_handle(h);
  IF result<>'CORRELATION_REJECTED' THEN RAISE EXCEPTION 'PHASE10O_O_REPLAY'; END IF;
END $$;
SELECT 'PHASE10O_O_TRANSACTION_LIFECYCLE_OK' AS status;
SELECT 'PHASE10O_O_UNKNOWN_HANDLE_NO_MUTATION_OK' AS status;
SELECT 'PHASE10O_O_REPLAY_REJECTED_OK' AS status;

DO $$
DECLARE a uuid; b uuid; tx uuid:='c1000000-0000-4000-8000-000000000002'; h bytea:=decode(repeat('21',32),'hex'); result text;
BEGIN
  a:=public.create_social_login_attempt('att_10oo_bind_ax_0001','naver',clock_timestamp()+interval '9 minutes');
  b:=public.create_social_login_attempt('att_10oo_bind_bx_0001','naver',clock_timestamp()+interval '9 minutes');
  PERFORM public.create_downstream_authorization_transaction(tx,a,h,'slb-supabase-naver','https://example.invalid/callback','code','openid',repeat('A',43),'S256',NULL,NULL,clock_timestamp()+interval '5 minutes');
  PERFORM public.create_upstream_login_leg(b,'c1000000-0000-4000-8000-000000000003','naver',decode(repeat('22',32),'hex'),decode(repeat('23',32),'hex'),NULL,NULL,NULL,NULL,NULL);
  PERFORM public.claim_downstream_authorization_transaction_by_handle(h);
  SELECT public.bind_downstream_authorization_transaction_upstream_leg(tx,'c1000000-0000-4000-8000-000000000003') INTO result;
  IF result<>'BINDING_REJECTED' OR NOT EXISTS(SELECT 1 FROM private.downstream_authorization_transactions WHERE id=tx AND status='claimed' AND upstream_login_leg_id IS NULL) THEN RAISE EXCEPTION 'PHASE10O_O_SUBSTITUTION'; END IF;
END $$;
SELECT 'PHASE10O_O_TRANSACTION_SUBSTITUTION_REJECTED_OK' AS status;
