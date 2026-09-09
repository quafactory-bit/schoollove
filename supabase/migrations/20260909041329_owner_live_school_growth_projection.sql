BEGIN;

-- Owner-only, one statement snapshot. No public/award/ledger changes.
CREATE FUNCTION public.get_own_school_growth_live(requested_school_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH owned AS (
    SELECT s.id,s.school_name,s.slug,coalesce(g.xp,0) AS xp,g.last_level_up_at,
      private.school_growth_level(coalesce(g.xp,0)) AS level,
      coalesce(c.base_xp+c.referral_xp,0) AS own_xp
    FROM public.schools s
    LEFT JOIN private.school_growth_states g ON g.school_id=s.id
    LEFT JOIN private.school_growth_contributions c ON c.school_id=s.id
      AND c.contributor_key=private.school_growth_key(auth.uid()::text||':'||s.id::text)
    WHERE auth.uid() IS NOT NULL AND s.id=requested_school_id
      AND EXISTS(SELECT 1 FROM public.profile_school_memberships m
        WHERE m.owner_user_id=auth.uid() AND m.school_id=s.id)
  ), measured AS (
    SELECT *,floor(100*(xp-CASE WHEN level=1 THEN 0 ELSE round(50*power(level::numeric,1.5)) END)/
      (round(50*power((level+1)::numeric,1.5))-CASE WHEN level=1 THEN 0 ELSE round(50*power(level::numeric,1.5)) END)) AS progress
    FROM owned
  ) SELECT jsonb_build_object('schoolId',id,'schoolName',school_name,'slug',slug,
    'level',level,'progress',progress,'nearLevelUp',progress>=80,
    'lastLevelUp',last_level_up_at,'ownContributionXp',own_xp) FROM measured
$$;
REVOKE ALL ON FUNCTION public.get_own_school_growth_live(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_own_school_growth_live(uuid) TO authenticated;

COMMIT;
