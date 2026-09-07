BEGIN;

CREATE FUNCTION public.replace_own_school_class_history(
  target_membership_id uuid,
  requested_grade_classes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  own_profile public.private_profiles%ROWTYPE;
  membership public.profile_school_memberships%ROWTYPE;
  maximum_grade integer;
  item jsonb;
  normalized jsonb;
  previous_history jsonb;
  public_write_allowed boolean;
  onboarding_write_allowed boolean;
  people_discovery_write_allowed boolean;
BEGIN
  IF requester IS NULL THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requester::text, 0));

  IF public.has_current_adult_access(requester) IS NOT TRUE
    OR EXISTS (SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped')
    OR EXISTS (SELECT 1 FROM public.account_deletion_requests deletion
      WHERE deletion.user_id = requester AND deletion.status <> 'rejected')
    OR EXISTS (SELECT 1 FROM public.safety_account_restrictions restriction
      WHERE restriction.user_id = requester AND restriction.status = 'suspended')
  THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;

  SELECT * INTO own_profile FROM public.private_profiles
  WHERE owner_user_id = requester AND profile_visibility = 'private' AND status = 'active'
  FOR UPDATE;
  SELECT * INTO membership FROM public.profile_school_memberships
  WHERE id = target_membership_id AND owner_user_id = requester AND profile_id = own_profile.id
  FOR UPDATE;
  IF own_profile.id IS NULL OR membership.id IS NULL
  THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;

  public_write_allowed := public.public_account_access_active(requester)
    AND public.public_account_feature_enabled('school_membership');
  onboarding_write_allowed := public.has_beta_onboarding_access(requester, 'school_membership')
    AND EXISTS (
      SELECT 1 FROM public.beta_onboarding_invite_claims claim
      WHERE claim.user_id = requester AND claim.status = 'claimed'
        AND claim.expires_at > now() AND claim.target_school_id = membership.school_id
    );
  people_discovery_write_allowed := public.has_beta_feature_access(requester, 'people_search')
    AND EXISTS (
    SELECT 1 FROM public.beta_members member
    JOIN public.beta_programs program ON program.id = member.program_id
    WHERE member.user_id = requester AND member.status = 'active'
      AND member.target_school_id = membership.school_id
      AND program.status = 'active' AND program.emergency_disabled_at IS NULL
      AND program.starts_at <= now() AND program.ends_at > now()
      AND public.is_people_discovery_beta_contract(member.program_id)
    );
  IF (public_write_allowed OR onboarding_write_allowed OR people_discovery_write_allowed) IS NOT TRUE
  THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;

  SELECT CASE school.school_type
    WHEN 'elementary' THEN 6 WHEN 'middle' THEN 3 WHEN 'high' THEN 3 ELSE 0 END
  INTO maximum_grade FROM public.schools school WHERE school.id = membership.school_id;
  IF maximum_grade IS NULL OR requested_grade_classes IS NULL
    OR pg_catalog.jsonb_typeof(requested_grade_classes) <> 'array'
  THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
  IF pg_catalog.jsonb_array_length(requested_grade_classes) > 6
  THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;

  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_grade_classes)
  LOOP
    IF pg_catalog.jsonb_typeof(item) <> 'object'
    THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
    IF NOT (item ? 'grade_number') OR NOT (item ? 'class_number')
      OR pg_catalog.jsonb_typeof(item->'grade_number') <> 'number'
      OR pg_catalog.jsonb_typeof(item->'class_number') <> 'number'
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(item) k
        WHERE k NOT IN ('grade_number','class_number'))
      OR (item->>'grade_number') !~ '^[1-6]$'
      OR (item->>'class_number') !~ '^([1-9]|[1-9][0-9]|100)$'
    THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
    IF (item->>'grade_number')::integer > maximum_grade
    THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
  END LOOP;
  IF (SELECT count(*) <> count(DISTINCT value->>'grade_number')
    FROM pg_catalog.jsonb_array_elements(requested_grade_classes))
  THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(value ORDER BY (value->>'grade_number')::integer), '[]'::jsonb)
  INTO normalized FROM pg_catalog.jsonb_array_elements(requested_grade_classes);
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'grade_number', history.grade_number, 'class_number', history.class_number
  ) ORDER BY history.grade_number), '[]'::jsonb)
  INTO previous_history FROM public.profile_school_class_histories history
  WHERE history.membership_id = membership.id AND history.owner_user_id = requester;

  IF normalized IS DISTINCT FROM previous_history THEN
    DELETE FROM public.connection_match_tokens
    WHERE used_at IS NULL AND expires_at > now()
      AND (requester_user_id = requester OR receiver_user_id = requester);
    DELETE FROM public.profile_school_class_histories
    WHERE membership_id = membership.id AND owner_user_id = requester;
    INSERT INTO public.profile_school_class_histories(membership_id, owner_user_id, grade_number, class_number)
    SELECT membership.id, requester, (value->>'grade_number')::integer, (value->>'class_number')::integer
    FROM pg_catalog.jsonb_array_elements(normalized) ORDER BY (value->>'grade_number')::integer;
  END IF;
  RETURN normalized;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_own_school_class_history(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_own_school_class_history(uuid,jsonb) TO authenticated, service_role;

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
  original_matched_user uuid;
  validation_pass integer;
BEGIN
  -- First find the candidate; then re-run every predicate with both user locks held.
  FOR validation_pass IN 1..2 LOOP
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
  WHERE profile.status = 'active' AND profile.profile_visibility = 'private'
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
  WHERE profile.status = 'active' AND profile.profile_visibility = 'private'
    AND profile.owner_user_id <> actor_user_id
    AND membership.school_id = target_school_id
    AND membership.graduation_year = target_graduation_year
    AND history.grade_number = target_grade_number
    AND history.class_number = target_class_number
    AND lower(btrim(normalize(profile.display_name, NFKC))) = lower(btrim(normalize(exact_display_name, NFKC)));

  IF matched_user IS NULL
    OR (validation_pass = 2 AND matched_user IS DISTINCT FROM original_matched_user)
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

  IF validation_pass = 1 THEN
    original_matched_user := matched_user;
    -- Same namespace as owner replacement. UUID order is identical for A→B and B→A.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(LEAST(actor_user_id::text, matched_user::text), 0));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(GREATEST(actor_user_id::text, matched_user::text), 0));
  END IF;
  END LOOP;
  -- Post-lock revalidation above succeeded; transaction locks cover token insertion.
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
