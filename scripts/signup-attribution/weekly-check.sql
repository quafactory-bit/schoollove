-- Read-only manual check: previous complete Monday-Sunday week, Asia/Seoul.
-- Run only where signup_attribution migrations are already applied.
-- new_profiles uses durable first-profile milestones, not surviving profile rows.
-- attribution_rows counts aggregate buckets; attributed_signups is SUM(count).
-- Use the first complete week after rollout; partial/pre-rollout weeks and
-- deliberate test-bucket cleanup can create an expected difference.
WITH bounds AS (
  SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')::date - 7 AS week_start,
         date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')::date AS week_end_exclusive
), profiles AS (
  SELECT coalesce(sum(f.event_count), 0) AS new_profiles
  FROM public.public_account_daily_funnel AS f
  CROSS JOIN bounds AS b
  WHERE f.metric_date >= b.week_start AND f.metric_date < b.week_end_exclusive
    AND f.event_key = 'private_profile_created' AND f.event_kind = 'milestone'
), attribution AS (
  SELECT count(*) AS attribution_rows, coalesce(sum(a.count), 0) AS attributed_signups
  FROM public.signup_attribution AS a
  CROSS JOIN bounds AS b
  WHERE a.created_on >= b.week_start AND a.created_on < b.week_end_exclusive
)
SELECT b.week_start, b.week_end_exclusive - 1 AS week_end,
       p.new_profiles, a.attribution_rows, a.attributed_signups,
       p.new_profiles - a.attributed_signups AS difference
FROM bounds AS b CROSS JOIN profiles AS p CROSS JOIN attribution AS a;
