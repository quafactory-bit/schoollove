\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.phase10e_assert(condition boolean, message text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'PHASE10E_ASSERT: %', message; END IF;
END;
$$;

DO $$
DECLARE
  user_a constant uuid := 'eaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user_b constant uuid := 'ebbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  account_a uuid; account_b uuid; request_a uuid; request_b uuid; product_id uuid;
  quote_a uuid; quote_b uuid; order_a uuid; order_b uuid; payment_a1 uuid; payment_a2 uuid; payment_b uuid;
  cancel_b uuid; refund_b uuid; placement_a uuid; report_a uuid;
  today_kst date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  failed boolean;
BEGIN
  INSERT INTO auth.users(id,email) VALUES(user_a,'phase10e_a@example.invalid'),(user_b,'phase10e_b@example.invalid');
  INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
    VALUES(user_a,true,'self_attestation','phase10b-2026-07-28'),(user_b,true,'self_attestation','phase10b-2026-07-28');
  INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
    SELECT u,c,true,'phase10b-2026-07-28' FROM unnest(ARRAY[user_a,user_b]) u
    CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) c;
  INSERT INTO public.private_profiles(owner_user_id,display_name) VALUES(user_a,'PHASE10E_A'),(user_b,'PHASE10E_B');

  account_a:=public.create_promotion_account(user_a,'personal','https://www.instagram.com/phase10e_a','PHASE 10E A',NULL,NULL,NULL,NULL);
  account_b:=public.create_promotion_account(user_b,'personal','https://www.instagram.com/phase10e_b','PHASE 10E B',NULL,NULL,NULL,NULL);
  UPDATE public.promotion_accounts SET status='verified',verified_at=now() WHERE id IN(account_a,account_b);
  request_a:=public.submit_promotion_request(user_a,account_a,'Aggregate campaign A','Adult-owned safe campaign A','https://images.unsplash.com/photo-a','https://www.instagram.com/phase10e_a','homepage_today',today_kst,NULL,NULL,false);
  request_b:=public.submit_promotion_request(user_b,account_b,'Aggregate campaign B','Adult-owned safe campaign B','https://images.unsplash.com/photo-b','https://www.instagram.com/phase10e_b','homepage_today',today_kst,NULL,NULL,false);

  product_id:=public.admin_upsert_promotion_product(NULL,'home_7d','Home seven days','Safe homepage placement for seven days','homepage_today',7,1080,1080,80,300,50000,'included',false,false,'active','2026.07.1','TEST_ADMIN');
  PERFORM public.phase10e_assert(product_id IS NOT NULL,'administrator creates product catalog row');
  quote_a:=public.admin_approve_and_quote_promotion_request(request_a,product_id,now()+interval '7 days',NULL,'TEST_ADMIN');
  PERFORM public.phase10e_assert((SELECT total_krw=50000 AND subtotal_krw+vat_krw=total_krw AND product_snapshot->>'product_code'='home_7d' FROM public.promotion_quotes WHERE id=quote_a),'quote stores catalog price snapshot');

  failed:=false;
  BEGIN PERFORM public.respond_own_promotion_quote(user_b,quote_a,'accept',repeat('1',64)); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM public.phase10e_assert(failed,'other advertiser cannot accept quote');
  order_a:=public.respond_own_promotion_quote(user_a,quote_a,'accept',repeat('2',64));
  PERFORM public.phase10e_assert(order_a IS NOT NULL AND (SELECT total_krw=50000 FROM public.promotion_commercial_orders WHERE id=order_a),'quote acceptance creates snapshot order');
  failed:=false;
  BEGIN PERFORM public.respond_own_promotion_quote(user_a,quote_a,'accept',repeat('3',64)); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM public.phase10e_assert(failed,'duplicate order blocked');

  payment_a1:=public.submit_manual_payment_notice(user_a,order_a,20000,repeat('4',64));
  PERFORM public.phase10e_assert(public.admin_confirm_manual_payment(order_a,payment_a1,20000,'partial',repeat('5',64),'TEST_ADMIN')='partial','partial payment recorded');
  PERFORM public.phase10e_assert((SELECT status='payment_review' AND received_amount_krw=20000 FROM public.promotion_commercial_orders WHERE id=order_a),'partial payment stays in review');
  payment_a2:=public.submit_manual_payment_notice(user_a,order_a,30000,repeat('6',64));
  PERFORM public.phase10e_assert(public.admin_confirm_manual_payment(order_a,payment_a2,30000,'exact',repeat('7',64),'TEST_ADMIN')='exact','cumulative exact payment recorded');
  PERFORM public.phase10e_assert((SELECT status='payment_confirmed' AND received_amount_krw=50000 FROM public.promotion_commercial_orders WHERE id=order_a),'full payment unlocks scheduling');

  placement_a:=public.admin_schedule_promotion_order(order_a,now()-interval '1 minute',now()-interval '1 minute'+interval '7 days','TEST_ADMIN');
  PERFORM public.phase10e_assert(placement_a IS NOT NULL,'paid order reserves KST placement');
  PERFORM public.phase10e_assert(public.admin_set_promotion_order_delivery(order_a,'activate','TEST_ADMIN'),'scheduled order activates');
  PERFORM public.phase10e_assert(public.record_promotion_impression(placement_a,repeat('8',64),today_kst,false,false),'aggregate impression recorded');
  PERFORM public.phase10e_assert(public.record_promotion_click(placement_a,repeat('8',64),today_kst,false,false)='https://www.instagram.com/phase10e_a','aggregate click recorded');
  report_a:=public.admin_generate_promotion_report(order_a,today_kst,today_kst,'TEST_ADMIN');
  PERFORM public.phase10e_assert((SELECT impressions=1 AND clicks=1 AND jsonb_array_length(daily_totals)=1 FROM public.promotion_performance_reports WHERE id=report_a),'privacy-safe aggregate report generated');
  PERFORM public.phase10e_assert(public.admin_set_promotion_order_delivery(order_a,'complete','TEST_ADMIN'),'delivery completes');

  quote_b:=public.admin_approve_and_quote_promotion_request(request_b,product_id,now()+interval '7 days',NULL,'TEST_ADMIN');
  order_b:=public.respond_own_promotion_quote(user_b,quote_b,'accept',repeat('9',64));
  payment_b:=public.submit_manual_payment_notice(user_b,order_b,50000,repeat('a',64));
  PERFORM public.phase10e_assert(public.admin_confirm_manual_payment(order_b,payment_b,50000,'exact',repeat('b',64),'TEST_ADMIN')='exact','second order payment confirmed');
  cancel_b:=public.request_promotion_cancellation(user_b,order_b,'changed_mind',repeat('c',64));
  refund_b:=public.admin_decide_promotion_cancellation(cancel_b,'approve',50000,'approved','TEST_ADMIN');
  PERFORM public.phase10e_assert((SELECT status='refund_pending' FROM public.promotion_commercial_orders WHERE id=order_b),'paid cancellation waits for external refund');
  PERFORM public.phase10e_assert(public.admin_confirm_promotion_refund(refund_b,'partial',20000,'external_partial','TEST_ADMIN'),'partial external refund confirmed');
  PERFORM public.phase10e_assert(public.admin_confirm_promotion_refund(refund_b,'completed',50000,'external_complete','TEST_ADMIN'),'external refund completion confirmed');
  PERFORM public.phase10e_assert((SELECT status='refunded' AND refunded_amount_krw=50000 FROM public.promotion_commercial_orders WHERE id=order_b),'refund lifecycle completed');

  PERFORM public.phase10e_assert((SELECT count(*)>=8 FROM public.promotion_order_status_history),'append-only order history populated');
  PERFORM public.phase10e_assert((SELECT count(*)>=10 FROM public.promotion_notification_outbox),'idempotent notification outbox populated');
  PERFORM public.phase10e_assert(NOT EXISTS(SELECT 1 FROM public.promotion_payment_confirmations WHERE idempotency_key_hash !~ '^[0-9a-f]{64}$'),'only hashed operation keys stored');

  DELETE FROM auth.users WHERE id IN(user_a,user_b);
  PERFORM public.phase10e_assert((SELECT count(*)=0 FROM public.promotion_quotes),'owner deletion cascades quote rows');
  PERFORM public.phase10e_assert((SELECT count(*)=0 FROM public.promotion_commercial_orders),'owner deletion cascades order rows');
  DELETE FROM public.promotion_products WHERE id=product_id;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['promotion_products','promotion_quotes','promotion_commercial_orders','promotion_order_status_history','promotion_payment_submissions','promotion_payment_confirmations','promotion_cancellation_requests','promotion_refunds','promotion_notification_outbox','promotion_performance_reports']
  LOOP
    PERFORM public.phase10e_assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('public.'||table_name)::regclass),table_name||' RLS/FORCE RLS');
    PERFORM public.phase10e_assert(NOT has_table_privilege('anon','public.'||table_name,'SELECT'),'anon read blocked: '||table_name);
    PERFORM public.phase10e_assert(NOT has_table_privilege('authenticated','public.'||table_name,'INSERT'),'authenticated direct mutation blocked: '||table_name);
    PERFORM public.phase10e_assert(has_table_privilege('service_role','public.'||table_name,'SELECT'),'service role access retained: '||table_name);
  END LOOP;
END;
$$;

SELECT 'PHASE10E_ISOLATED_VERIFICATION_OK' AS result;
