-- Follow-up only: never edit the already applied per-signup migration.
-- Execute the entire file in one transaction. Preserve totals during conversion.
LOCK TABLE public.signup_attribution IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE signup_attribution_conversion AS
SELECT created_on, source, medium, campaign, content, count(*)::bigint AS count
FROM public.signup_attribution GROUP BY created_on, source, medium, campaign, content;

DELETE FROM public.signup_attribution;
ALTER TABLE public.signup_attribution
  DROP COLUMN id,
  DROP COLUMN landing_path,
  ADD COLUMN count bigint NOT NULL DEFAULT 1 CHECK (count > 0),
  ADD CONSTRAINT signup_attribution_daily_key
    UNIQUE NULLS NOT DISTINCT (created_on, source, medium, campaign, content);
INSERT INTO public.signup_attribution(created_on, source, medium, campaign, content, count)
SELECT created_on, source, medium, campaign, content, count FROM signup_attribution_conversion;
DROP TABLE signup_attribution_conversion;

ALTER TABLE public.signup_attribution ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_attribution FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.signup_attribution TO service_role;
COMMENT ON TABLE public.signup_attribution IS
  'Daily anonymous signup totals only; no account key, serial ID, timestamp or landing path.';

-- Existing account milestone lock prevents retries/profile recreation counting again.
-- The account key is never persisted in, or linked to, the aggregate table.
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
  END IF;
  RETURN jsonb_build_object('profile', saved, 'attribution_recorded', first_created IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_own_private_profile(text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_own_private_profile(text,text,text,uuid,jsonb) TO service_role;

-- Weekly channel totals (operator SQL only; count(*) would count buckets):
-- select date_trunc('week', created_on)::date as week, source, medium, campaign, sum(count) as signups
-- from public.signup_attribution group by 1,2,3,4 order by 1 desc,5 desc;
