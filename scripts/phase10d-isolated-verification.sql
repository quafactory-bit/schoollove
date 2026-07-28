\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.phase10d_assert(condition boolean, message text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'PHASE10D_ASSERT: %', message; END IF;
END;
$$;

DO $$
DECLARE
  user_a constant uuid := 'daaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  user_b constant uuid := 'dbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  account_a uuid; account_b uuid; verification_a uuid; request_a uuid; request_b uuid; placement_a uuid;
  today_kst date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  code_hash constant text := repeat('a',64);
  session_hash constant text := repeat('b',64);
BEGIN
  INSERT INTO auth.users(id,email) VALUES (user_a,'promo_a@example.invalid'),(user_b,'promo_b@example.invalid');
  INSERT INTO public.adult_eligibility_records(user_id,adult_eligible,verification_method,policy_version)
    VALUES(user_a,true,'self_attestation','phase10b-2026-07-28'),(user_b,true,'self_attestation','phase10b-2026-07-28');
  INSERT INTO public.consent_records(user_id,consent_type,consented,policy_version)
    SELECT u, c, true, 'phase10b-2026-07-28'
    FROM unnest(ARRAY[user_a,user_b]) u
    CROSS JOIN unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) c;
  INSERT INTO public.private_profiles(owner_user_id,display_name) VALUES(user_a,'PROMO_A'),(user_b,'PROMO_B');

  account_a := public.create_promotion_account(user_a,'personal','https://www.instagram.com/promo_a','PROMO A',NULL,NULL,NULL,NULL);
  PERFORM public.phase10d_assert(account_a IS NOT NULL,'adult owner creates personal promotion account');
  PERFORM public.phase10d_assert(public.create_promotion_account(user_a,'personal','https://127.0.0.1/admin','BAD',NULL,NULL,NULL,NULL) IS NULL,'unsafe URL blocked');
  verification_a := public.issue_promotion_verification(user_a,account_a,code_hash,now()+interval '20 minutes');
  PERFORM public.phase10d_assert(verification_a IS NOT NULL,'hashed verification issued');
  PERFORM public.phase10d_assert(NOT public.admin_verify_promotion_account(verification_a,repeat('c',64),'TEST_ADMIN'),'wrong verification code rejected');
  PERFORM public.phase10d_assert(public.admin_verify_promotion_account(verification_a,code_hash,'TEST_ADMIN'),'manual ownership verification');
  PERFORM public.phase10d_assert((SELECT status='verified' FROM public.promotion_accounts WHERE id=account_a),'account verified');

  request_a := public.submit_promotion_request(user_a,account_a,'Safe introduction','Adult-owned account story','https://images.unsplash.com/photo-a','https://www.instagram.com/promo_a','homepage_today',today_kst,NULL,NULL,false);
  PERFORM public.phase10d_assert(request_a IS NOT NULL,'verified account submits request');
  PERFORM public.phase10d_assert(public.submit_promotion_request(user_a,account_a,'Find a specific person','Contact 010-1234-5678','https://images.unsplash.com/photo-a','https://www.instagram.com/promo_a','homepage_today',today_kst,NULL,NULL,false) IS NULL,'unsafe people/contact copy blocked');
  PERFORM public.phase10d_assert(public.admin_schedule_promotion(request_a,now()-interval '1 minute',now()+interval '1 day','TEST_ADMIN') IS NULL,'schedule before review and payment blocked');
  PERFORM public.phase10d_assert(public.admin_review_promotion_request(request_a,'changes_requested','creative','revise','TEST_ADMIN',NULL),'changes requested');
  PERFORM public.phase10d_assert(public.revise_own_promotion_request(user_a,request_a,'Revised safe title','Revised adult-owned account story','https://images.unsplash.com/photo-a2','https://www.instagram.com/promo_a'),'applicant revision allowed only after request');
  PERFORM public.phase10d_assert(public.admin_review_promotion_request(request_a,'approved','approved',NULL,'TEST_ADMIN',10000),'manual review and price approval');
  PERFORM public.phase10d_assert(public.admin_schedule_promotion(request_a,now()-interval '1 minute',now()+interval '1 day','TEST_ADMIN') IS NULL,'schedule before payment confirmation blocked');
  PERFORM public.phase10d_assert(public.admin_confirm_promotion_payment(request_a,'TEST_PAYMENT_REFERENCE','TEST_ADMIN'),'manual payment confirmation');
  placement_a := public.admin_schedule_promotion(request_a,now()-interval '1 minute',now()+interval '1 day','TEST_ADMIN');
  PERFORM public.phase10d_assert(placement_a IS NOT NULL,'paid approved request scheduled');

  account_b := public.create_promotion_account(user_b,'personal','https://www.instagram.com/promo_b','PROMO B',NULL,NULL,NULL,NULL);
  UPDATE public.promotion_accounts SET status='verified',verified_at=now() WHERE id=account_b;
  request_b := public.submit_promotion_request(user_b,account_b,'Second safe title','Second adult-owned account story','https://images.unsplash.com/photo-b','https://www.instagram.com/promo_b','homepage_today',today_kst,NULL,NULL,false);
  PERFORM public.phase10d_assert(public.admin_review_promotion_request(request_b,'approved','approved',NULL,'TEST_ADMIN',10000),'second request approved');
  PERFORM public.phase10d_assert(public.admin_confirm_promotion_payment(request_b,'TEST_PAYMENT_REFERENCE_B','TEST_ADMIN'),'second payment confirmed');
  PERFORM public.phase10d_assert(public.admin_schedule_promotion(request_b,now()-interval '1 minute',now()+interval '1 day','TEST_ADMIN') IS NULL,'duplicate KST slot blocked');

  PERFORM public.phase10d_assert(public.admin_set_promotion_delivery_status(placement_a,'activate','TEST_ADMIN'),'scheduled placement activated');
  PERFORM public.phase10d_assert(NOT public.record_promotion_impression(placement_a,session_hash,today_kst,true,false),'bot impression excluded');
  PERFORM public.phase10d_assert(public.record_promotion_impression(placement_a,session_hash,today_kst,false,false),'safe impression recorded');
  PERFORM public.phase10d_assert(public.record_promotion_impression(placement_a,session_hash,today_kst,false,false),'duplicate impression is idempotent');
  PERFORM public.phase10d_assert((SELECT count(*)=1 FROM public.promotion_impressions WHERE placement_id=placement_a),'unique daily impression');
  PERFORM public.phase10d_assert(public.record_promotion_click(placement_a,session_hash,today_kst,false,false)='https://www.instagram.com/promo_a','safe click resolves approved URL');
  PERFORM public.phase10d_assert((SELECT count(*)=1 FROM public.promotion_clicks WHERE placement_id=placement_a),'unique daily click');
  PERFORM public.phase10d_assert(public.report_public_promotion(user_b,placement_a,'minor_risk'),'urgent report accepted');
  PERFORM public.phase10d_assert((SELECT status='paused' FROM public.promotion_placements WHERE id=placement_a),'urgent report pauses public delivery');
  PERFORM public.phase10d_assert(NOT public.admin_set_promotion_delivery_status(placement_a,'activate','TEST_ADMIN'),'paused placement cannot bypass resume state');

  DELETE FROM auth.users WHERE id IN (user_a,user_b);
  PERFORM public.phase10d_assert((SELECT count(*)=0 FROM public.promotion_accounts),'owner deletion cascades private promotion rows');
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['promotion_accounts','promotion_account_verifications','promotion_requests','promotion_assets','promotion_reviews','promotion_orders','promotion_placements','promotion_impressions','promotion_clicks','promotion_reports','promotion_audit_logs','editorial_features']
  LOOP
    PERFORM public.phase10d_assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('public.'||table_name)::regclass),table_name||' RLS/FORCE RLS');
    PERFORM public.phase10d_assert(NOT has_table_privilege('anon','public.'||table_name,'SELECT'),'anon table access blocked: '||table_name);
    PERFORM public.phase10d_assert(NOT has_table_privilege('authenticated','public.'||table_name,'INSERT'),'authenticated direct insert blocked: '||table_name);
  END LOOP;
END;
$$;

SELECT 'PHASE10D_ISOLATED_VERIFICATION_OK' AS result;
