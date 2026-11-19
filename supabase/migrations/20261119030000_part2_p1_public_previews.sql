-- Part 2 P1: public previews for school detail, search and home.
-- Add-only: four new functions, no new table, no change to existing functions or data.
-- Names leave the database only as server-masked strings (first char + O + last char).
BEGIN;

-- 1) Logged-out year preview: masked names only, at most 6, for roster-visible active profiles.
CREATE FUNCTION public.part2_year_masked_preview(p_school_id uuid, p_year integer)
RETURNS TABLE(masked_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
           WHEN char_length(clean.name) <= 1 THEN 'O'
           WHEN char_length(clean.name) = 2 THEN left(clean.name, 1) || 'O'
           ELSE left(clean.name, 1) || 'O' || right(clean.name, 1)
         END
  FROM (
    SELECT regexp_replace(btrim(profile.display_name), '\s+', '', 'g') AS name, consent.consented_at
    FROM public.profile_school_memberships membership
    JOIN public.school_roster_consents consent
      ON consent.membership_id = membership.id
     AND consent.owner_user_id = membership.owner_user_id
     AND consent.withdrawn_at IS NULL
    JOIN public.private_profiles profile
      ON profile.id = membership.profile_id
     AND profile.owner_user_id = membership.owner_user_id
     AND profile.status = 'active'
    WHERE membership.school_id = p_school_id
      AND membership.graduation_year = p_year
  ) clean
  WHERE char_length(clean.name) > 0
  ORDER BY clean.consented_at DESC
  LIMIT 6;
$$;

-- 2) Search result badges: whether a school has any roster-visible member (counts are already public).
CREATE FUNCTION public.part2_school_roster_flags(p_school_ids uuid[])
RETURNS TABLE(school_id uuid, has_roster boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT requested.id, EXISTS (
    SELECT 1
    FROM public.profile_school_memberships membership
    JOIN public.school_roster_consents consent
      ON consent.membership_id = membership.id
     AND consent.owner_user_id = membership.owner_user_id
     AND consent.withdrawn_at IS NULL
    JOIN public.private_profiles profile
      ON profile.id = membership.profile_id
     AND profile.owner_user_id = membership.owner_user_id
     AND profile.status = 'active'
    WHERE membership.school_id = requested.id
  )
  FROM (SELECT DISTINCT unnest(p_school_ids[1:50]) AS id) requested;
$$;

-- 3) Home LIVE ticker + TOP 5. Hidden entirely when fewer than 5 roster check-ins in the last 7 days.
--    No names, no Instagram: school + graduation year + count only.
CREATE FUNCTION public.part2_home_attendance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recent_total integer;
  ticker jsonb;
  top_schools jsonb;
BEGIN
  SELECT count(*)::integer INTO recent_total
  FROM public.school_roster_consents consent
  JOIN public.profile_school_memberships membership
    ON membership.id = consent.membership_id AND membership.owner_user_id = consent.owner_user_id
  JOIN public.private_profiles profile
    ON profile.id = membership.profile_id AND profile.owner_user_id = membership.owner_user_id AND profile.status = 'active'
  WHERE consent.withdrawn_at IS NULL
    AND consent.consented_at >= now() - interval '7 days';

  IF recent_total < 5 THEN
    RETURN jsonb_build_object('visible', false);
  END IF;

  -- Order by most recent check-in, but never return the timestamp itself.
  SELECT coalesce(jsonb_agg(row_data ORDER BY latest DESC), '[]'::jsonb) INTO ticker
  FROM (
    SELECT jsonb_build_object(
      'school_name', school.school_name,
      'slug', school.slug,
      'graduation_year', membership.graduation_year,
      'count', count(*)::integer
    ) AS row_data,
    max(consent.consented_at) AS latest
    FROM public.school_roster_consents consent
    JOIN public.profile_school_memberships membership
      ON membership.id = consent.membership_id AND membership.owner_user_id = consent.owner_user_id
    JOIN public.private_profiles profile
      ON profile.id = membership.profile_id AND profile.owner_user_id = membership.owner_user_id AND profile.status = 'active'
    JOIN public.schools school ON school.id = membership.school_id
    WHERE consent.withdrawn_at IS NULL
      AND consent.consented_at >= now() - interval '7 days'
    GROUP BY school.id, school.school_name, school.slug, membership.graduation_year
    ORDER BY max(consent.consented_at) DESC
    LIMIT 8
  ) recent;

  SELECT coalesce(jsonb_agg(row_data ORDER BY (row_data->>'count')::integer DESC, row_data->>'school_name'), '[]'::jsonb) INTO top_schools
  FROM (
    SELECT jsonb_build_object('school_name', school.school_name, 'slug', school.slug, 'count', count(*)::integer) AS row_data
    FROM public.school_roster_consents consent
    JOIN public.profile_school_memberships membership
      ON membership.id = consent.membership_id AND membership.owner_user_id = consent.owner_user_id
    JOIN public.private_profiles profile
      ON profile.id = membership.profile_id AND profile.owner_user_id = membership.owner_user_id AND profile.status = 'active'
    JOIN public.schools school ON school.id = membership.school_id
    WHERE consent.withdrawn_at IS NULL
    GROUP BY school.id, school.school_name, school.slug
    ORDER BY count(*) DESC, school.school_name
    LIMIT 5
  ) ranked;

  RETURN jsonb_build_object('visible', true, 'recent_total', recent_total, 'ticker', ticker, 'top', top_schools);
END;
$$;

-- 4) "지금 동창들이 많이 찾는 학교" chips: last 7 days of search-result selections (Part 2 aggregate),
--    schools with at least 3 selections only. Server-only.
CREATE FUNCTION public.part2_popular_schools()
RETURNS TABLE(school_name text, slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT school.school_name, school.slug
  FROM public.part2_daily_funnel funnel
  JOIN public.schools school ON school.id = funnel.school_id
  WHERE funnel.event_key = 'school_result_selected'
    AND funnel.metric_date >= ((now() AT TIME ZONE 'Asia/Seoul')::date - 6)
  GROUP BY school.id, school.school_name, school.slug
  HAVING sum(funnel.event_count) >= 3
  ORDER BY sum(funnel.event_count) DESC, school.school_name
  LIMIT 6;
$$;

REVOKE ALL ON FUNCTION public.part2_year_masked_preview(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.part2_school_roster_flags(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.part2_home_attendance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.part2_popular_schools() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.part2_year_masked_preview(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_school_roster_flags(uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_home_attendance() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_popular_schools() TO service_role;

COMMIT;
