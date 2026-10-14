-- Production SQL Editor only. Reserved codes for one operator-owned test.
-- Fresh/incognito browser, Google account with no prior Production profile:
-- https://www.schoollove.kr/?utm_source=test&utm_medium=manual&utm_campaign=production_signup_test&utm_content=manual_20261014
-- Run SELECT before signup (expected 0), after first profile (1), and again
-- after logout/login/profile edit (still 1). No account identifiers are queried.
SELECT count(*) AS aggregate_rows, coalesce(sum(count), 0) AS test_signups
FROM public.signup_attribution
WHERE source = 'test' AND medium = 'manual'
  AND campaign = 'production_signup_test' AND content = 'manual_20261014';

-- Execute only after the test: removes this reserved anonymous aggregate only.
-- Run as SQL Editor DB owner; service_role intentionally lacks DELETE.
-- This does NOT delete the account. Withdraw from that test account separately.
-- The durable first-profile milestone remains, so that week's reconciliation
-- will show the removed test count as an expected difference.
DELETE FROM public.signup_attribution
WHERE source = 'test' AND medium = 'manual'
  AND campaign = 'production_signup_test' AND content = 'manual_20261014'
RETURNING created_on, source, medium, campaign, content, count;
