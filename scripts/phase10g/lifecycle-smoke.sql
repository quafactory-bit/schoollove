\set ON_ERROR_STOP on
BEGIN;

-- Keep this smoke focused on payments. The legacy POSIX expression used by the
-- promotion text guard is not accepted by every PostgreSQL 17 test image.
CREATE OR REPLACE FUNCTION public.promotion_text_is_safe(input_text text, max_length integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT input_text IS NOT NULL AND char_length(btrim(input_text)) BETWEEN 1 AND max_length
$$;

INSERT INTO auth.users(id,email,created_at,updated_at)
VALUES('20000000-0000-4000-8000-000000000001','payment-owner@example.invalid',now(),now());
INSERT INTO public.beta_members(program_id,user_id,status,reviewed_at,reviewed_by,reason_code)
SELECT id,'20000000-0000-4000-8000-000000000001','active',now(),'test:admin','SYNTHETIC_APPROVAL'
FROM public.beta_programs WHERE program_key='limited_beta_2026';

INSERT INTO public.promotion_accounts(id,owner_user_id,account_type,instagram_url,display_name,status,verified_at)
VALUES('21000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','personal','https://instagram.com/synthetic_payment_owner','Synthetic Payment Owner','verified',now());
INSERT INTO public.promotion_requests(id,owner_user_id,account_id,title,body,landing_url,requested_placement,requested_date,rights_confirmed,adult_and_ownership_confirmed,status)
VALUES('22000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Synthetic promotion','Synthetic promotion body for isolated payment testing only.','https://example.invalid/landing','homepage_today',current_date,true,true,'payment_pending');
INSERT INTO public.promotion_products(id,product_code,name,description,placement_type,duration_days,image_width,image_height,title_limit,body_limit,base_price_krw,vat_display_mode,sale_status,price_policy_version)
VALUES('23000000-0000-4000-8000-000000000001','synthetic_payment','Synthetic product','Synthetic isolated payment product.','homepage_today',1,1080,1080,80,300,50000,'included','active','test-v1');
INSERT INTO public.promotion_quotes(id,request_id,owner_user_id,product_id,quote_number,status,subtotal_krw,vat_krw,total_krw,price_policy_version,product_snapshot,expires_at,responded_at,issued_by)
VALUES('24000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Q-20260729-ABCDEF123456','accepted',50000,0,50000,'test-v1','{"name":"Synthetic product"}',now()+interval '1 day',now(),'test:admin');
INSERT INTO public.promotion_commercial_orders(id,order_number,quote_id,request_id,owner_user_id,subtotal_krw,vat_krw,total_krw,payment_due_at,product_snapshot,price_policy_version)
VALUES('25000000-0000-4000-8000-000000000001','SL-20260729-ABCDEF123456','24000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',50000,0,50000,now()+interval '1 day','{"name":"Synthetic product"}','test-v1');

DO $$
DECLARE first_attempt public.payment_transactions%ROWTYPE; replay public.payment_transactions%ROWTYPE; webhook_id uuid; duplicate_id uuid; refund_one uuid; refund_two uuid;
BEGIN
  first_attempt:=public.create_payment_attempt('20000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','mock','slp_synthetic_123456',repeat('a',64));
  replay:=public.create_payment_attempt('20000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','mock','slp_synthetic_123456',repeat('a',64));
  IF replay.id<>first_attempt.id THEN RAISE EXCEPTION 'create was not idempotent'; END IF;
  BEGIN
    PERFORM public.confirm_verified_payment('mock','slp_synthetic_123456','mock:tx',49999,'KRW',NULL,now());
    RAISE EXCEPTION 'tampered amount was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'payment_mismatch' THEN RAISE; END IF; END;
  PERFORM public.confirm_verified_payment('mock','slp_synthetic_123456','mock:tx',50000,'KRW','mock-receipt:opaque',now());
  PERFORM public.confirm_verified_payment('mock','slp_synthetic_123456','mock:tx',50000,'KRW','mock-receipt:opaque',now());
  IF (SELECT status FROM public.promotion_commercial_orders WHERE id='25000000-0000-4000-8000-000000000001')<>'payment_confirmed' THEN RAISE EXCEPTION 'order was not confirmed'; END IF;
  IF (SELECT count(*) FROM public.promotion_order_status_history WHERE order_id='25000000-0000-4000-8000-000000000001' AND reason_code='provider_verified')<>1 THEN RAISE EXCEPTION 'duplicate success was not idempotent'; END IF;
  webhook_id:=public.register_payment_webhook_event('mock','msg_synthetic_123456','Transaction.Paid','slp_synthetic_123456',repeat('b',64),now());
  duplicate_id:=public.register_payment_webhook_event('mock','msg_synthetic_123456','Transaction.Paid','slp_synthetic_123456',repeat('b',64),now());
  IF webhook_id IS NULL OR duplicate_id IS NOT NULL THEN RAISE EXCEPTION 'webhook replay protection failed'; END IF;
  PERFORM public.finish_payment_webhook_event(webhook_id,'processed',NULL);
  refund_one:=public.record_provider_refund('mock','slp_synthetic_123456',10000,repeat('c',64),'mock:refund:1','partial');
  refund_two:=public.record_provider_refund('mock','slp_synthetic_123456',40000,repeat('d',64),'mock:refund:2','completed');
  IF (SELECT status FROM public.payment_transactions WHERE id=first_attempt.id)<>'refunded' THEN RAISE EXCEPTION 'full refund state missing'; END IF;
  IF (SELECT refunded_amount_krw FROM public.promotion_commercial_orders WHERE id='25000000-0000-4000-8000-000000000001')<>50000 THEN RAISE EXCEPTION 'refund total mismatch'; END IF;
END $$;

ROLLBACK;
SELECT 'PHASE10G_PAYMENT_LIFECYCLE_OK' AS status;
