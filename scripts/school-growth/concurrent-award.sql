\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role='authenticated';
SET LOCAL request.jwt.claim.sub='ed100001-0000-4000-8000-000000000001';
SELECT public.add_own_school_membership_with_class_history('ed000001-0000-4000-8000-000000000001', :year, '[]');
SELECT pg_sleep(1);
COMMIT;
