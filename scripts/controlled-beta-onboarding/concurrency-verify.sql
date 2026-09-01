DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.beta_onboarding_invite_claims
      WHERE invite_id='30000000-0000-4000-8000-000000000002')<>1
  THEN RAISE EXCEPTION 'CLAIM_RACE_WINNER_NOT_EXACTLY_ONE'; END IF;
  IF (SELECT count(*) FROM public.beta_members
      WHERE user_id='20000000-0000-4000-8000-000000000004' AND status='pending_review')<>1
    OR (SELECT use_count FROM public.beta_invites
      WHERE id='30000000-0000-4000-8000-000000000003')<>1
    OR (SELECT count(*) FROM public.beta_onboarding_invite_claims
      WHERE user_id='20000000-0000-4000-8000-000000000004' AND status='consumed')<>1
  THEN RAISE EXCEPTION 'FINALIZE_RACE_EXACTLY_ONCE_FAILED'; END IF;
  IF (SELECT state FROM public.public_account_launch_control WHERE control_key='public_account')<>'closed'
  THEN RAISE EXCEPTION 'CONCURRENCY_CHANGED_LAUNCH'; END IF;
END
$verify$;
SELECT 'CONTROLLED_BETA_ONBOARDING_CONCURRENCY_OK' AS status;
