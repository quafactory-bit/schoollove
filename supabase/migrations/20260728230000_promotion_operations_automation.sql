-- PHASE 10E: repeatable promotion operations without a live payment gateway.
-- This migration extends PHASE 10D. It never mutates existing personal profile data.

CREATE TABLE public.promotion_products (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_code text NOT NULL UNIQUE CHECK (product_code ~ '^[a-z0-9][a-z0-9_-]{2,39}$'),
  name text NOT NULL CHECK (public.promotion_text_is_safe(name, 80)),
  description text NOT NULL CHECK (public.promotion_text_is_safe(description, 500)),
  placement_type text NOT NULL CHECK (placement_type IN ('homepage_today','school_page','region_page','content_feed')),
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 31),
  image_width integer NOT NULL CHECK (image_width BETWEEN 320 AND 4096),
  image_height integer NOT NULL CHECK (image_height BETWEEN 320 AND 4096),
  title_limit integer NOT NULL CHECK (title_limit BETWEEN 20 AND 80),
  body_limit integer NOT NULL CHECK (body_limit BETWEEN 50 AND 300),
  base_price_krw integer NOT NULL CHECK (base_price_krw BETWEEN 1000 AND 100000000),
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency='KRW'),
  vat_display_mode text NOT NULL CHECK (vat_display_mode IN ('included','excluded','not_applicable')),
  allows_school_targeting boolean NOT NULL DEFAULT false,
  allows_region_targeting boolean NOT NULL DEFAULT false,
  sale_status text NOT NULL DEFAULT 'draft' CHECK (sale_status IN ('draft','active','paused','retired')),
  price_policy_version text NOT NULL CHECK (price_policy_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  catalog_version integer NOT NULL DEFAULT 1 CHECK (catalog_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((placement_type='school_page') = allows_school_targeting),
  CHECK ((placement_type='region_page') = allows_region_targeting)
);

CREATE TABLE public.promotion_quotes (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES public.promotion_requests(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.promotion_products(id) ON DELETE RESTRICT,
  quote_number text NOT NULL UNIQUE CHECK (quote_number ~ '^Q-[0-9]{8}-[0-9A-F]{12}$'),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','accepted','rejected','expired','void')),
  subtotal_krw integer NOT NULL CHECK (subtotal_krw BETWEEN 1000 AND 100000000),
  vat_krw integer NOT NULL CHECK (vat_krw BETWEEN 0 AND 10000000),
  total_krw integer NOT NULL CHECK (total_krw=subtotal_krw+vat_krw),
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency='KRW'),
  price_policy_version text NOT NULL,
  product_snapshot jsonb NOT NULL CHECK (jsonb_typeof(product_snapshot)='object'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  issued_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '30 days')
);
CREATE UNIQUE INDEX promotion_quotes_one_open_per_request
  ON public.promotion_quotes(request_id) WHERE status IN ('issued','accepted');
CREATE INDEX promotion_quotes_owner_status_idx ON public.promotion_quotes(owner_user_id,status,issued_at DESC);

CREATE TABLE public.promotion_commercial_orders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_number text NOT NULL UNIQUE CHECK (order_number ~ '^SL-[0-9]{8}-[0-9A-F]{12}$'),
  quote_id uuid NOT NULL UNIQUE REFERENCES public.promotion_quotes(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE REFERENCES public.promotion_requests(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
    'awaiting_payment','payment_submitted','payment_review','payment_confirmed','scheduled','active','paused',
    'completed','cancel_requested','cancelled','refund_pending','partial_refund','refunded','refund_unavailable'
  )),
  subtotal_krw integer NOT NULL CHECK (subtotal_krw BETWEEN 1000 AND 100000000),
  vat_krw integer NOT NULL CHECK (vat_krw BETWEEN 0 AND 10000000),
  total_krw integer NOT NULL CHECK (total_krw=subtotal_krw+vat_krw),
  received_amount_krw integer NOT NULL DEFAULT 0 CHECK (received_amount_krw >= 0),
  refunded_amount_krw integer NOT NULL DEFAULT 0 CHECK (refunded_amount_krw >= 0 AND refunded_amount_krw <= received_amount_krw),
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency='KRW'),
  payment_provider text NOT NULL DEFAULT 'manual' CHECK (payment_provider='manual'),
  payment_due_at timestamptz NOT NULL,
  product_snapshot jsonb NOT NULL CHECK (jsonb_typeof(product_snapshot)='object'),
  price_policy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (payment_due_at > accepted_at AND payment_due_at <= accepted_at + interval '14 days')
);
CREATE INDEX promotion_commercial_orders_owner_status_idx ON public.promotion_commercial_orders(owner_user_id,status,accepted_at DESC);

CREATE TABLE public.promotion_order_status_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.promotion_commercial_orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('applicant','admin','system')),
  actor_reference text,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotion_order_history_order_idx ON public.promotion_order_status_history(order_id,created_at);

CREATE TABLE public.promotion_payment_submissions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.promotion_commercial_orders(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  declared_amount_krw integer NOT NULL CHECK (declared_amount_krw BETWEEN 1 AND 100000000),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','reviewed','superseded')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE(order_id,idempotency_key_hash)
);
CREATE UNIQUE INDEX promotion_payment_one_pending_notice
  ON public.promotion_payment_submissions(order_id) WHERE status='pending_review';

CREATE TABLE public.promotion_payment_confirmations (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.promotion_commercial_orders(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES public.promotion_payment_submissions(id) ON DELETE SET NULL,
  idempotency_key_hash text NOT NULL UNIQUE CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  confirmed_amount_krw integer NOT NULL CHECK (confirmed_amount_krw BETWEEN 1 AND 100000000),
  cumulative_amount_krw integer NOT NULL CHECK (cumulative_amount_krw BETWEEN 1 AND 200000000),
  match_status text NOT NULL CHECK (match_status IN ('exact','under','partial','over')),
  confirmed_by text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotion_payment_confirmations_order_idx ON public.promotion_payment_confirmations(order_id,confirmed_at);

CREATE TABLE public.promotion_cancellation_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.promotion_commercial_orders(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  reason_code text NOT NULL CHECK (reason_code IN ('changed_mind','schedule','creative','delivery','other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_reason_code text CHECK (decision_reason_code IS NULL OR decision_reason_code IN ('approved','already_started','delivered','policy','amount','other')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text,
  UNIQUE(order_id,idempotency_key_hash)
);
CREATE UNIQUE INDEX promotion_cancellation_one_pending
  ON public.promotion_cancellation_requests(order_id) WHERE status='pending';

CREATE TABLE public.promotion_refunds (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.promotion_commercial_orders(id) ON DELETE CASCADE,
  cancellation_request_id uuid NOT NULL UNIQUE REFERENCES public.promotion_cancellation_requests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','completed','unavailable')),
  approved_amount_krw integer NOT NULL CHECK (approved_amount_krw >= 0),
  completed_amount_krw integer NOT NULL DEFAULT 0 CHECK (completed_amount_krw >= 0),
  decision_reason_code text NOT NULL,
  confirmed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_amount_krw <= approved_amount_krw)
);

CREATE TABLE public.promotion_notification_outbox (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'ownership_verification','changes_requested','request_approved','quote_issued','payment_awaiting',
    'payment_submitted','payment_confirmed','scheduled','promotion_started','promotion_ended',
    'performance_report','cancellation_requested','cancellation_decided','refund_status'
  )),
  aggregate_type text NOT NULL CHECK (aggregate_type IN ('account','request','quote','order','refund','report')),
  aggregate_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','discarded')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_]{2,60}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotion_notification_pending_idx ON public.promotion_notification_outbox(status,available_at) WHERE status IN ('pending','failed');

CREATE TABLE public.promotion_performance_reports (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.promotion_commercial_orders(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  placement_type text NOT NULL,
  context_key text NOT NULL,
  impressions integer NOT NULL CHECK (impressions >= 0),
  clicks integer NOT NULL CHECK (clicks >= 0),
  daily_totals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(daily_totals)='array'),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL,
  CHECK (period_start <= period_end),
  UNIQUE(order_id,period_start,period_end)
);

CREATE OR REPLACE FUNCTION public.admin_upsert_promotion_product(
  target_product_id uuid, requested_code text, requested_name text, requested_description text,
  requested_placement text, requested_duration_days integer, requested_image_width integer,
  requested_image_height integer, requested_title_limit integer, requested_body_limit integer,
  requested_base_price_krw integer, requested_vat_display_mode text,
  requested_allows_school boolean, requested_allows_region boolean, requested_sale_status text,
  requested_price_policy_version text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE product_id uuid;
BEGIN
  IF admin_actor IS NULL OR char_length(admin_actor)>100 THEN RAISE EXCEPTION 'invalid_admin'; END IF;
  IF target_product_id IS NULL THEN
    INSERT INTO public.promotion_products(product_code,name,description,placement_type,duration_days,image_width,image_height,title_limit,body_limit,base_price_krw,vat_display_mode,allows_school_targeting,allows_region_targeting,sale_status,price_policy_version)
    VALUES(requested_code,requested_name,requested_description,requested_placement,requested_duration_days,requested_image_width,requested_image_height,requested_title_limit,requested_body_limit,requested_base_price_krw,requested_vat_display_mode,requested_allows_school,requested_allows_region,requested_sale_status,requested_price_policy_version)
    RETURNING id INTO product_id;
  ELSE
    UPDATE public.promotion_products SET name=requested_name,description=requested_description,placement_type=requested_placement,
      duration_days=requested_duration_days,image_width=requested_image_width,image_height=requested_image_height,
      title_limit=requested_title_limit,body_limit=requested_body_limit,base_price_krw=requested_base_price_krw,
      vat_display_mode=requested_vat_display_mode,allows_school_targeting=requested_allows_school,
      allows_region_targeting=requested_allows_region,sale_status=requested_sale_status,
      price_policy_version=requested_price_policy_version,catalog_version=catalog_version+1,updated_at=now()
    WHERE id=target_product_id AND product_code=requested_code RETURNING id INTO product_id;
    IF product_id IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  END IF;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('admin',admin_actor,'product_upserted','promotion_products',product_id,jsonb_build_object('price_policy_version',requested_price_policy_version));
  RETURN product_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_approve_and_quote_promotion_request(
  target_request_id uuid, target_product_id uuid, requested_expires_at timestamptz,
  review_note text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.promotion_requests%ROWTYPE; product public.promotion_products%ROWTYPE; quote_id uuid; quote_number text; subtotal integer; vat integer; snapshot jsonb;
BEGIN
  SELECT * INTO req FROM public.promotion_requests WHERE id=target_request_id FOR UPDATE;
  IF req.id IS NULL OR req.status NOT IN ('pending_review','changes_requested') THEN RAISE EXCEPTION 'invalid_request_state'; END IF;
  SELECT * INTO product FROM public.promotion_products WHERE id=target_product_id AND sale_status='active' FOR SHARE;
  IF product.id IS NULL OR product.placement_type<>req.requested_placement THEN RAISE EXCEPTION 'invalid_product'; END IF;
  IF requested_expires_at<=now() OR requested_expires_at>now()+interval '30 days' THEN RAISE EXCEPTION 'invalid_expiry'; END IF;
  IF EXISTS(SELECT 1 FROM public.promotion_quotes WHERE request_id=req.id AND status IN ('issued','accepted')) THEN RAISE EXCEPTION 'open_quote_exists'; END IF;
  quote_id:=extensions.uuid_generate_v4(); quote_number:='Q-'||to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYYMMDD')||'-'||upper(substr(replace(quote_id::text,'-',''),1,12));
  IF product.vat_display_mode='included' THEN
    vat:=round(product.base_price_krw/11.0)::integer; subtotal:=product.base_price_krw-vat;
  ELSIF product.vat_display_mode='excluded' THEN
    subtotal:=product.base_price_krw; vat:=round(product.base_price_krw*0.1)::integer;
  ELSE
    subtotal:=product.base_price_krw; vat:=0;
  END IF;
  snapshot:=jsonb_build_object('product_id',product.id,'product_code',product.product_code,'name',product.name,'description',product.description,
    'placement_type',product.placement_type,'duration_days',product.duration_days,'image_width',product.image_width,'image_height',product.image_height,
    'title_limit',product.title_limit,'body_limit',product.body_limit,'vat_display_mode',product.vat_display_mode,
    'allows_school_targeting',product.allows_school_targeting,'allows_region_targeting',product.allows_region_targeting,
    'catalog_version',product.catalog_version,'price_policy_version',product.price_policy_version);
  INSERT INTO public.promotion_reviews(request_id,action,reason_code,note,reviewed_by) VALUES(req.id,'approved','approved',review_note,admin_actor);
  UPDATE public.promotion_assets SET review_status='approved',approved_at=now() WHERE request_id=req.id;
  UPDATE public.promotion_requests SET status='approved',updated_at=now() WHERE id=req.id;
  INSERT INTO public.promotion_quotes(id,request_id,owner_user_id,product_id,quote_number,subtotal_krw,vat_krw,total_krw,price_policy_version,product_snapshot,expires_at,issued_by)
  VALUES(quote_id,req.id,req.owner_user_id,product.id,quote_number,subtotal,vat,subtotal+vat,product.price_policy_version,snapshot,requested_expires_at,admin_actor);
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(req.owner_user_id,'quote_issued','quote',quote_id,'quote-issued:'||quote_id,jsonb_build_object('quote_id',quote_id,'expires_at',requested_expires_at));
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('admin',admin_actor,'quote_issued','promotion_quotes',quote_id,jsonb_build_object('request_id',req.id,'product_id',product.id,'policy_version',product.price_policy_version));
  RETURN quote_id;
END; $$;

CREATE OR REPLACE FUNCTION public.respond_own_promotion_quote(
  actor_user_id uuid, target_quote_id uuid, response_action text, request_key_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE quote public.promotion_quotes%ROWTYPE; order_id uuid; order_number text; current_status text;
BEGIN
  IF request_key_hash !~ '^[0-9a-f]{64}$' OR response_action NOT IN ('accept','reject') THEN RAISE EXCEPTION 'invalid_response'; END IF;
  SELECT * INTO quote FROM public.promotion_quotes WHERE id=target_quote_id AND owner_user_id=actor_user_id FOR UPDATE;
  IF quote.id IS NULL OR quote.status<>'issued' THEN RAISE EXCEPTION 'quote_unavailable'; END IF;
  IF quote.expires_at<=now() THEN UPDATE public.promotion_quotes SET status='expired',responded_at=now() WHERE id=quote.id; RAISE EXCEPTION 'quote_expired'; END IF;
  IF response_action='reject' THEN
    UPDATE public.promotion_quotes SET status='rejected',responded_at=now() WHERE id=quote.id;
    INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id) VALUES('applicant',actor_user_id::text,'quote_rejected','promotion_quotes',quote.id);
    RETURN quote.id;
  END IF;
  IF EXISTS(SELECT 1 FROM public.promotion_commercial_orders WHERE quote_id=quote.id OR request_id=quote.request_id) THEN RAISE EXCEPTION 'order_exists'; END IF;
  order_id:=extensions.uuid_generate_v4(); order_number:='SL-'||to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYYMMDD')||'-'||upper(substr(replace(order_id::text,'-',''),1,12));
  UPDATE public.promotion_quotes SET status='accepted',responded_at=now() WHERE id=quote.id;
  INSERT INTO public.promotion_commercial_orders(id,order_number,quote_id,request_id,owner_user_id,subtotal_krw,vat_krw,total_krw,product_snapshot,price_policy_version,payment_due_at)
  VALUES(order_id,order_number,quote.id,quote.request_id,quote.owner_user_id,quote.subtotal_krw,quote.vat_krw,quote.total_krw,quote.product_snapshot,quote.price_policy_version,now()+interval '7 days');
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code)
  VALUES(order_id,NULL,'awaiting_payment','applicant',actor_user_id::text,'quote_accepted');
  UPDATE public.promotion_requests SET status='payment_pending',updated_at=now() WHERE id=quote.request_id;
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(actor_user_id,'payment_awaiting','order',order_id,'payment-awaiting:'||order_id,jsonb_build_object('order_id',order_id,'payment_due_at',now()+interval '7 days'));
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('applicant',actor_user_id::text,'quote_accepted','promotion_commercial_orders',order_id,jsonb_build_object('quote_id',quote.id,'request_key_hash',request_key_hash));
  RETURN order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_manual_payment_notice(
  actor_user_id uuid, target_order_id uuid, declared_amount integer, request_key_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.promotion_commercial_orders%ROWTYPE; submission_id uuid; old_status text;
BEGIN
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=target_order_id AND owner_user_id=actor_user_id FOR UPDATE;
  IF order_row.id IS NULL OR order_row.status NOT IN ('awaiting_payment','payment_review') OR order_row.payment_due_at<=now() THEN RAISE EXCEPTION 'payment_notice_unavailable'; END IF;
  INSERT INTO public.promotion_payment_submissions(order_id,owner_user_id,idempotency_key_hash,declared_amount_krw)
  VALUES(order_row.id,actor_user_id,request_key_hash,declared_amount) RETURNING id INTO submission_id;
  old_status:=order_row.status;
  UPDATE public.promotion_commercial_orders SET status='payment_submitted',updated_at=now() WHERE id=order_row.id;
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code)
  VALUES(order_row.id,old_status,'payment_submitted','applicant',actor_user_id::text,'manual_payment_notice');
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(actor_user_id,'payment_submitted','order',order_row.id,'payment-submitted:'||submission_id,jsonb_build_object('order_id',order_row.id));
  RETURN submission_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_confirm_manual_payment(
  target_order_id uuid, target_submission_id uuid, confirmed_amount integer,
  requested_match_status text, request_key_hash text, admin_actor text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.promotion_commercial_orders%ROWTYPE; cumulative integer; derived_status text; next_status text; old_status text;
BEGIN
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=target_order_id FOR UPDATE;
  IF order_row.id IS NULL OR order_row.status NOT IN ('payment_submitted','payment_review') THEN RAISE EXCEPTION 'payment_review_unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.promotion_payment_submissions WHERE id=target_submission_id AND order_id=order_row.id AND status='pending_review' FOR UPDATE) THEN RAISE EXCEPTION 'submission_unavailable'; END IF;
  cumulative:=order_row.received_amount_krw+confirmed_amount;
  derived_status:=CASE WHEN cumulative=order_row.total_krw THEN 'exact' WHEN cumulative>order_row.total_krw THEN 'over' ELSE requested_match_status END;
  IF cumulative<order_row.total_krw AND requested_match_status NOT IN ('under','partial') THEN RAISE EXCEPTION 'invalid_match_status'; END IF;
  IF cumulative>=order_row.total_krw AND requested_match_status NOT IN ('exact','over') THEN RAISE EXCEPTION 'invalid_match_status'; END IF;
  next_status:=CASE WHEN cumulative>=order_row.total_krw THEN 'payment_confirmed' ELSE 'payment_review' END; old_status:=order_row.status;
  INSERT INTO public.promotion_payment_confirmations(order_id,submission_id,idempotency_key_hash,confirmed_amount_krw,cumulative_amount_krw,match_status,confirmed_by)
  VALUES(order_row.id,target_submission_id,request_key_hash,confirmed_amount,cumulative,derived_status,admin_actor);
  UPDATE public.promotion_payment_submissions SET status='reviewed',reviewed_at=now() WHERE id=target_submission_id;
  UPDATE public.promotion_commercial_orders SET received_amount_krw=cumulative,status=next_status,updated_at=now() WHERE id=order_row.id;
  UPDATE public.promotion_requests SET status=CASE WHEN next_status='payment_confirmed' THEN 'payment_confirmed' ELSE 'payment_pending' END,updated_at=now() WHERE id=order_row.request_id;
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code)
  VALUES(order_row.id,old_status,next_status,'admin',admin_actor,derived_status);
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(order_row.owner_user_id,CASE WHEN next_status='payment_confirmed' THEN 'payment_confirmed' ELSE 'payment_submitted' END,'order',order_row.id,'payment-review:'||request_key_hash,jsonb_build_object('order_id',order_row.id,'match_status',derived_status));
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('admin',admin_actor,'manual_payment_reviewed','promotion_commercial_orders',order_row.id,jsonb_build_object('match_status',derived_status));
  RETURN derived_status;
END; $$;

CREATE OR REPLACE FUNCTION public.request_promotion_cancellation(
  actor_user_id uuid, target_order_id uuid, requested_reason text, request_key_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.promotion_commercial_orders%ROWTYPE; cancellation_id uuid; old_status text;
BEGIN
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=target_order_id AND owner_user_id=actor_user_id FOR UPDATE;
  IF order_row.id IS NULL OR order_row.status IN ('completed','cancelled','refunded','refund_unavailable') THEN RAISE EXCEPTION 'cancellation_unavailable'; END IF;
  INSERT INTO public.promotion_cancellation_requests(order_id,owner_user_id,idempotency_key_hash,reason_code)
  VALUES(order_row.id,actor_user_id,request_key_hash,requested_reason) RETURNING id INTO cancellation_id;
  old_status:=order_row.status;
  UPDATE public.promotion_commercial_orders SET status='cancel_requested',updated_at=now() WHERE id=order_row.id;
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code)
  VALUES(order_row.id,old_status,'cancel_requested','applicant',actor_user_id::text,requested_reason);
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(actor_user_id,'cancellation_requested','order',order_row.id,'cancellation-requested:'||cancellation_id,jsonb_build_object('order_id',order_row.id));
  RETURN cancellation_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_decide_promotion_cancellation(
  target_cancellation_id uuid, decision text, refund_amount integer, decision_reason text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cancellation public.promotion_cancellation_requests%ROWTYPE; order_row public.promotion_commercial_orders%ROWTYPE; refund_id uuid; next_status text; prior_status text;
BEGIN
  SELECT * INTO cancellation FROM public.promotion_cancellation_requests WHERE id=target_cancellation_id AND status='pending' FOR UPDATE;
  IF cancellation.id IS NULL OR decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'decision_unavailable'; END IF;
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=cancellation.order_id FOR UPDATE;
  IF decision='reject' THEN
    SELECT from_status INTO prior_status FROM public.promotion_order_status_history WHERE order_id=order_row.id AND to_status='cancel_requested' ORDER BY created_at DESC LIMIT 1;
    next_status:=COALESCE(prior_status,CASE WHEN order_row.received_amount_krw>=order_row.total_krw THEN 'payment_confirmed' ELSE 'awaiting_payment' END);
    UPDATE public.promotion_cancellation_requests SET status='rejected',decision_reason_code=decision_reason,decided_at=now(),decided_by=admin_actor WHERE id=cancellation.id;
    UPDATE public.promotion_commercial_orders SET status=next_status,updated_at=now() WHERE id=order_row.id;
    INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code) VALUES(order_row.id,'cancel_requested',next_status,'admin',admin_actor,decision_reason);
    RETURN NULL;
  END IF;
  IF refund_amount<0 OR refund_amount>order_row.received_amount_krw THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;
  next_status:=CASE WHEN refund_amount>0 THEN 'refund_pending' ELSE 'cancelled' END;
  UPDATE public.promotion_cancellation_requests SET status='approved',decision_reason_code=decision_reason,decided_at=now(),decided_by=admin_actor WHERE id=cancellation.id;
  UPDATE public.promotion_commercial_orders SET status=next_status,updated_at=now() WHERE id=order_row.id;
  UPDATE public.promotion_requests SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=order_row.request_id;
  UPDATE public.promotion_placements SET status='cancelled',updated_at=now() WHERE request_id=order_row.request_id AND status IN ('scheduled','active','paused');
  IF refund_amount>0 THEN INSERT INTO public.promotion_refunds(order_id,cancellation_request_id,approved_amount_krw,decision_reason_code) VALUES(order_row.id,cancellation.id,refund_amount,decision_reason) RETURNING id INTO refund_id; END IF;
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code) VALUES(order_row.id,'cancel_requested',next_status,'admin',admin_actor,decision_reason);
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(order_row.owner_user_id,'cancellation_decided','order',order_row.id,'cancellation-decided:'||cancellation.id,jsonb_build_object('order_id',order_row.id,'decision',decision));
  RETURN refund_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_confirm_promotion_refund(
  target_refund_id uuid, requested_status text, completed_amount integer, decision_reason text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE refund public.promotion_refunds%ROWTYPE; order_row public.promotion_commercial_orders%ROWTYPE; next_status text;
BEGIN
  SELECT * INTO refund FROM public.promotion_refunds WHERE id=target_refund_id AND status IN ('pending','partial') FOR UPDATE;
  IF refund.id IS NULL OR requested_status NOT IN ('partial','completed','unavailable') THEN RAISE EXCEPTION 'refund_unavailable'; END IF;
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=refund.order_id FOR UPDATE;
  IF completed_amount<refund.completed_amount_krw OR completed_amount>refund.approved_amount_krw THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;
  IF requested_status='completed' AND completed_amount<>refund.approved_amount_krw THEN RAISE EXCEPTION 'refund_not_complete'; END IF;
  next_status:=CASE requested_status WHEN 'partial' THEN 'partial_refund' WHEN 'completed' THEN 'refunded' ELSE 'refund_unavailable' END;
  UPDATE public.promotion_refunds SET status=requested_status,completed_amount_krw=completed_amount,decision_reason_code=decision_reason,confirmed_by=admin_actor,updated_at=now() WHERE id=refund.id;
  UPDATE public.promotion_commercial_orders SET status=next_status,refunded_amount_krw=completed_amount,updated_at=now() WHERE id=order_row.id;
  IF requested_status='completed' THEN UPDATE public.promotion_requests SET status='refunded',updated_at=now() WHERE id=order_row.request_id; END IF;
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code) VALUES(order_row.id,order_row.status,next_status,'admin',admin_actor,decision_reason);
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(order_row.owner_user_id,'refund_status','refund',refund.id,'refund-status:'||refund.id||':'||requested_status,jsonb_build_object('order_id',order_row.id,'status',requested_status));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_schedule_promotion_order(
  target_order_id uuid, scheduled_starts_at timestamptz, scheduled_ends_at timestamptz, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.promotion_commercial_orders%ROWTYPE; req public.promotion_requests%ROWTYPE; placement_id uuid; context_value text; duration integer;
BEGIN
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=target_order_id FOR UPDATE;
  IF order_row.id IS NULL OR order_row.status<>'payment_confirmed' THEN RAISE EXCEPTION 'payment_not_confirmed'; END IF;
  SELECT * INTO req FROM public.promotion_requests WHERE id=order_row.request_id FOR UPDATE;
  duration:=COALESCE((order_row.product_snapshot->>'duration_days')::integer,0);
  IF scheduled_starts_at>=scheduled_ends_at OR scheduled_ends_at<>scheduled_starts_at+(duration||' days')::interval THEN RAISE EXCEPTION 'invalid_schedule'; END IF;
  context_value:=CASE req.requested_placement WHEN 'school_page' THEN 'school:'||req.school_id::text WHEN 'region_page' THEN 'region:'||req.region_code ELSE 'global' END;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(req.requested_placement||':'||context_value,0));
  IF EXISTS(SELECT 1 FROM public.promotion_placements WHERE placement_type=req.requested_placement AND context_key=context_value AND status IN ('scheduled','active','paused') AND tstzrange(starts_at,ends_at,'[)') && tstzrange(scheduled_starts_at,scheduled_ends_at,'[)')) THEN RAISE EXCEPTION 'slot_conflict'; END IF;
  INSERT INTO public.promotion_placements(request_id,placement_type,context_key,slot_date,starts_at,ends_at,status)
  VALUES(req.id,req.requested_placement,context_value,(scheduled_starts_at AT TIME ZONE 'Asia/Seoul')::date,scheduled_starts_at,scheduled_ends_at,'scheduled') RETURNING id INTO placement_id;
  UPDATE public.promotion_commercial_orders SET status='scheduled',updated_at=now() WHERE id=order_row.id;
  UPDATE public.promotion_requests SET status='scheduled',updated_at=now() WHERE id=req.id;
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code) VALUES(order_row.id,'payment_confirmed','scheduled','admin',admin_actor,'calendar_reserved');
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(order_row.owner_user_id,'scheduled','order',order_row.id,'scheduled:'||placement_id,jsonb_build_object('order_id',order_row.id,'starts_at',scheduled_starts_at,'ends_at',scheduled_ends_at));
  RETURN placement_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_promotion_order_delivery(
  target_order_id uuid, requested_action text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.promotion_commercial_orders%ROWTYPE; placement public.promotion_placements%ROWTYPE; next_status text; event_name text;
BEGIN
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=target_order_id FOR UPDATE;
  SELECT * INTO placement FROM public.promotion_placements WHERE request_id=order_row.request_id FOR UPDATE;
  IF order_row.id IS NULL OR placement.id IS NULL THEN RAISE EXCEPTION 'delivery_unavailable'; END IF;
  IF requested_action='activate' AND order_row.status='scheduled' AND placement.starts_at<=now() AND placement.ends_at>now() THEN next_status:='active'; event_name:='promotion_started';
  ELSIF requested_action='pause' AND order_row.status='active' THEN next_status:='paused'; event_name:=NULL;
  ELSIF requested_action='resume' AND order_row.status='paused' AND placement.ends_at>now() THEN next_status:='active'; event_name:='promotion_started';
  ELSIF requested_action='complete' AND order_row.status IN ('active','paused') THEN next_status:='completed'; event_name:='promotion_ended';
  ELSE RAISE EXCEPTION 'invalid_delivery_transition'; END IF;
  UPDATE public.promotion_placements SET status=CASE next_status WHEN 'active' THEN 'active' WHEN 'paused' THEN 'paused' ELSE 'completed' END,updated_at=now() WHERE id=placement.id;
  UPDATE public.promotion_commercial_orders SET status=next_status,updated_at=now() WHERE id=order_row.id;
  UPDATE public.promotion_requests SET status=next_status,updated_at=now() WHERE id=order_row.request_id;
  INSERT INTO public.promotion_order_status_history(order_id,from_status,to_status,actor_type,actor_reference,reason_code) VALUES(order_row.id,order_row.status,next_status,'admin',admin_actor,requested_action);
  IF event_name IS NOT NULL THEN INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload) VALUES(order_row.owner_user_id,event_name,'order',order_row.id,event_name||':'||order_row.id||':'||next_status,jsonb_build_object('order_id',order_row.id)); END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_generate_promotion_report(
  target_order_id uuid, requested_start date, requested_end date, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_row public.promotion_commercial_orders%ROWTYPE; placement public.promotion_placements%ROWTYPE; report_id uuid; impression_count integer; click_count integer; daily jsonb;
BEGIN
  IF requested_start>requested_end OR requested_end>requested_start+31 THEN RAISE EXCEPTION 'invalid_period'; END IF;
  SELECT * INTO order_row FROM public.promotion_commercial_orders WHERE id=target_order_id FOR UPDATE;
  SELECT * INTO placement FROM public.promotion_placements WHERE request_id=order_row.request_id;
  IF order_row.id IS NULL OR placement.id IS NULL THEN RAISE EXCEPTION 'report_unavailable'; END IF;
  SELECT count(*) INTO impression_count FROM public.promotion_impressions WHERE placement_id=placement.id AND event_date BETWEEN requested_start AND requested_end;
  SELECT count(*) INTO click_count FROM public.promotion_clicks WHERE placement_id=placement.id AND event_date BETWEEN requested_start AND requested_end;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date',metric_day,'impressions',impressions,'clicks',clicks) ORDER BY metric_day),'[]'::jsonb) INTO daily FROM (
    SELECT metric_day, sum(impressions)::integer impressions, sum(clicks)::integer clicks FROM (
      SELECT event_date AS metric_day,count(*) AS impressions,0 AS clicks FROM public.promotion_impressions WHERE placement_id=placement.id AND event_date BETWEEN requested_start AND requested_end GROUP BY event_date
      UNION ALL SELECT event_date AS metric_day,0 AS impressions,count(*) AS clicks FROM public.promotion_clicks WHERE placement_id=placement.id AND event_date BETWEEN requested_start AND requested_end GROUP BY event_date
    ) totals GROUP BY metric_day
  ) grouped;
  INSERT INTO public.promotion_performance_reports(order_id,owner_user_id,period_start,period_end,placement_type,context_key,impressions,clicks,daily_totals,generated_by)
  VALUES(order_row.id,order_row.owner_user_id,requested_start,requested_end,placement.placement_type,placement.context_key,impression_count,click_count,daily,admin_actor)
  ON CONFLICT(order_id,period_start,period_end) DO UPDATE SET impressions=excluded.impressions,clicks=excluded.clicks,daily_totals=excluded.daily_totals,generated_at=now(),generated_by=excluded.generated_by
  RETURNING id INTO report_id;
  INSERT INTO public.promotion_notification_outbox(owner_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  VALUES(order_row.owner_user_id,'performance_report','report',report_id,'performance-report:'||report_id||':'||requested_end,jsonb_build_object('report_id',report_id));
  RETURN report_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_promotion_notification(
  target_notification_id uuid, requested_status text, safe_error_code text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF requested_status NOT IN ('sent','failed','discarded','retry') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.promotion_notification_outbox SET
    status=CASE WHEN requested_status='retry' THEN 'pending' ELSE requested_status END,
    attempts=attempts+1,
    available_at=CASE WHEN requested_status='retry' THEN now()+interval '5 minutes' ELSE available_at END,
    processed_at=CASE WHEN requested_status='sent' THEN now() ELSE NULL END,
    last_error_code=CASE WHEN requested_status='failed' THEN safe_error_code ELSE NULL END
  WHERE id=target_notification_id AND attempts<10;
  IF NOT FOUND THEN RAISE EXCEPTION 'notification_unavailable'; END IF;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('admin',admin_actor,'notification_'||requested_status,'promotion_notification_outbox',target_notification_id,jsonb_build_object('error_code',safe_error_code));
  RETURN true;
END; $$;

ALTER TABLE public.promotion_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_commercial_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_performance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_commercial_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_order_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_payment_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_payment_confirmations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_cancellation_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_notification_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_performance_reports FORCE ROW LEVEL SECURITY;

CREATE POLICY promotion_quotes_owner_select ON public.promotion_quotes FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY promotion_commercial_orders_owner_select ON public.promotion_commercial_orders FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY promotion_order_history_owner_select ON public.promotion_order_status_history FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.promotion_commercial_orders o WHERE o.id=order_id AND o.owner_user_id=auth.uid()));
CREATE POLICY promotion_payment_submissions_owner_select ON public.promotion_payment_submissions FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY promotion_payment_confirmations_owner_select ON public.promotion_payment_confirmations FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.promotion_commercial_orders o WHERE o.id=order_id AND o.owner_user_id=auth.uid()));
CREATE POLICY promotion_cancellations_owner_select ON public.promotion_cancellation_requests FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY promotion_refunds_owner_select ON public.promotion_refunds FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.promotion_commercial_orders o WHERE o.id=order_id AND o.owner_user_id=auth.uid()));
CREATE POLICY promotion_notifications_owner_select ON public.promotion_notification_outbox FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY promotion_performance_reports_owner_select ON public.promotion_performance_reports FOR SELECT TO authenticated USING(owner_user_id=auth.uid());

REVOKE ALL ON TABLE public.promotion_products,public.promotion_quotes,public.promotion_commercial_orders,
  public.promotion_order_status_history,public.promotion_payment_submissions,public.promotion_payment_confirmations,
  public.promotion_cancellation_requests,public.promotion_refunds,public.promotion_notification_outbox,
  public.promotion_performance_reports FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.promotion_products,public.promotion_quotes,public.promotion_commercial_orders,
  public.promotion_order_status_history,public.promotion_payment_submissions,public.promotion_payment_confirmations,
  public.promotion_cancellation_requests,public.promotion_refunds,public.promotion_notification_outbox,
  public.promotion_performance_reports TO service_role;

REVOKE ALL ON FUNCTION public.admin_upsert_promotion_product(uuid,text,text,text,text,integer,integer,integer,integer,integer,integer,text,boolean,boolean,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_approve_and_quote_promotion_request(uuid,uuid,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.respond_own_promotion_quote(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_manual_payment_notice(uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_confirm_manual_payment(uuid,uuid,integer,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.request_promotion_cancellation(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_decide_promotion_cancellation(uuid,text,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_confirm_promotion_refund(uuid,text,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_schedule_promotion_order(uuid,timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_set_promotion_order_delivery(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_generate_promotion_report(uuid,date,date,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_update_promotion_notification(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_promotion_product(uuid,text,text,text,text,integer,integer,integer,integer,integer,integer,text,boolean,boolean,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_approve_and_quote_promotion_request(uuid,uuid,timestamptz,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_own_promotion_quote(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_manual_payment_notice(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_manual_payment(uuid,uuid,integer,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_promotion_cancellation(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_decide_promotion_cancellation(uuid,text,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_promotion_refund(uuid,text,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_schedule_promotion_order(uuid,timestamptz,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_promotion_order_delivery(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_generate_promotion_report(uuid,date,date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_promotion_notification(uuid,text,text,text) TO service_role;
