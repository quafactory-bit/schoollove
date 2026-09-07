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
  beta_member public.beta_members%ROWTYPE;
BEGIN
  IF requester IS NULL THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requester::text, 0));

  IF public.public_account_access_active(requester) IS NOT TRUE
    OR public.has_current_adult_access(requester) IS NOT TRUE
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

  IF (public.public_account_feature_enabled('school_membership')
    OR public.has_beta_feature_access(requester, 'private_profile')
    OR public.has_beta_onboarding_access(requester, 'school_membership')) IS NOT TRUE
  THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
  IF public.has_beta_onboarding_access(requester, 'school_membership')
    AND NOT EXISTS (
      SELECT 1 FROM public.beta_onboarding_invite_claims claim
      WHERE claim.user_id = requester AND claim.status = 'claimed'
        AND claim.expires_at > now() AND claim.target_school_id = membership.school_id
    )
  THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;

  -- Preserve the deployed registration trigger's beta school boundary even though
  -- replacing child rows does not fire the parent membership trigger.
  IF NOT public.has_beta_onboarding_access(requester, 'school_membership')
    AND public.has_beta_feature_access(requester, 'private_profile')
  THEN
    IF (SELECT count(*) FROM public.beta_members candidate
      JOIN public.beta_programs program ON program.id = candidate.program_id
      WHERE candidate.user_id = requester AND candidate.status = 'active'
        AND program.status = 'active' AND program.emergency_disabled_at IS NULL
        AND program.starts_at <= now() AND program.ends_at > now()) <> 1
    THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
    SELECT candidate.* INTO beta_member FROM public.beta_members candidate
    JOIN public.beta_programs program ON program.id = candidate.program_id
    WHERE candidate.user_id = requester AND candidate.status = 'active'
      AND program.status = 'active' AND program.emergency_disabled_at IS NULL
      AND program.starts_at <= now() AND program.ends_at > now();
    IF NOT EXISTS (SELECT 1 FROM public.beta_program_schools allowed
      WHERE allowed.program_id = beta_member.program_id
        AND allowed.school_id = beta_member.target_school_id
        AND allowed.school_id = membership.school_id)
    THEN RAISE EXCEPTION 'CLASS_HISTORY_UNAVAILABLE'; END IF;
  END IF;

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

COMMIT;
