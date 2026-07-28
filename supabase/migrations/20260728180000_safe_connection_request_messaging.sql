-- PHASE 10C: exact-match discovery, one greeting, one seven-day reminder,
-- accepted-connection text messaging, blocking/reporting and per-connection Instagram consent.
-- LOCAL/DRAFT ONLY. Do not apply this migration to Production without a separate approval.

CREATE OR REPLACE FUNCTION public.connection_text_is_safe(input_text text, max_length integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT input_text IS NOT NULL
    AND char_length(btrim(input_text)) BETWEEN 1 AND max_length
    AND input_text !~* '(https?://|www\.)[^[:space:]]+'
    AND input_text !~* '([A-Za-z0-9-]+\.)+(com|net|org|kr|io|me|co|app|dev)(/[^[:space:]]*)?'
    AND input_text !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[A-Za-z]{2,}'
    AND input_text !~ '(\+?82[- .]?)?(0[0-9]{1,2}[- .]?)?[0-9]{3,4}[- .]?[0-9]{4}'
    AND input_text !~ '(^|[[:space:]])@[A-Za-z0-9._-]{2,30}([[:space:]]|$)'
    AND input_text !~* '(카카오톡|카톡|kakao|인스타그램|instagram|텔레그램|telegram|라인|line)[[:space:]]*(아이디|id)?[[:space:]]*[:：]?[[:space:]]*[A-Za-z0-9@._-]{2,}';
$$;

REVOKE ALL ON FUNCTION public.connection_text_is_safe(text, integer) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.connection_match_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_school_membership_id uuid NOT NULL REFERENCES public.profile_school_memberships(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_user_id <> receiver_user_id)
);

CREATE TABLE public.connection_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_school_membership_id uuid NOT NULL REFERENCES public.profile_school_memberships(id) ON DELETE RESTRICT,
  relationship_type text NOT NULL CHECK (relationship_type IN ('same_class','same_school','senior_junior','club','other')),
  message text NOT NULL CHECK (public.connection_text_is_safe(message, 200)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','not_the_person','blocked','reported','cancelled','expired')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  reminder_sent_at timestamptz,
  reminder_count smallint NOT NULL DEFAULT 0 CHECK (reminder_count IN (0, 1)),
  responded_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_user_id <> receiver_user_id)
);

CREATE UNIQUE INDEX connection_requests_one_active_pair
  ON public.connection_requests (sender_user_id, receiver_user_id)
  WHERE status IN ('pending', 'accepted');
CREATE INDEX connection_requests_receiver_status_idx
  ON public.connection_requests (receiver_user_id, status, sent_at DESC);
CREATE INDEX connection_requests_sender_status_idx
  ON public.connection_requests (sender_user_id, status, sent_at DESC);

CREATE TABLE public.connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.connection_requests(id) ON DELETE RESTRICT,
  user_low_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disconnected','blocked','reported')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  disconnected_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_low_id <> user_high_id),
  CHECK (user_low_id::text < user_high_id::text),
  UNIQUE (user_low_id, user_high_id)
);

CREATE TABLE public.connection_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (public.connection_text_is_safe(message, 500)),
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX connection_messages_connection_sent_idx
  ON public.connection_messages (connection_id, sent_at DESC);

CREATE TABLE public.user_blocks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (blocker_user_id <> blocked_user_id),
  UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE TABLE public.safety_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id uuid REFERENCES public.connection_requests(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.connections(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.connection_messages(id) ON DELETE SET NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('wrong_person','harassment','spam','privacy','other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX safety_reports_status_created_idx ON public.safety_reports (status, created_at DESC);

CREATE TABLE public.connection_instagram_permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  grantor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grantee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (grantor_user_id <> grantee_user_id),
  UNIQUE (connection_id, grantor_user_id, grantee_user_id)
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('connection_request','connection_reminder','request_accepted','request_declined','new_message','connection_ended','instagram_shared','instagram_revoked')),
  request_id uuid REFERENCES public.connection_requests(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.connections(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);

CREATE TABLE public.safety_account_restrictions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('suspended')),
  reason_code text NOT NULL DEFAULT 'safety_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.connection_request_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.sender_user_id <> OLD.sender_user_id
    OR NEW.receiver_user_id <> OLD.receiver_user_id
    OR NEW.target_school_membership_id <> OLD.target_school_membership_id
    OR NEW.relationship_type <> OLD.relationship_type
    OR NEW.message <> OLD.message
    OR NEW.sent_at <> OLD.sent_at THEN
    RAISE EXCEPTION 'connection request content is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER connection_requests_immutable_content
BEFORE UPDATE ON public.connection_requests
FOR EACH ROW EXECUTE FUNCTION public.connection_request_immutable_fields();

CREATE OR REPLACE FUNCTION public.is_current_adult_account(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.adult_eligibility_records a
      WHERE a.user_id = target_user_id
        AND a.adult_eligible = true
        AND a.verification_method = 'self_attestation'
        AND a.policy_version = 'phase10b-2026-07-28'
    )
    AND NOT EXISTS (
      SELECT required_type
      FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) AS required(required_type)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.consent_records c
        WHERE c.user_id = target_user_id
          AND c.consent_type = required_type
          AND c.consented = true
          AND c.policy_version = 'phase10b-2026-07-28'
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.private_profiles p
      WHERE p.owner_user_id = target_user_id AND p.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.safety_account_restrictions r WHERE r.user_id = target_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.find_exact_private_profile_match(
  actor_user_id uuid,
  target_school_id uuid,
  target_graduation_year integer,
  exact_display_name text
)
RETURNS TABLE (match_state text, match_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  matched_count integer;
  matched_user uuid;
  matched_membership uuid;
  token_id uuid;
BEGIN
  IF NOT public.is_current_adult_account(actor_user_id)
    OR target_graduation_year NOT BETWEEN 1900 AND 2200
    OR char_length(btrim(exact_display_name)) NOT BETWEEN 2 AND 50
    OR exact_display_name ~ '^[ᄀ-ᇿ㄰-㆏[:space:]]+$' THEN
    RETURN QUERY SELECT 'request_unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT count(*) INTO matched_count
  FROM public.private_profiles p
  JOIN public.profile_school_memberships m
    ON m.profile_id = p.id AND m.owner_user_id = p.owner_user_id
  WHERE p.status = 'active'
    AND p.owner_user_id <> actor_user_id
    AND m.school_id = target_school_id
    AND m.graduation_year = target_graduation_year
    AND lower(btrim(p.display_name)) = lower(btrim(exact_display_name));

  IF matched_count <> 1 THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT p.owner_user_id, m.id INTO matched_user, matched_membership
  FROM public.private_profiles p
  JOIN public.profile_school_memberships m
    ON m.profile_id = p.id AND m.owner_user_id = p.owner_user_id
  WHERE p.status = 'active'
    AND p.owner_user_id <> actor_user_id
    AND m.school_id = target_school_id
    AND m.graduation_year = target_graduation_year
    AND lower(btrim(p.display_name)) = lower(btrim(exact_display_name));

  IF matched_user IS NULL OR NOT public.is_current_adult_account(matched_user) THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_user_id = actor_user_id AND b.blocked_user_id = matched_user)
       OR (b.blocker_user_id = matched_user AND b.blocked_user_id = actor_user_id)
  ) THEN
    RETURN QUERY SELECT 'request_unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.connections c
    WHERE c.status = 'active'
      AND c.user_low_id = LEAST(actor_user_id, matched_user)
      AND c.user_high_id = GREATEST(actor_user_id, matched_user)
  ) THEN
    RETURN QUERY SELECT 'already_connected'::text, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.connection_requests r
    WHERE r.sender_user_id = actor_user_id AND r.receiver_user_id = matched_user
      AND r.status IN ('pending','accepted')
  ) THEN
    RETURN QUERY SELECT 'already_requested'::text, NULL::uuid;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.connection_requests r
    WHERE r.sender_user_id = actor_user_id AND r.receiver_user_id = matched_user
      AND r.status IN ('declined','not_the_person','blocked','reported','cancelled','expired')
  ) THEN
    RETURN QUERY SELECT 'request_unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.connection_match_tokens (
    requester_user_id, receiver_user_id, target_school_membership_id
  ) VALUES (actor_user_id, matched_user, matched_membership)
  RETURNING id INTO token_id;

  RETURN QUERY SELECT 'match_available'::text, token_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_connection_request(
  actor_user_id uuid,
  opaque_match_token uuid,
  request_relationship text,
  request_message text
)
RETURNS TABLE (created boolean, request_id uuid, request_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  token_row public.connection_match_tokens%ROWTYPE;
  new_request_id uuid;
BEGIN
  IF NOT public.is_current_adult_account(actor_user_id)
    OR request_relationship NOT IN ('same_class','same_school','senior_junior','club','other')
    OR NOT public.connection_text_is_safe(request_message, 200) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'invalid'::text;
    RETURN;
  END IF;

  SELECT * INTO token_row FROM public.connection_match_tokens
  WHERE id = opaque_match_token FOR UPDATE;
  IF NOT FOUND OR token_row.requester_user_id <> actor_user_id
    OR token_row.used_at IS NOT NULL OR token_row.expires_at <= now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text;
    RETURN;
  END IF;

  IF NOT public.is_current_adult_account(token_row.receiver_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_user_id = actor_user_id AND b.blocked_user_id = token_row.receiver_user_id)
         OR (b.blocker_user_id = token_row.receiver_user_id AND b.blocked_user_id = actor_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.connection_requests r
      WHERE r.sender_user_id = actor_user_id AND r.receiver_user_id = token_row.receiver_user_id
    ) THEN
    UPDATE public.connection_match_tokens SET used_at = now() WHERE id = token_row.id;
    RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text;
    RETURN;
  END IF;

  INSERT INTO public.connection_requests (
    sender_user_id, receiver_user_id, target_school_membership_id, relationship_type, message
  ) VALUES (
    actor_user_id, token_row.receiver_user_id, token_row.target_school_membership_id,
    request_relationship, btrim(request_message)
  ) RETURNING id INTO new_request_id;

  UPDATE public.connection_match_tokens SET used_at = now() WHERE id = token_row.id;
  INSERT INTO public.notifications (user_id, kind, request_id)
  VALUES (token_row.receiver_user_id, 'connection_request', new_request_id);

  RETURN QUERY SELECT true, new_request_id, 'pending'::text;
EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT false, NULL::uuid, 'already_requested'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.remind_connection_request(actor_user_id uuid, target_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  receiver uuid;
BEGIN
  UPDATE public.connection_requests
  SET reminder_count = 1, reminder_sent_at = now()
  WHERE id = target_request_id
    AND sender_user_id = actor_user_id
    AND status = 'pending'
    AND reminder_count = 0
    AND sent_at <= now() - interval '7 days'
  RETURNING receiver_user_id INTO receiver;
  IF receiver IS NULL THEN RETURN false; END IF;

  INSERT INTO public.notifications (user_id, kind, request_id)
  VALUES (receiver, 'connection_reminder', target_request_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_connection_request(actor_user_id uuid, target_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.connection_requests
  SET status = 'cancelled', cancelled_at = now(), responded_at = now()
  WHERE id = target_request_id AND sender_user_id = actor_user_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_connection_request(
  actor_user_id uuid,
  target_request_id uuid,
  response_action text,
  report_reason_code text DEFAULT NULL
)
RETURNS TABLE (handled boolean, connection_id uuid, request_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.connection_requests%ROWTYPE;
  new_connection_id uuid;
  next_status text;
BEGIN
  IF response_action NOT IN ('accept','decline','not_the_person','block','report') THEN
    RETURN QUERY SELECT false, NULL::uuid, 'invalid'::text; RETURN;
  END IF;
  SELECT * INTO req FROM public.connection_requests
  WHERE id = target_request_id FOR UPDATE;
  IF NOT FOUND OR req.receiver_user_id <> actor_user_id OR req.status <> 'pending' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text; RETURN;
  END IF;

  IF response_action = 'accept' THEN
    IF EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_user_id = req.sender_user_id AND b.blocked_user_id = req.receiver_user_id)
         OR (b.blocker_user_id = req.receiver_user_id AND b.blocked_user_id = req.sender_user_id)
    ) THEN
      RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text; RETURN;
    END IF;
    UPDATE public.connection_requests SET status = 'accepted', responded_at = now() WHERE id = req.id;
    INSERT INTO public.connections (request_id, user_low_id, user_high_id)
    VALUES (req.id, LEAST(req.sender_user_id, req.receiver_user_id), GREATEST(req.sender_user_id, req.receiver_user_id))
    RETURNING id INTO new_connection_id;
    INSERT INTO public.notifications (user_id, kind, request_id, connection_id)
    VALUES (req.sender_user_id, 'request_accepted', req.id, new_connection_id);
    RETURN QUERY SELECT true, new_connection_id, 'accepted'::text; RETURN;
  END IF;

  next_status := CASE response_action
    WHEN 'decline' THEN 'declined'
    WHEN 'not_the_person' THEN 'not_the_person'
    WHEN 'block' THEN 'blocked'
    ELSE 'reported'
  END;
  UPDATE public.connection_requests SET status = next_status, responded_at = now() WHERE id = req.id;

  IF response_action IN ('block','report') THEN
    INSERT INTO public.user_blocks (blocker_user_id, blocked_user_id)
    VALUES (actor_user_id, req.sender_user_id) ON CONFLICT DO NOTHING;
  END IF;
  IF response_action = 'report' THEN
    IF report_reason_code IS NULL OR report_reason_code NOT IN ('wrong_person','harassment','spam','privacy','other') THEN
      RAISE EXCEPTION 'invalid report reason';
    END IF;
    INSERT INTO public.safety_reports (
      reporter_user_id, reported_user_id, request_id, reason_code
    ) VALUES (actor_user_id, req.sender_user_id, req.id, report_reason_code);
    INSERT INTO public.admin_audit_logs (actor_type, action, target_table, target_id)
    VALUES ('service_role', 'connection_request_reported', 'connection_requests', req.id);
  ELSE
    INSERT INTO public.notifications (user_id, kind, request_id)
    VALUES (req.sender_user_id, 'request_declined', req.id);
  END IF;
  RETURN QUERY SELECT true, NULL::uuid, next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_connection_message(
  actor_user_id uuid,
  target_connection_id uuid,
  message_text text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conn public.connections%ROWTYPE;
  other_user uuid;
  new_message_id uuid;
BEGIN
  IF NOT public.connection_text_is_safe(message_text, 500) THEN RETURN NULL; END IF;
  SELECT * INTO conn FROM public.connections WHERE id = target_connection_id FOR UPDATE;
  IF NOT FOUND OR conn.status <> 'active'
    OR actor_user_id NOT IN (conn.user_low_id, conn.user_high_id) THEN RETURN NULL; END IF;
  other_user := CASE WHEN actor_user_id = conn.user_low_id THEN conn.user_high_id ELSE conn.user_low_id END;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_user_id = actor_user_id AND b.blocked_user_id = other_user)
       OR (b.blocker_user_id = other_user AND b.blocked_user_id = actor_user_id)
  ) OR EXISTS (
    SELECT 1 FROM public.safety_account_restrictions r WHERE r.user_id IN (actor_user_id, other_user)
  ) THEN RETURN NULL; END IF;

  INSERT INTO public.connection_messages (connection_id, sender_user_id, message)
  VALUES (target_connection_id, actor_user_id, btrim(message_text)) RETURNING id INTO new_message_id;
  INSERT INTO public.notifications (user_id, kind, connection_id)
  VALUES (other_user, 'new_message', target_connection_id);
  RETURN new_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_connection_messages_read(actor_user_id uuid, target_connection_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE affected integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.connections c WHERE c.id = target_connection_id
      AND c.status = 'active' AND actor_user_id IN (c.user_low_id, c.user_high_id)
  ) THEN RETURN 0; END IF;
  UPDATE public.connection_messages SET read_at = now()
  WHERE connection_id = target_connection_id AND sender_user_id <> actor_user_id AND read_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_connection(actor_user_id uuid, target_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE conn public.connections%ROWTYPE; other_user uuid;
BEGIN
  SELECT * INTO conn FROM public.connections WHERE id = target_connection_id FOR UPDATE;
  IF NOT FOUND OR conn.status <> 'active' OR actor_user_id NOT IN (conn.user_low_id, conn.user_high_id) THEN RETURN false; END IF;
  other_user := CASE WHEN actor_user_id = conn.user_low_id THEN conn.user_high_id ELSE conn.user_low_id END;
  UPDATE public.connections SET status='disconnected', disconnected_at=now(), disconnected_by_user_id=actor_user_id, updated_at=now() WHERE id=conn.id;
  UPDATE public.connection_instagram_permissions SET status='revoked', revoked_at=now(), updated_at=now() WHERE connection_id=conn.id AND status='active';
  INSERT INTO public.notifications (user_id, kind, connection_id) VALUES (other_user, 'connection_ended', conn.id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_connection_safety(
  actor_user_id uuid,
  target_connection_id uuid,
  target_message_id uuid,
  report_reason_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE conn public.connections%ROWTYPE; other_user uuid; report_id uuid;
BEGIN
  IF report_reason_code NOT IN ('wrong_person','harassment','spam','privacy','other') THEN RETURN false; END IF;
  SELECT * INTO conn FROM public.connections WHERE id=target_connection_id FOR UPDATE;
  IF NOT FOUND OR actor_user_id NOT IN (conn.user_low_id,conn.user_high_id) THEN RETURN false; END IF;
  other_user := CASE WHEN actor_user_id=conn.user_low_id THEN conn.user_high_id ELSE conn.user_low_id END;
  IF target_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.connection_messages m WHERE m.id=target_message_id AND m.connection_id=conn.id
  ) THEN RETURN false; END IF;
  INSERT INTO public.safety_reports (reporter_user_id,reported_user_id,request_id,connection_id,message_id,reason_code)
  VALUES (actor_user_id,other_user,conn.request_id,conn.id,target_message_id,report_reason_code) RETURNING id INTO report_id;
  INSERT INTO public.user_blocks (blocker_user_id,blocked_user_id) VALUES (actor_user_id,other_user) ON CONFLICT DO NOTHING;
  UPDATE public.connections SET status='reported',disconnected_at=now(),disconnected_by_user_id=actor_user_id,updated_at=now() WHERE id=conn.id;
  UPDATE public.connection_instagram_permissions SET status='revoked',revoked_at=now(),updated_at=now() WHERE connection_id=conn.id AND status='active';
  INSERT INTO public.admin_audit_logs (actor_type,action,target_table,target_id)
  VALUES ('service_role','connection_report_created','safety_reports',report_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_connection_user(actor_user_id uuid, target_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE conn public.connections%ROWTYPE; other_user uuid;
BEGIN
  SELECT * INTO conn FROM public.connections WHERE id=target_connection_id FOR UPDATE;
  IF NOT FOUND OR actor_user_id NOT IN (conn.user_low_id,conn.user_high_id) THEN RETURN false; END IF;
  other_user := CASE WHEN actor_user_id=conn.user_low_id THEN conn.user_high_id ELSE conn.user_low_id END;
  INSERT INTO public.user_blocks (blocker_user_id,blocked_user_id) VALUES (actor_user_id,other_user) ON CONFLICT DO NOTHING;
  UPDATE public.connections SET status='blocked',disconnected_at=now(),disconnected_by_user_id=actor_user_id,updated_at=now() WHERE id=conn.id AND status='active';
  UPDATE public.connection_instagram_permissions SET status='revoked',revoked_at=now(),updated_at=now() WHERE connection_id=conn.id AND status='active';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_connection_instagram_permission(
  actor_user_id uuid,
  target_connection_id uuid,
  make_visible boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE conn public.connections%ROWTYPE; other_user uuid;
BEGIN
  SELECT * INTO conn FROM public.connections WHERE id=target_connection_id FOR UPDATE;
  IF NOT FOUND OR conn.status <> 'active' OR actor_user_id NOT IN (conn.user_low_id,conn.user_high_id) THEN RETURN false; END IF;
  other_user := CASE WHEN actor_user_id=conn.user_low_id THEN conn.user_high_id ELSE conn.user_low_id END;
  IF EXISTS (SELECT 1 FROM public.user_blocks b WHERE (b.blocker_user_id=actor_user_id AND b.blocked_user_id=other_user) OR (b.blocker_user_id=other_user AND b.blocked_user_id=actor_user_id)) THEN RETURN false; END IF;
  IF make_visible THEN
    INSERT INTO public.connection_instagram_permissions (connection_id,grantor_user_id,grantee_user_id,status,approved_at,revoked_at)
    VALUES (conn.id,actor_user_id,other_user,'active',now(),NULL)
    ON CONFLICT (connection_id,grantor_user_id,grantee_user_id)
    DO UPDATE SET status='active',approved_at=now(),revoked_at=NULL,updated_at=now();
    INSERT INTO public.notifications (user_id,kind,connection_id) VALUES (other_user,'instagram_shared',conn.id);
  ELSE
    UPDATE public.connection_instagram_permissions SET status='revoked',revoked_at=now(),updated_at=now()
    WHERE connection_id=conn.id AND grantor_user_id=actor_user_id AND grantee_user_id=other_user AND status='active';
    INSERT INTO public.notifications (user_id,kind,connection_id) VALUES (other_user,'instagram_revoked',conn.id);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_connection_safety_action(
  requested_action text,
  target_report_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE report_row public.safety_reports%ROWTYPE; affected integer := 0;
BEGIN
  SELECT * INTO report_row FROM public.safety_reports WHERE id=target_report_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  CASE requested_action
    WHEN 'report_close' THEN
      UPDATE public.safety_reports SET status='closed',reviewed_at=now() WHERE id=report_row.id; GET DIAGNOSTICS affected=ROW_COUNT;
    WHEN 'request_force_close' THEN
      UPDATE public.connection_requests SET status='reported',responded_at=now() WHERE id=report_row.request_id AND status='pending'; GET DIAGNOSTICS affected=ROW_COUNT;
    WHEN 'message_hide' THEN
      UPDATE public.connection_messages SET hidden_at=now() WHERE id=report_row.message_id; GET DIAGNOSTICS affected=ROW_COUNT;
    WHEN 'account_suspend' THEN
      INSERT INTO public.safety_account_restrictions (user_id,status) VALUES (report_row.reported_user_id,'suspended')
      ON CONFLICT (user_id) DO UPDATE SET status='suspended',updated_at=now(); affected := 1;
    WHEN 'account_restore' THEN
      DELETE FROM public.safety_account_restrictions WHERE user_id=report_row.reported_user_id; GET DIAGNOSTICS affected=ROW_COUNT;
    ELSE RETURN false;
  END CASE;
  IF affected <> 1 THEN RETURN false; END IF;
  INSERT INTO public.admin_audit_logs (actor_type,action,target_table,target_id)
  VALUES ('admin',requested_action,'safety_reports',report_row.id);
  RETURN true;
END;
$$;

-- RLS is enabled and forced on every PHASE 10C private table.
ALTER TABLE public.connection_match_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_instagram_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_account_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_match_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE public.connection_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.connections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.connection_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.safety_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE public.connection_instagram_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.safety_account_restrictions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.connection_match_tokens, public.connection_requests, public.connections,
  public.connection_messages, public.user_blocks, public.safety_reports,
  public.connection_instagram_permissions, public.notifications,
  public.safety_account_restrictions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.connection_match_tokens, public.connection_requests, public.connections,
  public.connection_messages, public.user_blocks, public.safety_reports,
  public.connection_instagram_permissions, public.notifications,
  public.safety_account_restrictions TO service_role;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

CREATE POLICY connection_requests_participant_select ON public.connection_requests
  FOR SELECT TO authenticated USING (auth.uid() IN (sender_user_id, receiver_user_id));
CREATE POLICY connections_participant_select ON public.connections
  FOR SELECT TO authenticated USING (auth.uid() IN (user_low_id, user_high_id));
CREATE POLICY connection_messages_participant_select ON public.connection_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.connections c WHERE c.id=connection_id AND auth.uid() IN (c.user_low_id,c.user_high_id)
  ));
CREATE POLICY user_blocks_owner_select ON public.user_blocks
  FOR SELECT TO authenticated USING (blocker_user_id=auth.uid());
CREATE POLICY safety_reports_reporter_select ON public.safety_reports
  FOR SELECT TO authenticated USING (reporter_user_id=auth.uid());
CREATE POLICY instagram_permissions_participant_select ON public.connection_instagram_permissions
  FOR SELECT TO authenticated USING (auth.uid() IN (grantor_user_id,grantee_user_id));
CREATE POLICY notifications_owner_select ON public.notifications
  FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY notifications_owner_update ON public.notifications
  FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

REVOKE ALL ON FUNCTION public.is_current_adult_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_exact_private_profile_match(uuid,uuid,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_connection_request(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remind_connection_request(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_connection_request(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_connection_request(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_connection_message(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_connection_messages_read(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disconnect_connection(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_connection_safety(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_connection_user(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_connection_instagram_permission(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_apply_connection_safety_action(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_adult_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_exact_private_profile_match(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_connection_request(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remind_connection_request(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_connection_request(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_connection_request(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_connection_message(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_connection_messages_read(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.disconnect_connection(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_connection_safety(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.block_connection_user(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_connection_instagram_permission(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_connection_safety_action(text,uuid) TO service_role;
