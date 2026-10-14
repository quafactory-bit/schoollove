-- Optional statistics must never roll back a successful first profile.
-- The original owner RPC/auth/consent errors remain outside the exception block.
-- Preserve the existing first-profile lock and single-statement atomic UPSERT.
CREATE OR REPLACE FUNCTION public.upsert_own_private_profile(
  requested_display_name text, requested_instagram_handle text,
  requested_introduction text, verified_actor uuid, requested_attribution jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  previous_subject text := current_setting('request.jwt.claim.sub', true);
  first_created timestamptz;
  saved jsonb;
  attribution jsonb := requested_attribution;
  field text;
  recorded boolean := false;
BEGIN
  IF verified_actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT private_profile_first_created_at INTO first_created
  FROM public.adult_eligibility_records
  WHERE user_id = verified_actor AND policy_version = 'phase10b-2026-07-28'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADULT_ELIGIBILITY_REQUIRED'; END IF;

  PERFORM set_config('request.jwt.claim.sub', verified_actor::text, true);
  saved := public.upsert_own_private_profile(
    requested_display_name, requested_instagram_handle, requested_introduction
  );
  PERFORM set_config('request.jwt.claim.sub', coalesce(previous_subject, ''), true);
  IF first_created IS NULL THEN
    -- Keep owner save and its milestone outside this optional-statistics subtransaction.
    BEGIN
      IF jsonb_typeof(attribution) IS DISTINCT FROM 'object'
        OR jsonb_typeof(attribution->'source') IS DISTINCT FROM 'string'
        OR coalesce(attribution->>'source', '') !~ '^[a-z0-9_-]{1,40}$'
      THEN attribution := '{"source":"unknown"}'::jsonb; END IF;
      FOREACH field IN ARRAY ARRAY['medium','campaign','content'] LOOP
        IF attribution->>field IS NOT NULL AND (jsonb_typeof(attribution->field) <> 'string'
          OR attribution->>field !~ '^[a-z0-9_-]{1,40}$')
        THEN attribution := '{"source":"unknown"}'::jsonb; END IF;
      END LOOP;
      INSERT INTO public.signup_attribution AS daily (source, medium, campaign, content)
      VALUES (attribution->>'source', attribution->>'medium',
        attribution->>'campaign', attribution->>'content')
      ON CONFLICT ON CONSTRAINT signup_attribution_daily_key
      DO UPDATE SET count = daily.count + EXCLUDED.count;
      recorded := true;
    EXCEPTION
      WHEN query_canceled THEN recorded := false;
      WHEN OTHERS THEN recorded := false;
    END;
  END IF;
  RETURN jsonb_build_object('profile', saved, 'attribution_recorded', recorded);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_own_private_profile(text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_own_private_profile(text,text,text,uuid,jsonb) TO service_role;

