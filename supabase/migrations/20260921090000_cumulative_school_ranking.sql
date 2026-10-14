BEGIN;

-- Add a cumulative projection alongside the existing seven-day function so the
-- database and application can be released independently without interrupting
-- the current ranking. No raw contribution, contributor count or timestamp is
-- exposed. SECURITY DEFINER remains necessary because the source tables are in
-- the forced-RLS private schema; the public JSON surface is explicitly bounded.
CREATE FUNCTION public.get_total_school_ranking(requested_school_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH totals AS (
    SELECT school_id,sum(xp_delta)::bigint AS xp,
      max(publish_at) FILTER(WHERE level_up) AS last_up
    FROM private.school_growth_batches WHERE publish_at<=now() GROUP BY school_id
  ), ranked AS (
    SELECT school_id,row_number() OVER(ORDER BY xp DESC,school_id) AS place
    FROM totals WHERE xp>0
  ), chosen AS (
    SELECT s.id,s.school_name,s.slug,coalesce(t.xp,0) AS xp,
      r.place,t.last_up,private.school_growth_level(coalesce(t.xp,0)) AS level
    FROM public.schools s
    LEFT JOIN totals t ON t.school_id=s.id
    LEFT JOIN ranked r ON r.school_id=s.id
    WHERE (requested_school_id IS NOT NULL AND s.id=requested_school_id)
      OR (requested_school_id IS NULL AND t.xp>0)
    ORDER BY t.xp DESC NULLS LAST,s.id LIMIT 5
  ) SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schoolId',id,'schoolName',school_name,'slug',slug,'level',level,
    'progress',floor(100*(xp-CASE WHEN level=1 THEN 0 ELSE round(50*power(level::numeric,1.5)) END)/
      (round(50*power((level+1)::numeric,1.5))-CASE WHEN level=1 THEN 0 ELSE round(50*power(level::numeric,1.5)) END)),
    'totalXp',xp,'rank',place,'lastLevelUp',last_up)), '[]'::jsonb) FROM chosen
$$;
REVOKE ALL ON FUNCTION public.get_total_school_ranking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_total_school_ranking(uuid) TO anon,authenticated,service_role;

COMMIT;
