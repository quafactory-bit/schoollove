-- PHASE 10V: harden dormant exact people discovery without enabling it.
-- This additive migration replaces existing functions only; it creates no schema objects.
BEGIN;

CREATE OR REPLACE FUNCTION public.connection_text_is_safe(input_text text, max_length integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT normalize(input_text, NFKC) AS normalized_text
  ), derived AS (
    SELECT normalized_text,
      regexp_replace(normalized_text, '[[:space:]().-]', '', 'g') AS compact_phone,
      regexp_replace(lower(normalized_text), '[[:space:]._:：()\[\]{}-]', '', 'g') AS compact_provider,
      regexp_replace(normalized_text, '[()\[\]{}]', ' ', 'g') AS handle_spaced
    FROM normalized
  )
  SELECT input_text IS NOT NULL
    AND char_length(btrim(normalized_text)) BETWEEN 1 AND max_length
    AND position(chr(8203) in input_text) = 0
    AND position(chr(8204) in input_text) = 0
    AND position(chr(8205) in input_text) = 0
    AND position(chr(8288) in input_text) = 0
    AND position(chr(65279) in input_text) = 0
    AND normalized_text !~* '(https?://|www\.)[^[:space:]]+'
    AND normalized_text !~* '([A-Za-z0-9-]+\.)+(com|net|org|kr|io|me|co|app|dev)(/[^[:space:]]*)?'
    AND normalized_text !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[A-Za-z]{2,}'
    AND normalized_text !~ '(\+?82[- .]?)?(0[0-9]{1,2}[- .]?)?[0-9]{3,4}[- .]?[0-9]{4}'
    AND compact_phone !~ '(\+?82)?0?10[0-9]{7,8}'
    AND handle_spaced !~ '(^|[[:space:]])@[A-Za-z0-9._-]{2,30}([[:space:],.!?]|$)'
    AND normalized_text !~* '(카카오톡|카카오|카톡|kakao|인스타그램|인스타|instagram|텔레그램|telegram|라인|line)[[:space:]]*(아이디|id)?[[:space:]]*[:：]?[[:space:]]*[A-Za-z0-9@._-]{2,}'
    AND normalized_text !~* '(^|[^[:alnum:]])[A-Za-z0-9-]{2,}[[:space:]]+(dot|점)[[:space:]]+(com|net|org|kr|io|me|co|app|dev)([^[:alnum:]]|$)'
    AND compact_provider !~* '(kakao|instagram|telegram|line)id[A-Za-z0-9@._-]{2,}'
  FROM derived;
$$;

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
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.account_deletion_requests d
      WHERE d.user_id = target_user_id AND d.status <> 'rejected'
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
  opaque_token uuid;
BEGIN
  IF actor_user_id IS NULL OR target_school_id IS NULL OR exact_display_name IS NULL
    OR EXISTS (
      SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped'
    )
    OR NOT public.has_beta_feature_access(actor_user_id,'people_search')
    OR NOT public.is_current_adult_account(actor_user_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.profile_school_memberships actor_membership
      WHERE actor_membership.owner_user_id = actor_user_id
        AND actor_membership.school_id = target_school_id
    )
    OR target_graduation_year NOT BETWEEN 1900 AND 2200
    OR char_length(btrim(normalize(exact_display_name,NFKC))) NOT BETWEEN 2 AND 50
    OR normalize(exact_display_name,NFKC) ~ '^[ᄀ-ᇿ㄰-㆏[:space:]]+$' THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
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
    AND lower(btrim(normalize(p.display_name,NFKC))) = lower(btrim(normalize(exact_display_name,NFKC)));

  IF matched_count <> 1 THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
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
    AND lower(btrim(normalize(p.display_name,NFKC))) = lower(btrim(normalize(exact_display_name,NFKC)));

  IF matched_user IS NULL OR NOT public.is_current_adult_account(matched_user)
    OR EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_user_id = actor_user_id AND b.blocked_user_id = matched_user)
         OR (b.blocker_user_id = matched_user AND b.blocked_user_id = actor_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.status = 'active'
        AND c.user_low_id = LEAST(actor_user_id, matched_user)
        AND c.user_high_id = GREATEST(actor_user_id, matched_user)
    )
    OR EXISTS (
      SELECT 1 FROM public.connection_requests r
      WHERE r.pair_low_id = LEAST(actor_user_id, matched_user)
        AND r.pair_high_id = GREATEST(actor_user_id, matched_user)
    ) THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  opaque_token := extensions.uuid_generate_v4();
  INSERT INTO public.connection_match_tokens (
    token_hash, requester_user_id, receiver_user_id, target_school_membership_id
  ) VALUES (
    encode(extensions.digest(convert_to(opaque_token::text, 'UTF8'), 'sha256'), 'hex'),
    actor_user_id, matched_user, matched_membership
  );

  RETURN QUERY SELECT 'match_available'::text, opaque_token;
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
  target_school uuid;
  new_request_id uuid;
BEGIN
  SELECT * INTO token_row FROM public.connection_match_tokens
  WHERE token_hash = encode(
    extensions.digest(convert_to(opaque_match_token::text, 'UTF8'), 'sha256'), 'hex'
  ) FOR UPDATE;
  IF NOT FOUND OR token_row.requester_user_id <> actor_user_id
    OR token_row.used_at IS NOT NULL OR token_row.expires_at <= now() THEN
    RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text;
    RETURN;
  END IF;

  IF request_relationship NOT IN ('same_class','same_school','senior_junior','club','other')
    OR NOT public.connection_text_is_safe(request_message, 200)
    OR EXISTS (
      SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped'
    )
    OR NOT public.has_beta_feature_access(actor_user_id,'people_search')
    OR NOT public.has_beta_feature_access(actor_user_id,'connection_request')
    OR NOT public.is_current_adult_account(actor_user_id) THEN
    UPDATE public.connection_match_tokens SET used_at = now() WHERE id = token_row.id;
    RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text;
    RETURN;
  END IF;

  SELECT membership.school_id INTO target_school
  FROM public.profile_school_memberships membership
  WHERE membership.id = token_row.target_school_membership_id
    AND membership.owner_user_id = token_row.receiver_user_id;

  IF target_school IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.profile_school_memberships actor_membership
      WHERE actor_membership.owner_user_id = actor_user_id
        AND actor_membership.school_id = target_school
    )
    OR NOT public.is_current_adult_account(token_row.receiver_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_user_id = actor_user_id AND b.blocked_user_id = token_row.receiver_user_id)
         OR (b.blocker_user_id = token_row.receiver_user_id AND b.blocked_user_id = actor_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.connection_requests r
      WHERE r.pair_low_id = LEAST(actor_user_id, token_row.receiver_user_id)
        AND r.pair_high_id = GREATEST(actor_user_id, token_row.receiver_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.status = 'active'
        AND c.user_low_id = LEAST(actor_user_id, token_row.receiver_user_id)
        AND c.user_high_id = GREATEST(actor_user_id, token_row.receiver_user_id)
    ) THEN
    UPDATE public.connection_match_tokens SET used_at = now() WHERE id = token_row.id;
    RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text;
    RETURN;
  END IF;

  UPDATE public.connection_match_tokens SET used_at = now() WHERE id = token_row.id;
  INSERT INTO public.connection_requests (
    sender_user_id, receiver_user_id, target_school_membership_id, relationship_type, message
  ) VALUES (
    actor_user_id, token_row.receiver_user_id, token_row.target_school_membership_id,
    request_relationship, btrim(normalize(request_message,NFKC))
  ) RETURNING id INTO new_request_id;

  INSERT INTO public.notifications (user_id, kind, request_id)
  VALUES (token_row.receiver_user_id, 'connection_request', new_request_id);

  RETURN QUERY SELECT true, new_request_id, 'pending'::text;
EXCEPTION WHEN unique_violation THEN
  IF token_row.id IS NOT NULL THEN
    UPDATE public.connection_match_tokens SET used_at = now() WHERE id = token_row.id;
  END IF;
  RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.remind_connection_request(actor_user_id uuid, target_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.connection_requests%ROWTYPE;
  target_school uuid;
BEGIN
  SELECT * INTO req FROM public.connection_requests
  WHERE id = target_request_id FOR UPDATE;
  IF NOT FOUND OR req.sender_user_id <> actor_user_id OR req.status <> 'pending'
    OR req.reminder_count <> 0 OR req.sent_at > now() - interval '7 days' THEN
    RETURN false;
  END IF;

  IF EXISTS (
      SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped'
    )
    OR NOT public.has_beta_feature_access(actor_user_id,'people_search')
    OR NOT public.has_beta_feature_access(actor_user_id,'connection_request')
    OR NOT public.is_current_adult_account(actor_user_id)
    OR NOT public.is_current_adult_account(req.receiver_user_id) THEN
    RETURN false;
  END IF;

  SELECT membership.school_id INTO target_school
  FROM public.profile_school_memberships membership
  WHERE membership.id = req.target_school_membership_id
    AND membership.owner_user_id = req.receiver_user_id;
  IF target_school IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profile_school_memberships actor_membership
      WHERE actor_membership.owner_user_id = actor_user_id
        AND actor_membership.school_id = target_school
    ) OR EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_user_id = actor_user_id AND b.blocked_user_id = req.receiver_user_id)
         OR (b.blocker_user_id = req.receiver_user_id AND b.blocked_user_id = actor_user_id)
    ) THEN
    RETURN false;
  END IF;

  UPDATE public.connection_requests
  SET reminder_count = 1, reminder_sent_at = now()
  WHERE id = req.id;
  INSERT INTO public.notifications (user_id, kind, request_id)
  VALUES (req.receiver_user_id, 'connection_reminder', req.id);
  RETURN true;
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
  IF response_action NOT IN ('accept','decline','not_the_person','block','report')
    OR (response_action = 'report' AND (
      report_reason_code IS NULL OR report_reason_code NOT IN ('wrong_person','harassment','spam','privacy','other')
    )) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'invalid'::text;
    RETURN;
  END IF;

  SELECT * INTO req FROM public.connection_requests
  WHERE id = target_request_id FOR UPDATE;
  IF NOT FOUND OR req.receiver_user_id <> actor_user_id OR req.status <> 'pending' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text;
    RETURN;
  END IF;

  IF response_action = 'accept' THEN
    IF EXISTS (
        SELECT 1 FROM public.public_account_launch_control control
        WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped'
      )
      OR NOT public.has_beta_feature_access(actor_user_id,'people_search')
      OR NOT public.has_beta_feature_access(actor_user_id,'connection_request')
      OR NOT public.is_current_adult_account(req.sender_user_id)
      OR NOT public.is_current_adult_account(req.receiver_user_id)
      OR req.target_school_membership_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.profile_school_memberships membership
        WHERE membership.id = req.target_school_membership_id
          AND membership.owner_user_id = req.receiver_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_user_id = req.sender_user_id AND b.blocked_user_id = req.receiver_user_id)
           OR (b.blocker_user_id = req.receiver_user_id AND b.blocked_user_id = req.sender_user_id)
      ) THEN
      RETURN QUERY SELECT false, NULL::uuid, 'unavailable'::text;
      RETURN;
    END IF;

    UPDATE public.connection_requests SET status = 'accepted', responded_at = now() WHERE id = req.id;
    INSERT INTO public.connections (request_id, user_low_id, user_high_id)
    VALUES (req.id, LEAST(req.sender_user_id, req.receiver_user_id), GREATEST(req.sender_user_id, req.receiver_user_id))
    RETURNING id INTO new_connection_id;
    INSERT INTO public.notifications (user_id, kind, request_id, connection_id)
    VALUES (req.sender_user_id, 'request_accepted', req.id, new_connection_id);
    RETURN QUERY SELECT true, new_connection_id, 'accepted'::text;
    RETURN;
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

REVOKE ALL ON FUNCTION public.connection_text_is_safe(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.is_current_adult_account(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.find_exact_private_profile_match(uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_connection_request(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.remind_connection_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.respond_connection_request(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_adult_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_exact_private_profile_match(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_connection_request(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remind_connection_request(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_connection_request(uuid,uuid,text,text) TO service_role;

COMMIT;
