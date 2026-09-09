\set ON_ERROR_STOP on
BEGIN;
SET request.jwt.claim.sub='ef100001-0000-4000-8000-000000000001';
SET request.jwt.claim.role='authenticated';
DO $$ DECLARE member uuid; BEGIN
  ASSERT (SELECT count(*) FROM private.school_growth_contributions)=1,'baseline seen rows';
  ASSERT (SELECT sum(base_xp+referral_xp) FROM private.school_growth_contributions)=0,'no retroactive XP';
  ASSERT (SELECT xp FROM private.school_growth_states)=0,'baseline state zero';
  SELECT id INTO member FROM public.profile_school_memberships;
  PERFORM public.delete_own_school_membership(member);
  PERFORM public.add_own_school_membership_with_class_history('ef000001-0000-4000-8000-000000000001',2010,'[]');
  ASSERT (SELECT xp FROM private.school_growth_states)=0,'baseline re-add must stay zero';
  ASSERT (SELECT count(*) FROM private.school_growth_events)=0,'no fake baseline events';
  ASSERT public.get_school_growth_game()='[]'::jsonb,'no fake baseline ranking';
END $$;
ROLLBACK;
SELECT 'EXISTING_MEMBERSHIP_ZERO_XP_BASELINE_PASS' AS result;
