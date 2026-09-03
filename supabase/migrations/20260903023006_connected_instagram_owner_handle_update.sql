BEGIN;

CREATE OR REPLACE FUNCTION public.update_own_connected_instagram_handle(
  requested_instagram_handle text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  normalized_instagram text;
  profile_id uuid;
  profile_status text;
BEGIN
  IF requester IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  normalized_instagram := nullif(
    lower(btrim(normalize(coalesce(requested_instagram_handle, ''), NFKC))),
    ''
  );

  IF normalized_instagram IS NOT NULL
    AND normalized_instagram !~ '^[a-z0-9._]{1,30}$'
  THEN
    RAISE EXCEPTION 'INVALID_INSTAGRAM_HANDLE';
  END IF;

  SELECT profile.id, profile.status
  INTO profile_id, profile_status
  FROM public.private_profiles profile
  WHERE profile.owner_user_id = requester
  FOR UPDATE;

  IF profile_id IS NULL THEN
    RAISE EXCEPTION 'PRIVATE_PROFILE_REQUIRED';
  END IF;

  IF normalized_instagram IS NOT NULL
    AND (
      profile_status <> 'active'
      OR NOT public.has_beta_feature_access(requester, 'instagram_permission')
    )
  THEN
    RAISE EXCEPTION 'CONNECTED_INSTAGRAM_ACCESS_REQUIRED';
  END IF;

  UPDATE public.private_profiles profile
  SET instagram_handle = normalized_instagram,
      updated_at = clock_timestamp()
  WHERE profile.id = profile_id
    AND profile.owner_user_id = requester;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_connected_instagram_handle(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_connected_instagram_handle(text)
  TO authenticated, service_role;

COMMIT;
