-- PHASE 10D: Today Instagram editorial discovery and manually reviewed sponsored promotion MVP.
-- LOCAL/DRAFT ONLY. Do not apply this migration to Production without a separate approval.

CREATE OR REPLACE FUNCTION public.promotion_text_is_safe(input_text text, max_length integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT input_text IS NOT NULL
    AND char_length(btrim(input_text)) BETWEEN 1 AND max_length
    AND position(chr(8203) in input_text) = 0
    AND position(chr(8204) in input_text) = 0
    AND position(chr(8205) in input_text) = 0
    AND position(chr(8288) in input_text) = 0
    AND position(chr(65279) in input_text) = 0
    AND input_text !~* '(특정[[:space:]]*사람|사람[[:space:]]*찾아|신상|현재[[:space:]]*위치|학교[[:space:]]*공식[[:space:]]*추천)'
    AND input_text !~* '(미성년자|재학생)[[:space:]]*(인스타|instagram|계정|광고)'
    AND input_text !~* '(도박|불법[[:space:]]*대출|고수익[[:space:]]*보장|성인[[:space:]]*서비스)'
    AND input_text !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[A-Za-z]{2,}'
    AND input_text !~ '(\+?82[- .]?)?(0[0-9]{1,2}[- .]?)?[0-9]{3,4}[- .]?[0-9]{4}';
$$;

CREATE OR REPLACE FUNCTION public.promotion_url_is_safe(input_url text, instagram_only boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT input_url IS NOT NULL
    AND char_length(input_url) BETWEEN 12 AND 500
    AND input_url ~* '^https://[A-Za-z0-9.-]+(?::443)?(?:/[^[:space:]]*)?$'
    AND input_url !~* '^https://(?:localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
    AND input_url !~* '^https://[^/]*@'
    AND (
      instagram_only = false
      OR input_url ~* '^https://(www\.)?instagram\.com/[A-Za-z0-9._-]+/?(?:\?.*)?$'
    );
$$;

CREATE OR REPLACE FUNCTION public.promotion_image_url_is_safe(input_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.promotion_url_is_safe(input_url,false)
    AND input_url ~* '^https://(images\.unsplash\.com|images\.pexels\.com|i\.imgur\.com)/';
$$;

CREATE TABLE public.promotion_accounts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type text NOT NULL CHECK (account_type IN ('personal','business')),
  instagram_url text NOT NULL CHECK (public.promotion_url_is_safe(instagram_url, true)),
  display_name text NOT NULL CHECK (public.promotion_text_is_safe(display_name, 60)),
  business_name text CHECK (business_name IS NULL OR public.promotion_text_is_safe(business_name, 100)),
  business_contact_name text CHECK (business_contact_name IS NULL OR char_length(btrim(business_contact_name)) BETWEEN 2 AND 60),
  business_registration_reference text CHECK (business_registration_reference IS NULL OR char_length(btrim(business_registration_reference)) BETWEEN 4 AND 40),
  business_category text CHECK (business_category IS NULL OR public.promotion_text_is_safe(business_category, 60)),
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification','verified','rejected','suspended')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (account_type='personal' AND business_name IS NULL AND business_contact_name IS NULL AND business_registration_reference IS NULL)
    OR
    (account_type='business' AND business_name IS NOT NULL AND business_contact_name IS NOT NULL AND business_registration_reference IS NOT NULL)
  )
);
CREATE UNIQUE INDEX promotion_accounts_owner_instagram_unique
  ON public.promotion_accounts (owner_user_id, lower(instagram_url));

CREATE TABLE public.promotion_account_verifications (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES public.promotion_accounts(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  method text NOT NULL DEFAULT 'manual_profile_code' CHECK (method='manual_profile_code'),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  verified_by text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at <= created_at + interval '30 minutes')
);
CREATE UNIQUE INDEX promotion_verification_one_open
  ON public.promotion_account_verifications (account_id)
  WHERE used_at IS NULL AND verified_at IS NULL;

CREATE TABLE public.promotion_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.promotion_accounts(id) ON DELETE CASCADE,
  promotion_type text NOT NULL DEFAULT 'sponsored' CHECK (promotion_type='sponsored'),
  title text NOT NULL CHECK (public.promotion_text_is_safe(title, 80)),
  body text NOT NULL CHECK (public.promotion_text_is_safe(body, 300)),
  landing_url text NOT NULL CHECK (public.promotion_url_is_safe(landing_url, false)),
  requested_placement text NOT NULL CHECK (requested_placement IN ('homepage_today','school_page','region_page','content_feed')),
  requested_date date NOT NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  region_code text CHECK (region_code IS NULL OR region_code ~ '^[A-Za-z0-9_-]{2,30}$'),
  school_affiliation_claimed boolean NOT NULL DEFAULT false,
  school_affiliation_verified boolean NOT NULL DEFAULT false,
  rights_confirmed boolean NOT NULL CHECK (rights_confirmed=true),
  adult_and_ownership_confirmed boolean NOT NULL CHECK (adult_and_ownership_confirmed=true),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review','changes_requested','approved','rejected','payment_pending','payment_confirmed',
    'scheduled','active','paused','completed','cancelled','refunded'
  )),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK ((requested_placement <> 'school_page') OR school_id IS NOT NULL),
  CHECK ((requested_placement <> 'region_page') OR region_code IS NOT NULL)
);
CREATE INDEX promotion_requests_owner_status_idx ON public.promotion_requests (owner_user_id, status, submitted_at DESC);

CREATE TABLE public.promotion_assets (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.promotion_requests(id) ON DELETE CASCADE,
  image_url text NOT NULL CHECK (public.promotion_image_url_is_safe(image_url)),
  original_filename_hash text CHECK (original_filename_hash IS NULL OR original_filename_hash ~ '^[0-9a-f]{64}$'),
  rights_confirmed boolean NOT NULL CHECK (rights_confirmed=true),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.promotion_reviews (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES public.promotion_requests(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('changes_requested','approved','rejected')),
  reason_code text NOT NULL CHECK (reason_code IN ('approved','creative','ownership','business','safety','minor_risk','impersonation','illegal','other')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  reviewed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.promotion_orders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.promotion_requests(id) ON DELETE CASCADE,
  amount_krw integer NOT NULL CHECK (amount_krw BETWEEN 1000 AND 100000000),
  currency text NOT NULL DEFAULT 'KRW' CHECK (currency='KRW'),
  payment_method text NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer','external_payment_link')),
  status text NOT NULL DEFAULT 'payment_pending' CHECK (status IN ('payment_pending','payment_confirmed','refunded','cancelled')),
  internal_reference text CHECK (internal_reference IS NULL OR char_length(internal_reference) <= 100),
  confirmed_at timestamptz,
  confirmed_by text,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.promotion_placements (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.promotion_requests(id) ON DELETE CASCADE,
  placement_type text NOT NULL CHECK (placement_type IN ('homepage_today','school_page','region_page','content_feed')),
  context_key text NOT NULL CHECK (context_key ~ '^(global|school:[0-9a-f-]{36}|region:[A-Za-z0-9_-]{2,30})$'),
  slot_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','paused','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  CHECK (ends_at <= starts_at + interval '31 days')
);
CREATE UNIQUE INDEX promotion_placements_slot_conflict
  ON public.promotion_placements (placement_type, context_key, slot_date)
  WHERE status IN ('scheduled','active','paused');

CREATE TABLE public.promotion_impressions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  placement_id uuid NOT NULL REFERENCES public.promotion_placements(id) ON DELETE CASCADE,
  session_hash text NOT NULL CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  event_date date NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '32 days'),
  UNIQUE (placement_id, session_hash, event_date)
);
CREATE INDEX promotion_impressions_placement_date_idx ON public.promotion_impressions (placement_id, event_date);

CREATE TABLE public.promotion_clicks (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  placement_id uuid NOT NULL REFERENCES public.promotion_placements(id) ON DELETE CASCADE,
  session_hash text NOT NULL CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  event_date date NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '32 days'),
  UNIQUE (placement_id, session_hash, event_date)
);
CREATE INDEX promotion_clicks_placement_date_idx ON public.promotion_clicks (placement_id, event_date);

CREATE TABLE public.promotion_reports (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  placement_id uuid NOT NULL REFERENCES public.promotion_placements(id) ON DELETE CASCADE,
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reason_code text NOT NULL CHECK (reason_code IN ('impersonation','inappropriate','misleading','privacy','illegal','minor_risk','copyright')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE UNIQUE INDEX promotion_reports_one_per_actor
  ON public.promotion_reports (placement_id, reporter_user_id, reason_code)
  WHERE reporter_user_id IS NOT NULL;

CREATE TABLE public.promotion_audit_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  actor_type text NOT NULL CHECK (actor_type IN ('applicant','admin','system')),
  actor_reference text,
  action text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.editorial_features (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES public.promotion_accounts(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (public.promotion_text_is_safe(title, 80)),
  body text NOT NULL CHECK (public.promotion_text_is_safe(body, 300)),
  image_url text NOT NULL CHECK (public.promotion_image_url_is_safe(image_url)),
  landing_url text NOT NULL CHECK (public.promotion_url_is_safe(landing_url, false)),
  placement_type text NOT NULL CHECK (placement_type IN ('homepage_today','school_page','region_page','content_feed')),
  context_key text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed','cancelled')),
  economic_consideration boolean NOT NULL DEFAULT false CHECK (economic_consideration=false),
  selected_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at)
);

CREATE OR REPLACE FUNCTION public.create_promotion_account(
  actor_user_id uuid,
  requested_type text,
  requested_instagram_url text,
  requested_display_name text,
  requested_business_name text DEFAULT NULL,
  requested_business_contact_name text DEFAULT NULL,
  requested_business_reference text DEFAULT NULL,
  requested_business_category text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.is_current_adult_account(actor_user_id)
    OR requested_type NOT IN ('personal','business')
    OR NOT public.promotion_url_is_safe(requested_instagram_url, true)
    OR NOT public.promotion_text_is_safe(requested_display_name, 60) THEN RETURN NULL; END IF;
  IF requested_type='personal' AND (requested_business_name IS NOT NULL OR requested_business_contact_name IS NOT NULL OR requested_business_reference IS NOT NULL) THEN RETURN NULL; END IF;
  IF requested_type='business' AND (requested_business_name IS NULL OR requested_business_contact_name IS NULL OR requested_business_reference IS NULL) THEN RETURN NULL; END IF;
  INSERT INTO public.promotion_accounts (
    owner_user_id, account_type, instagram_url, display_name, business_name,
    business_contact_name, business_registration_reference, business_category
  ) VALUES (
    actor_user_id, requested_type, lower(btrim(requested_instagram_url)), btrim(requested_display_name),
    NULLIF(btrim(requested_business_name),''), NULLIF(btrim(requested_business_contact_name),''),
    NULLIF(btrim(requested_business_reference),''), NULLIF(btrim(requested_business_category),'')
  ) RETURNING id INTO new_id;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES ('applicant',actor_user_id::text,'promotion_account_created','promotion_accounts',new_id);
  RETURN new_id;
EXCEPTION WHEN unique_violation THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_promotion_verification(
  actor_user_id uuid, target_account_id uuid, requested_code_hash text, requested_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE verification_id uuid;
BEGIN
  IF requested_code_hash !~ '^[0-9a-f]{64}$' OR requested_expires_at <= now() OR requested_expires_at > now()+interval '30 minutes' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.promotion_accounts a WHERE a.id=target_account_id AND a.owner_user_id=actor_user_id AND a.status='pending_verification') THEN RETURN NULL; END IF;
  UPDATE public.promotion_account_verifications SET used_at=now()
  WHERE account_id=target_account_id AND used_at IS NULL AND verified_at IS NULL;
  INSERT INTO public.promotion_account_verifications(account_id,code_hash,expires_at)
  VALUES (target_account_id,requested_code_hash,requested_expires_at) RETURNING id INTO verification_id;
  RETURN verification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_promotion_request(
  actor_user_id uuid, target_account_id uuid, requested_title text, requested_body text,
  requested_image_url text, requested_landing_url text, requested_placement text,
  requested_slot_date date, requested_school_id uuid DEFAULT NULL, requested_region_code text DEFAULT NULL,
  claimed_school_affiliation boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE request_id uuid;
BEGIN
  IF NOT public.is_current_adult_account(actor_user_id)
    OR NOT public.promotion_text_is_safe(requested_title,80)
    OR NOT public.promotion_text_is_safe(requested_body,300)
    OR NOT public.promotion_image_url_is_safe(requested_image_url)
    OR NOT public.promotion_url_is_safe(requested_landing_url,false)
    OR requested_placement NOT IN ('homepage_today','school_page','region_page','content_feed')
    OR requested_slot_date < (now() AT TIME ZONE 'Asia/Seoul')::date THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.promotion_accounts a WHERE a.id=target_account_id AND a.owner_user_id=actor_user_id AND a.status='verified') THEN RETURN NULL; END IF;
  IF requested_placement='school_page' AND requested_school_id IS NULL THEN RETURN NULL; END IF;
  IF requested_placement='region_page' AND (requested_region_code IS NULL OR requested_region_code !~ '^[A-Za-z0-9_-]{2,30}$') THEN RETURN NULL; END IF;
  INSERT INTO public.promotion_requests(
    owner_user_id,account_id,title,body,landing_url,requested_placement,requested_date,
    school_id,region_code,school_affiliation_claimed,rights_confirmed,adult_and_ownership_confirmed
  ) VALUES (
    actor_user_id,target_account_id,btrim(requested_title),btrim(requested_body),btrim(requested_landing_url),
    requested_placement,requested_slot_date,requested_school_id,requested_region_code,
    claimed_school_affiliation,true,true
  ) RETURNING id INTO request_id;
  INSERT INTO public.promotion_assets(request_id,image_url,rights_confirmed)
  VALUES (request_id,btrim(requested_image_url),true);
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES ('applicant',actor_user_id::text,'promotion_request_submitted','promotion_requests',request_id);
  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_verify_promotion_account(
  target_verification_id uuid, submitted_code_hash text, admin_actor text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v public.promotion_account_verifications%ROWTYPE;
BEGIN
  IF admin_actor IS NULL OR char_length(admin_actor)>100 OR submitted_code_hash !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  SELECT * INTO v FROM public.promotion_account_verifications WHERE id=target_verification_id FOR UPDATE;
  IF NOT FOUND OR v.used_at IS NOT NULL OR v.verified_at IS NOT NULL OR v.expires_at<=now() OR v.code_hash<>submitted_code_hash THEN RETURN false; END IF;
  UPDATE public.promotion_account_verifications SET verified_at=now(),used_at=now(),verified_by=admin_actor WHERE id=v.id;
  UPDATE public.promotion_accounts SET status='verified',verified_at=now(),updated_at=now() WHERE id=v.account_id AND status='pending_verification';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES ('admin',admin_actor,'instagram_ownership_verified','promotion_accounts',v.account_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_promotion_request(
  target_request_id uuid, review_action text, review_reason text, review_note text,
  admin_actor text, approved_amount_krw integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE next_status text; affected integer;
BEGIN
  IF review_action NOT IN ('changes_requested','approved','rejected') OR review_reason NOT IN ('approved','creative','ownership','business','safety','minor_risk','impersonation','illegal','other') OR admin_actor IS NULL THEN RETURN false; END IF;
  next_status:=review_action;
  IF review_action='approved' THEN
    IF approved_amount_krw IS NULL OR approved_amount_krw<1000 THEN RETURN false; END IF;
    next_status:='payment_pending';
  END IF;
  UPDATE public.promotion_requests SET status=next_status,updated_at=now()
  WHERE id=target_request_id AND status IN ('pending_review','changes_requested');
  GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RETURN false; END IF;
  INSERT INTO public.promotion_reviews(request_id,action,reason_code,note,reviewed_by)
  VALUES(target_request_id,review_action,review_reason,NULLIF(btrim(review_note),''),admin_actor);
  IF review_action='approved' THEN
    UPDATE public.promotion_assets SET review_status='approved',approved_at=now() WHERE request_id=target_request_id;
    INSERT INTO public.promotion_orders(request_id,amount_krw) VALUES(target_request_id,approved_amount_krw);
  END IF;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES('admin',admin_actor,'promotion_'||review_action,'promotion_requests',target_request_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_promotion_payment(
  target_request_id uuid, payment_reference text, admin_actor text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE affected integer;
BEGIN
  IF payment_reference IS NULL OR char_length(payment_reference)>100 OR admin_actor IS NULL THEN RETURN false; END IF;
  UPDATE public.promotion_orders SET status='payment_confirmed',internal_reference=payment_reference,confirmed_at=now(),confirmed_by=admin_actor,updated_at=now()
  WHERE request_id=target_request_id AND status='payment_pending';
  GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RETURN false; END IF;
  UPDATE public.promotion_requests SET status='payment_confirmed',updated_at=now() WHERE id=target_request_id AND status='payment_pending';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES('admin',admin_actor,'payment_confirmed','promotion_requests',target_request_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_schedule_promotion(
  target_request_id uuid, scheduled_starts_at timestamptz, scheduled_ends_at timestamptz,
  admin_actor text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE req public.promotion_requests%ROWTYPE; placement_id uuid; context text;
BEGIN
  IF admin_actor IS NULL OR scheduled_starts_at>=scheduled_ends_at OR scheduled_ends_at>scheduled_starts_at+interval '31 days' THEN RETURN NULL; END IF;
  SELECT * INTO req FROM public.promotion_requests WHERE id=target_request_id FOR UPDATE;
  IF NOT FOUND OR req.status<>'payment_confirmed' OR NOT EXISTS(SELECT 1 FROM public.promotion_orders o WHERE o.request_id=req.id AND o.status='payment_confirmed') OR NOT EXISTS(SELECT 1 FROM public.promotion_assets a WHERE a.request_id=req.id AND a.review_status='approved') THEN RETURN NULL; END IF;
  context:=CASE req.requested_placement WHEN 'school_page' THEN 'school:'||req.school_id::text WHEN 'region_page' THEN 'region:'||req.region_code ELSE 'global' END;
  INSERT INTO public.promotion_placements(request_id,placement_type,context_key,slot_date,starts_at,ends_at)
  VALUES(req.id,req.requested_placement,context,(scheduled_starts_at AT TIME ZONE 'Asia/Seoul')::date,scheduled_starts_at,scheduled_ends_at)
  RETURNING id INTO placement_id;
  UPDATE public.promotion_requests SET status='scheduled',updated_at=now() WHERE id=req.id;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES('admin',admin_actor,'promotion_scheduled','promotion_placements',placement_id);
  RETURN placement_id;
EXCEPTION WHEN unique_violation THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_promotion_delivery_status(
  target_placement_id uuid, requested_action text, admin_actor text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE next_status text; request_status text; request_id_value uuid; affected integer;
BEGIN
  IF requested_action NOT IN ('activate','pause','resume','complete','cancel','refund') OR admin_actor IS NULL THEN RETURN false; END IF;
  next_status:=CASE requested_action WHEN 'activate' THEN 'active' WHEN 'resume' THEN 'active' WHEN 'pause' THEN 'paused' WHEN 'complete' THEN 'completed' ELSE 'cancelled' END;
  UPDATE public.promotion_placements SET status=next_status,updated_at=now()
  WHERE id=target_placement_id AND (
    (requested_action='activate' AND status='scheduled' AND starts_at<=now() AND ends_at>now()) OR
    (requested_action='pause' AND status='active') OR (requested_action='resume' AND status='paused' AND ends_at>now()) OR
    (requested_action='complete' AND status IN ('active','paused') AND ends_at<=now()) OR
    (requested_action IN ('cancel','refund') AND status IN ('scheduled','active','paused'))
  ) RETURNING request_id INTO request_id_value;
  GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RETURN false; END IF;
  request_status:=CASE requested_action WHEN 'activate' THEN 'active' WHEN 'resume' THEN 'active' WHEN 'pause' THEN 'paused' WHEN 'complete' THEN 'completed' WHEN 'refund' THEN 'refunded' ELSE 'cancelled' END;
  UPDATE public.promotion_requests SET status=request_status,updated_at=now() WHERE id=request_id_value;
  IF requested_action='refund' THEN UPDATE public.promotion_orders SET status='refunded',refunded_at=now(),updated_at=now() WHERE request_id=request_id_value AND status='payment_confirmed'; END IF;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES('admin',admin_actor,'promotion_'||requested_action,'promotion_placements',target_placement_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_promotion_impression(
  target_placement_id uuid, safe_session_hash text, safe_event_date date, is_bot boolean, is_admin_view boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF is_bot OR is_admin_view OR safe_session_hash !~ '^[0-9a-f]{64}$' OR safe_event_date<>(now() AT TIME ZONE 'Asia/Seoul')::date THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.promotion_placements p WHERE p.id=target_placement_id AND p.status='active' AND p.starts_at<=now() AND p.ends_at>now()) THEN RETURN false; END IF;
  INSERT INTO public.promotion_impressions(placement_id,session_hash,event_date)
  VALUES(target_placement_id,safe_session_hash,safe_event_date) ON CONFLICT DO NOTHING;
  DELETE FROM public.promotion_impressions WHERE expires_at<now();
  DELETE FROM public.promotion_clicks WHERE expires_at<now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_promotion_click(
  target_placement_id uuid, safe_session_hash text, safe_event_date date, is_bot boolean, is_admin_view boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE destination text;
BEGIN
  IF is_bot OR is_admin_view OR safe_session_hash !~ '^[0-9a-f]{64}$' OR safe_event_date<>(now() AT TIME ZONE 'Asia/Seoul')::date THEN RETURN NULL; END IF;
  SELECT r.landing_url INTO destination FROM public.promotion_placements p JOIN public.promotion_requests r ON r.id=p.request_id
  WHERE p.id=target_placement_id AND p.status='active' AND p.starts_at<=now() AND p.ends_at>now();
  IF destination IS NULL OR NOT public.promotion_url_is_safe(destination,false) THEN RETURN NULL; END IF;
  INSERT INTO public.promotion_clicks(placement_id,session_hash,event_date)
  VALUES(target_placement_id,safe_session_hash,safe_event_date) ON CONFLICT DO NOTHING;
  RETURN destination;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_public_promotion(
  actor_user_id uuid, target_placement_id uuid, report_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE report_id uuid; request_id_value uuid;
BEGIN
  IF actor_user_id IS NULL OR report_reason NOT IN ('impersonation','inappropriate','misleading','privacy','illegal','minor_risk','copyright') THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.promotion_placements p WHERE p.id=target_placement_id AND p.status IN ('active','paused')) THEN RETURN false; END IF;
  INSERT INTO public.promotion_reports(placement_id,reporter_user_id,reason_code)
  VALUES(target_placement_id,actor_user_id,report_reason) RETURNING id INTO report_id;
  IF report_reason IN ('impersonation','privacy','illegal','minor_risk') THEN
    UPDATE public.promotion_placements SET status='paused',updated_at=now() WHERE id=target_placement_id AND status='active' RETURNING request_id INTO request_id_value;
    IF request_id_value IS NOT NULL THEN UPDATE public.promotion_requests SET status='paused',updated_at=now() WHERE id=request_id_value; END IF;
  END IF;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id,metadata)
  VALUES('system','report','promotion_report_received','promotion_reports',report_id,jsonb_build_object('emergency_pause',request_id_value IS NOT NULL));
  RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_own_promotion_request(
  actor_user_id uuid, target_request_id uuid, requested_title text, requested_body text,
  requested_image_url text, requested_landing_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE affected integer;
BEGIN
  IF NOT public.promotion_text_is_safe(requested_title,80)
    OR NOT public.promotion_text_is_safe(requested_body,300)
    OR NOT public.promotion_image_url_is_safe(requested_image_url)
    OR NOT public.promotion_url_is_safe(requested_landing_url,false) THEN RETURN false; END IF;
  UPDATE public.promotion_requests SET title=btrim(requested_title),body=btrim(requested_body),
    landing_url=btrim(requested_landing_url),status='pending_review',updated_at=now()
  WHERE id=target_request_id AND owner_user_id=actor_user_id AND status='changes_requested';
  GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RETURN false; END IF;
  UPDATE public.promotion_assets SET image_url=btrim(requested_image_url),review_status='pending',approved_at=NULL
  WHERE request_id=target_request_id;
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES('applicant',actor_user_id::text,'promotion_request_revised','promotion_requests',target_request_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_promotion_request(actor_user_id uuid, target_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.promotion_requests SET status='cancelled',cancelled_at=now(),updated_at=now()
  WHERE id=target_request_id AND owner_user_id=actor_user_id
    AND status IN ('pending_review','changes_requested','payment_pending');
  GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RETURN false; END IF;
  UPDATE public.promotion_orders SET status='cancelled',updated_at=now()
  WHERE request_id=target_request_id AND status='payment_pending';
  INSERT INTO public.promotion_audit_logs(actor_type,actor_reference,action,target_table,target_id)
  VALUES('applicant',actor_user_id::text,'promotion_request_cancelled','promotion_requests',target_request_id);
  RETURN true;
END;
$$;

-- Every promotion domain table is private by default.
ALTER TABLE public.promotion_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_account_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_account_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_placements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_impressions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_clicks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_features FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.promotion_accounts,public.promotion_account_verifications,public.promotion_requests,
  public.promotion_assets,public.promotion_reviews,public.promotion_orders,public.promotion_placements,
  public.promotion_impressions,public.promotion_clicks,public.promotion_reports,public.promotion_audit_logs,
  public.editorial_features FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.promotion_accounts,public.promotion_account_verifications,public.promotion_requests,
  public.promotion_assets,public.promotion_reviews,public.promotion_orders,public.promotion_placements,
  public.promotion_impressions,public.promotion_clicks,public.promotion_reports,public.promotion_audit_logs,
  public.editorial_features TO service_role;

CREATE POLICY promotion_accounts_owner_select ON public.promotion_accounts FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY promotion_verifications_owner_select ON public.promotion_account_verifications FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.promotion_accounts a WHERE a.id=account_id AND a.owner_user_id=auth.uid()));
CREATE POLICY promotion_requests_owner_select ON public.promotion_requests FOR SELECT TO authenticated USING(owner_user_id=auth.uid());
CREATE POLICY promotion_assets_owner_select ON public.promotion_assets FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.promotion_requests r WHERE r.id=request_id AND r.owner_user_id=auth.uid()));
CREATE POLICY promotion_reviews_owner_select ON public.promotion_reviews FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.promotion_requests r WHERE r.id=request_id AND r.owner_user_id=auth.uid()));
CREATE POLICY promotion_orders_owner_select ON public.promotion_orders FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.promotion_requests r WHERE r.id=request_id AND r.owner_user_id=auth.uid()));
CREATE POLICY promotion_placements_owner_select ON public.promotion_placements FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.promotion_requests r WHERE r.id=request_id AND r.owner_user_id=auth.uid()));
CREATE POLICY promotion_reports_owner_select ON public.promotion_reports FOR SELECT TO authenticated USING(reporter_user_id=auth.uid());

REVOKE ALL ON FUNCTION public.promotion_text_is_safe(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.promotion_url_is_safe(text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.promotion_image_url_is_safe(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_promotion_account(uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.issue_promotion_verification(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_promotion_request(uuid,uuid,text,text,text,text,text,date,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_verify_promotion_account(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_review_promotion_request(uuid,text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_confirm_promotion_payment(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_schedule_promotion(uuid,timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_set_promotion_delivery_status(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_promotion_impression(uuid,text,date,boolean,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_promotion_click(uuid,text,date,boolean,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.report_public_promotion(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revise_own_promotion_request(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cancel_own_promotion_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_promotion_account(uuid,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_promotion_verification(uuid,uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_promotion_request(uuid,uuid,text,text,text,text,text,date,uuid,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_verify_promotion_account(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_promotion_request(uuid,text,text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_promotion_payment(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_schedule_promotion(uuid,timestamptz,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_promotion_delivery_status(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_promotion_impression(uuid,text,date,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_promotion_click(uuid,text,date,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_public_promotion(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revise_own_promotion_request(uuid,uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_own_promotion_request(uuid,uuid) TO service_role;
