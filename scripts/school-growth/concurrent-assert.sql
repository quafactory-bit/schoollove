\set ON_ERROR_STOP on
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.profile_school_memberships WHERE owner_user_id='ed100001-0000-4000-8000-000000000001')=2,'both independent membership saves committed';
  ASSERT (SELECT count(*) FROM private.school_growth_contributions WHERE school_id='ed000001-0000-4000-8000-000000000001')=1,'concurrent award duplicated';
  ASSERT (SELECT xp FROM private.school_growth_states WHERE school_id='ed000001-0000-4000-8000-000000000001')=100,'concurrent XP wrong';
END $$;
SELECT 'CONCURRENT_MEMBERSHIP_SINGLE_AWARD_PASS' AS result;
