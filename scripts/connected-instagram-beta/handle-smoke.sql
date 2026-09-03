\set ON_ERROR_STOP on

DO $handle$
DECLARE
  actor uuid := '20000000-0000-4000-8000-000000000001';
  original_display_name text;
  original_introduction text;
  original_photo text;
  original_visibility text;
  original_status text;
  membership_count integer;
  history_count integer;
  rejected boolean := false;
BEGIN
  SELECT display_name, introduction, profile_photo_url, profile_visibility, status
  INTO original_display_name, original_introduction, original_photo, original_visibility, original_status
  FROM public.private_profiles
  WHERE owner_user_id = actor;

  IF original_display_name IS NULL THEN
    RAISE EXCEPTION 'OWNER_PROFILE_MISSING';
  END IF;

  SELECT count(*) INTO membership_count
  FROM public.profile_school_memberships
  WHERE owner_user_id = actor;
  SELECT count(*) INTO history_count
  FROM public.profile_school_class_histories
  WHERE owner_user_id = actor;

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  IF NOT public.update_own_connected_instagram_handle('Temporary.Owner') THEN
    RAISE EXCEPTION 'OWNER_HANDLE_UPDATE_FALSE';
  END IF;
  IF (SELECT instagram_handle FROM public.private_profiles WHERE owner_user_id = actor) <> 'temporary.owner' THEN
    RAISE EXCEPTION 'OWNER_HANDLE_NORMALIZATION_FAILED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.private_profiles
    WHERE owner_user_id = actor
      AND (
        display_name IS DISTINCT FROM original_display_name
        OR introduction IS DISTINCT FROM original_introduction
        OR profile_photo_url IS DISTINCT FROM original_photo
        OR profile_visibility IS DISTINCT FROM original_visibility
        OR status IS DISTINCT FROM original_status
      )
  ) THEN
    RAISE EXCEPTION 'OWNER_PROFILE_FIELD_MUTATION';
  END IF;
  IF (SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id = actor) <> membership_count
    OR (SELECT count(*) FROM public.profile_school_class_histories WHERE owner_user_id = actor) <> history_count
  THEN
    RAISE EXCEPTION 'OWNER_SCHOOL_HISTORY_MUTATION';
  END IF;

  BEGIN
    PERFORM public.update_own_connected_instagram_handle('not valid!');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%INVALID_INSTAGRAM_HANDLE%' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'INVALID_HANDLE_ACCEPTED'; END IF;

  UPDATE public.beta_feature_flags
  SET enabled = false, reason_code = 'LOCAL_HANDLE_STOP', updated_by = 'local-admin'
  WHERE program_id IS NULL AND user_id IS NULL AND feature_key = 'instagram_permission';

  rejected := false;
  BEGIN
    PERFORM public.update_own_connected_instagram_handle('blocked.owner');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CONNECTED_INSTAGRAM_ACCESS_REQUIRED%' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'STOPPED_HANDLE_WRITE_ACCEPTED'; END IF;

  IF NOT public.update_own_connected_instagram_handle(NULL) THEN
    RAISE EXCEPTION 'STOPPED_HANDLE_CLEAR_FALSE';
  END IF;
  IF (SELECT instagram_handle FROM public.private_profiles WHERE owner_user_id = actor) IS NOT NULL THEN
    RAISE EXCEPTION 'STOPPED_HANDLE_CLEAR_FAILED';
  END IF;

  UPDATE public.beta_feature_flags
  SET enabled = true, reason_code = 'LOCAL_HANDLE_RESTORE', updated_by = 'local-admin'
  WHERE program_id IS NULL AND user_id IS NULL AND feature_key = 'instagram_permission';

  IF (SELECT count(*) FROM public.connection_instagram_permissions WHERE status = 'active') <> 0
    OR (SELECT count(*) FROM public.connection_messages) <> 0
  THEN
    RAISE EXCEPTION 'HANDLE_WRITE_CONNECTION_SIDE_EFFECT';
  END IF;
END
$handle$;

SELECT 'CONNECTED_INSTAGRAM_OWNER_HANDLE_OK' AS status;
