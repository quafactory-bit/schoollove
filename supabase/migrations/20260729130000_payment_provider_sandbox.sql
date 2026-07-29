-- PHASE 10G: provider-neutral payment records with PortOne V2 sandbox support.
-- This migration prepares the schema only. It does not enable a Production provider.

ALTER TABLE public.promotion_commercial_orders
  DROP CONSTRAINT promotion_commercial_orders_payment_provider_check;
ALTER TABLE public.promotion_commercial_orders
  ADD CONSTRAINT promotion_commercial_orders_payment_provider_check
  CHECK (payment_provider IN ('manual','mock','portone_sandbox'));

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.promotion_commercial_orders(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('manual','mock','portone_sandbox')),
  provider_payment_id text NOT NULL CHECK (provider_payment_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  provider_reference text CHECK (provider_reference IS NULL OR char_length(provider_reference) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'created','ready','pending','paid','failed','cancelled','partially_refunded','refunded','expired'
  )),
  order_number text NOT NULL CHECK (order_number ~ '^SL-[0-9]{8}-[0-9A-F]{12}$'),
  amount_krw integer NOT NULL CHECK (amount_krw BETWEEN 1000 AND 100000000),
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency='KRW'),
  idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  receipt_reference text CHECK (receipt_reference IS NULL OR char_length(receipt_reference) <= 500),
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_payment_id),
  UNIQUE(order_id,idempotency_key_hash)
);
CREATE UNIQUE INDEX payment_transactions_one_open_per_order
  ON public.payment_transactions(order_id)
  WHERE status IN ('created','ready','pending','paid','partially_refunded');
CREATE INDEX payment_transactions_owner_idx ON public.payment_transactions(owner_user_id,created_at DESC);
CREATE INDEX payment_transactions_status_idx ON public.payment_transactions(status,updated_at DESC);

CREATE TABLE public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  provider text NOT NULL CHECK (provider IN ('mock','portone_sandbox')),
  event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 6 AND 160),
  event_type text NOT NULL CHECK (event_type IN (
    'Transaction.Ready','Transaction.Paid','Transaction.VirtualAccountIssued',
    'Transaction.PartialCancelled','Transaction.Cancelled','Transaction.Failed',
    'Transaction.PayPending','Transaction.CancelPending'
  )),
  provider_payment_id text NOT NULL CHECK (provider_payment_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','ignored','failed','discarded')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[A-Z0-9_]{2,60}$'),
  UNIQUE(provider,event_id)
);
CREATE INDEX payment_webhook_retry_idx ON public.payment_webhook_events(status,next_attempt_at)
  WHERE status IN ('pending','failed');

CREATE TABLE public.payment_refund_attempts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  payment_transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('manual','mock','portone_sandbox')),
  idempotency_key_hash text NOT NULL UNIQUE CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  requested_amount_krw integer NOT NULL CHECK (requested_amount_krw > 0),
  completed_amount_krw integer NOT NULL DEFAULT 0 CHECK (completed_amount_krw >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','completed','failed','unavailable')),
  provider_reference text CHECK (provider_reference IS NULL OR char_length(provider_reference) <= 200),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[A-Z0-9_]{2,60}$'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (completed_amount_krw <= requested_amount_krw)
);

CREATE TABLE public.payment_document_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  payment_transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('cash_receipt','tax_invoice')),
  business_reference_hash text CHECK (business_reference_hash IS NULL OR business_reference_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','reviewing','issued','rejected','cancelled')),
  issued_reference text CHECK (issued_reference IS NULL OR char_length(issued_reference) <= 200),
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_transaction_id,document_type)
);

CREATE OR REPLACE FUNCTION public.create_payment_attempt(
  actor_user_id uuid, target_order_id uuid, requested_provider text,
  requested_payment_id text, request_key_hash text
) RETURNS public.payment_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.promotion_commercial_orders%ROWTYPE; result public.payment_transactions%ROWTYPE;
BEGIN
  IF requested_provider NOT IN ('mock','portone_sandbox')
    OR requested_payment_id !~ '^[A-Za-z0-9_-]{6,64}$'
    OR request_key_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_payment_attempt'; END IF;
  SELECT * INTO order_row FROM public.promotion_commercial_orders
    WHERE id=target_order_id AND owner_user_id=actor_user_id FOR UPDATE;
  IF order_row.id IS NULL OR order_row.status NOT IN ('awaiting_payment','payment_review')
    OR order_row.payment_due_at<=now() THEN RAISE EXCEPTION 'payment_unavailable'; END IF;
  SELECT * INTO result FROM public.payment_transactions
    WHERE order_id=target_order_id AND idempotency_key_hash=request_key_hash;
  IF result.id IS NOT NULL THEN RETURN result; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_transactions WHERE order_id=target_order_id
    AND status IN ('created','ready','pending','paid','partially_refunded')) THEN RAISE EXCEPTION 'payment_exists'; END IF;
  INSERT INTO public.payment_transactions(order_id,owner_user_id,provider,provider_payment_id,order_number,amount_krw,currency,idempotency_key_hash)
  VALUES(order_row.id,actor_user_id,requested_provider,requested_payment_id,order_row.order_number,order_row.total_krw,order_row.currency,request_key_hash)
  RETURNING * INTO result;
  UPDATE public.promotion_commercial_orders SET payment_provider=requested_provider,updated_at=now() WHERE id=order_row.id;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('applicant',actor_user_id::text,'payment_attempt_created','payment_transactions',result.id,
    jsonb_build_object('provider',requested_provider,'order_id',order_row.id));
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.update_payment_attempt_status(
  requested_provider text, requested_payment_id text, requested_status text,
  requested_provider_reference text, requested_safe_error text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment_row public.payment_transactions%ROWTYPE;
BEGIN
  IF requested_status NOT IN ('ready','pending','failed','cancelled','expired') THEN RAISE EXCEPTION 'invalid_payment_status'; END IF;
  SELECT * INTO payment_row FROM public.payment_transactions
    WHERE provider=requested_provider AND provider_payment_id=requested_payment_id FOR UPDATE;
  IF payment_row.id IS NULL OR payment_row.status IN ('paid','partially_refunded','refunded') THEN RETURN false; END IF;
  UPDATE public.payment_transactions SET status=requested_status,provider_reference=requested_provider_reference,
    failed_at=CASE WHEN requested_status='failed' THEN now() ELSE failed_at END,
    cancelled_at=CASE WHEN requested_status='cancelled' THEN now() ELSE cancelled_at END,
    updated_at=now() WHERE id=payment_row.id;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('system','payment-provider','payment_'||requested_status,'payment_transactions',payment_row.id,
    jsonb_build_object('safe_error_code',requested_safe_error));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_verified_payment(
  requested_provider text, requested_payment_id text, requested_provider_reference text,
  verified_amount integer, verified_currency text, requested_receipt_reference text,
  requested_paid_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment_row public.payment_transactions%ROWTYPE; order_row public.promotion_commercial_orders%ROWTYPE; old_status text;
BEGIN
  SELECT * INTO payment_row FROM public.payment_transactions
    WHERE provider=requested_provider AND provider_payment_id=requested_payment_id FOR UPDATE;
  IF payment_row.id IS NULL THEN RAISE EXCEPTION 'payment_not_found'; END IF;
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=payment_row.order_id FOR UPDATE;
  IF verified_amount<>payment_row.amount_krw OR verified_amount<>order_row.total_krw
    OR verified_currency<>payment_row.currency OR verified_currency<>order_row.currency THEN RAISE EXCEPTION 'payment_mismatch'; END IF;
  IF payment_row.status='paid' THEN RETURN true; END IF;
  IF payment_row.status IN ('cancelled','refunded') OR order_row.status NOT IN ('awaiting_payment','payment_review') THEN RAISE EXCEPTION 'payment_state_conflict'; END IF;
  old_status:=order_row.status;
  UPDATE public.payment_transactions SET status='paid',provider_reference=requested_provider_reference,
    receipt_reference=requested_receipt_reference,paid_at=requested_paid_at,updated_at=now() WHERE id=payment_row.id;
  UPDATE public.promotion_commercial_orders SET status='payment_confirmed',received_amount_krw=total_krw,
    payment_provider=requested_provider,updated_at=now() WHERE id=order_row.id;
  UPDATE public.promotion_requests SET status='payment_confirmed',updated_at=now() WHERE id=order_row.request_id;
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code)
  VALUES(order_row.id,old_status,'payment_confirmed','system',requested_provider,'provider_verified');
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(order_row.owner_user_id,'payment_confirmed','order',order_row.id,'provider-payment-confirmed:'||payment_row.id,
    jsonb_build_object('order_id',order_row.id,'provider',requested_provider));
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('system',requested_provider,'provider_payment_confirmed','payment_transactions',payment_row.id,
    jsonb_build_object('order_id',order_row.id,'currency',verified_currency));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.register_payment_webhook_event(
  requested_provider text, requested_event_id text, requested_event_type text,
  requested_payment_id text, requested_payload_hash text, requested_occurred_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  INSERT INTO public.payment_webhook_events(provider,event_id,event_type,provider_payment_id,payload_sha256,signature_verified,occurred_at)
  VALUES(requested_provider,requested_event_id,requested_event_type,requested_payment_id,requested_payload_hash,true,requested_occurred_at)
  ON CONFLICT(provider,event_id) DO NOTHING RETURNING id INTO result_id;
  RETURN result_id;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_payment_webhook_event(
  target_event_id uuid, requested_status text, requested_error_code text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_status NOT IN ('processed','ignored','failed','discarded') THEN RAISE EXCEPTION 'invalid_webhook_status'; END IF;
  UPDATE public.payment_webhook_events SET status=requested_status,attempts=attempts+1,
    processed_at=CASE WHEN requested_status IN ('processed','ignored','discarded') THEN now() ELSE processed_at END,
    next_attempt_at=CASE WHEN requested_status='failed' THEN now()+make_interval(mins=>LEAST(1440,power(2,attempts+1)::integer)) ELSE next_attempt_at END,
    safe_error_code=requested_error_code WHERE id=target_event_id AND attempts<10;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_retry_payment_webhook(target_event_id uuid, admin_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.payment_webhook_events SET status='pending',next_attempt_at=now(),safe_error_code=NULL
    WHERE id=target_event_id AND status='failed' AND attempts<10;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES('admin',admin_actor,'payment_webhook_retry','payment_webhook_events',target_event_id);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.record_provider_refund(
  requested_provider text, requested_payment_id text, requested_amount integer,
  request_key_hash text, requested_provider_reference text, requested_status text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payment_row public.payment_transactions%ROWTYPE; refund_id uuid; cumulative integer; next_status text;
BEGIN
  SELECT * INTO payment_row FROM public.payment_transactions
    WHERE provider=requested_provider AND provider_payment_id=requested_payment_id FOR UPDATE;
  IF payment_row.id IS NULL OR payment_row.status NOT IN ('paid','partially_refunded')
    OR requested_amount<1 OR requested_amount>payment_row.amount_krw THEN RAISE EXCEPTION 'refund_unavailable'; END IF;
  INSERT INTO public.payment_refund_attempts(payment_transaction_id,provider,idempotency_key_hash,requested_amount_krw,completed_amount_krw,status,provider_reference,completed_at)
  VALUES(payment_row.id,requested_provider,request_key_hash,requested_amount,requested_amount,requested_status,requested_provider_reference,now())
  RETURNING id INTO refund_id;
  SELECT COALESCE(sum(completed_amount_krw),0) INTO cumulative FROM public.payment_refund_attempts
    WHERE payment_transaction_id=payment_row.id AND status IN ('partial','completed');
  IF cumulative>payment_row.amount_krw THEN RAISE EXCEPTION 'refund_amount_exceeded'; END IF;
  next_status:=CASE WHEN cumulative=payment_row.amount_krw THEN 'refunded' ELSE 'partially_refunded' END;
  UPDATE public.payment_transactions SET status=next_status,updated_at=now() WHERE id=payment_row.id;
  UPDATE public.promotion_commercial_orders SET status=CASE WHEN next_status='refunded' THEN 'refunded' ELSE 'partial_refund' END,
    refunded_amount_krw=cumulative,updated_at=now() WHERE id=payment_row.order_id;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('system',requested_provider,'provider_refund_recorded','payment_refund_attempts',refund_id,
    jsonb_build_object('payment_transaction_id',payment_row.id,'status',next_status));
  RETURN refund_id;
END; $$;

CREATE OR REPLACE FUNCTION public.request_payment_document(
  actor_user_id uuid, target_payment_id uuid, requested_type text, business_ref_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result_id uuid;
BEGIN
  IF requested_type NOT IN ('cash_receipt','tax_invoice') OR
    (business_ref_hash IS NOT NULL AND business_ref_hash !~ '^[0-9a-f]{64}$') THEN RAISE EXCEPTION 'invalid_document_request'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_transactions WHERE id=target_payment_id AND owner_user_id=actor_user_id AND status IN ('paid','partially_refunded'))
    THEN RAISE EXCEPTION 'payment_unavailable'; END IF;
  INSERT INTO public.payment_document_requests(payment_transaction_id,owner_user_id,document_type,business_reference_hash)
  VALUES(target_payment_id,actor_user_id,requested_type,business_ref_hash)
  ON CONFLICT(payment_transaction_id,document_type) DO UPDATE SET updated_at=now()
  RETURNING id INTO result_id;
  RETURN result_id;
END; $$;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['payment_transactions','payment_webhook_events','payment_refund_attempts','payment_document_requests']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role',table_name);
  END LOOP;
END $$;

GRANT SELECT ON public.payment_transactions,public.payment_document_requests TO authenticated;
CREATE POLICY payment_transactions_owner_select ON public.payment_transactions FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY payment_document_requests_owner_select ON public.payment_document_requests FOR SELECT TO authenticated USING(owner_user_id=auth.uid());

REVOKE ALL ON FUNCTION public.create_payment_attempt(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_payment_attempt_status(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.confirm_verified_payment(text,text,text,integer,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.register_payment_webhook_event(text,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_payment_webhook_event(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_retry_payment_webhook(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_provider_refund(text,text,integer,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.request_payment_document(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_attempt(uuid,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_payment_attempt_status(text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_verified_payment(text,text,text,integer,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_payment_webhook_event(text,text,text,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_payment_webhook_event(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_retry_payment_webhook(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_provider_refund(text,text,integer,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_payment_document(uuid,uuid,text,text) TO service_role;

INSERT INTO public.retention_policy_versions(policy_key,version,status,rules,approved_by)
VALUES('phase10g_payment',1,'active',jsonb_build_object(
  'webhook_metadata_days',90,'raw_webhook_payload_stored',false,
  'refund_history_days',1825,'document_request_days',1825
),'migration:phase10g')
ON CONFLICT(policy_key,version) DO NOTHING;
