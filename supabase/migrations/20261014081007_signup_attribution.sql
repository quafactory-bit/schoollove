-- Anonymous first-profile statistics. No account identifier or timestamp.
CREATE TABLE public.signup_attribution (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  source text NOT NULL DEFAULT 'unknown' CHECK (source ~ '^[a-z0-9_-]{1,40}$'),
  medium text CHECK (medium IS NULL OR medium ~ '^[a-z0-9_-]{1,40}$'),
  campaign text CHECK (campaign IS NULL OR campaign ~ '^[a-z0-9_-]{1,40}$'),
  content text CHECK (content IS NULL OR content ~ '^[a-z0-9_-]{1,40}$'),
  landing_path text CHECK (landing_path IS NULL OR (
    char_length(landing_path) <= 120 AND landing_path IN (
      '/', '/login', '/account', '/onboarding', '/search', '/privacy', '/terms',
      '/school/[redacted]', '/[redacted]'
    )
  ))
);
ALTER TABLE public.signup_attribution ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_attribution FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.signup_attribution_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.signup_attribution TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.signup_attribution_id_seq TO service_role;

-- Service-only overload. The three-argument owner RPC remains unchanged.
-- Locking the existing milestone serializes retries and simultaneous requests,
-- including profile deletion/recreation. No attribution-to-account key is stored.
CREATE FUNCTION public.upsert_own_private_profile(
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
    IF jsonb_typeof(attribution) IS DISTINCT FROM 'object'
      OR coalesce(attribution->>'source', '') !~ '^[a-z0-9_-]{1,40}$'
    THEN attribution := '{"source":"unknown"}'::jsonb; END IF;
    FOREACH field IN ARRAY ARRAY['medium','campaign','content'] LOOP
      IF attribution->>field IS NOT NULL AND attribution->>field !~ '^[a-z0-9_-]{1,40}$'
      THEN attribution := '{"source":"unknown"}'::jsonb; END IF;
    END LOOP;
    IF attribution->>'landing_path' IS NOT NULL AND attribution->>'landing_path' NOT IN (
      '/', '/login', '/account', '/onboarding', '/search', '/privacy', '/terms',
      '/school/[redacted]', '/[redacted]'
    ) THEN attribution := '{"source":"unknown"}'::jsonb; END IF;
    INSERT INTO public.signup_attribution(source, medium, campaign, content, landing_path)
    VALUES (attribution->>'source', attribution->>'medium', attribution->>'campaign',
      attribution->>'content', attribution->>'landing_path');
  END IF;
  RETURN jsonb_build_object('profile', saved, 'attribution_recorded', first_created IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_own_private_profile(text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_own_private_profile(text,text,text,uuid,jsonb) TO service_role;

-- Weekly channel counts (operator SQL only):
-- select date_trunc('week', created_on)::date as week, source, medium, campaign, count(*)
-- from public.signup_attribution group by 1,2,3,4 order by 1 desc,5 desc;
