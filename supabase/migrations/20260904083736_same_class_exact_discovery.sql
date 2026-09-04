-- SAME_CLASS_EXACT_DISCOVERY: additive, service-role-only exact class matching.
-- Existing exact-person matching remains untouched; no schema objects are created.
BEGIN;

CREATE OR REPLACE FUNCTION public.find_exact_private_profile_class_match(
  actor_user_id uuid,
  target_school_id uuid,
  target_graduation_year integer,
  target_grade_number integer,
  target_class_number integer,
  exact_display_name text
)
RETURNS TABLE (match_state text, match_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  school_type_authority text;
  maximum_grade integer;
  matched_count integer;
  matched_user uuid;
  matched_membership uuid;
  opaque_token uuid;
BEGIN
  SELECT school.school_type
  INTO school_type_authority
  FROM public.schools school
  WHERE school.id = target_school_id;

  maximum_grade := CASE school_type_authority
    WHEN 'elementary' THEN 6
    WHEN 'middle' THEN 3
    WHEN 'high' THEN 3
    ELSE NULL
  END;

  IF actor_user_id IS NULL OR target_school_id IS NULL OR exact_display_name IS NULL
    OR target_graduation_year NOT BETWEEN 1900 AND 2200
    OR target_grade_number NOT BETWEEN 1 AND 6
    OR target_class_number NOT BETWEEN 1 AND 100
    OR maximum_grade IS NULL
    OR target_grade_number > maximum_grade
    OR EXISTS (
      SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped'
    )
    OR NOT public.has_beta_feature_access(actor_user_id, 'people_search')
    OR NOT public.is_current_adult_account(actor_user_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profile_school_memberships actor_membership
      JOIN public.profile_school_class_histories actor_history
        ON actor_history.membership_id = actor_membership.id
        AND actor_history.owner_user_id = actor_user_id
      WHERE actor_membership.owner_user_id = actor_user_id
        AND actor_membership.school_id = target_school_id
        AND actor_membership.graduation_year = target_graduation_year
        AND actor_history.grade_number = target_grade_number
        AND actor_history.class_number = target_class_number
    )
    OR char_length(btrim(normalize(exact_display_name, NFKC))) NOT BETWEEN 2 AND 50
    OR normalize(exact_display_name, NFKC) ~ '^[ᄀ-ᇿ㄰-㆏[:space:]]+$'
  THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT count(*) INTO matched_count
  FROM public.private_profiles profile
  JOIN public.profile_school_memberships membership
    ON membership.profile_id = profile.id AND membership.owner_user_id = profile.owner_user_id
  JOIN public.profile_school_class_histories history
    ON history.membership_id = membership.id AND history.owner_user_id = profile.owner_user_id
  WHERE profile.status = 'active'
    AND profile.owner_user_id <> actor_user_id
    AND membership.school_id = target_school_id
    AND membership.graduation_year = target_graduation_year
    AND history.grade_number = target_grade_number
    AND history.class_number = target_class_number
    AND lower(btrim(normalize(profile.display_name, NFKC))) = lower(btrim(normalize(exact_display_name, NFKC)));

  IF matched_count <> 1 THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT profile.owner_user_id, membership.id
  INTO matched_user, matched_membership
  FROM public.private_profiles profile
  JOIN public.profile_school_memberships membership
    ON membership.profile_id = profile.id AND membership.owner_user_id = profile.owner_user_id
  JOIN public.profile_school_class_histories history
    ON history.membership_id = membership.id AND history.owner_user_id = profile.owner_user_id
  WHERE profile.status = 'active'
    AND profile.owner_user_id <> actor_user_id
    AND membership.school_id = target_school_id
    AND membership.graduation_year = target_graduation_year
    AND history.grade_number = target_grade_number
    AND history.class_number = target_class_number
    AND lower(btrim(normalize(profile.display_name, NFKC))) = lower(btrim(normalize(exact_display_name, NFKC)));

  IF matched_user IS NULL
    OR NOT public.is_current_adult_account(matched_user)
    OR EXISTS (
      SELECT 1 FROM public.user_blocks block
      WHERE (block.blocker_user_id = actor_user_id AND block.blocked_user_id = matched_user)
         OR (block.blocker_user_id = matched_user AND block.blocked_user_id = actor_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.connections connection
      WHERE connection.status = 'active'
        AND connection.user_low_id = LEAST(actor_user_id, matched_user)
        AND connection.user_high_id = GREATEST(actor_user_id, matched_user)
    )
    OR EXISTS (
      SELECT 1 FROM public.connection_requests request
      WHERE request.pair_low_id = LEAST(actor_user_id, matched_user)
        AND request.pair_high_id = GREATEST(actor_user_id, matched_user)
    )
  THEN
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

REVOKE ALL ON FUNCTION public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)
  TO service_role;

COMMIT;
