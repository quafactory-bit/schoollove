-- Allow authenticated principals without an Auth email to redeem unrestricted
-- controlled-beta invites. Email/domain-bound invites remain fail-closed.

CREATE OR REPLACE FUNCTION public.redeem_beta_invite(
  actor_user_id uuid, requested_token_hash text, actor_email_hash text, actor_domain_hash text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  invite public.beta_invites%ROWTYPE; program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE; allowed public.beta_program_schools%ROWTYPE;
  next_status text; reserved_count integer; member_id uuid;
BEGIN
  IF actor_user_id IS NULL OR NOT (auth.uid()=actor_user_id OR auth.role()='service_role' OR session_user='postgres')
    THEN RETURN 'ACCESS_DENIED'; END IF;
  IF requested_token_hash IS NULL OR requested_token_hash !~ '^[0-9a-f]{64}$'
    OR (actor_email_hash IS NOT NULL AND actor_email_hash !~ '^[0-9a-f]{64}$')
    OR (actor_domain_hash IS NOT NULL AND actor_domain_hash !~ '^[0-9a-f]{64}$')
    THEN RETURN 'INVALID'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.adult_eligibility_records adult
    WHERE adult.user_id=actor_user_id AND adult.adult_eligible=true
      AND adult.verification_method='self_attestation' AND adult.policy_version='phase10b-2026-07-28'
  ) OR EXISTS(
    SELECT required_type FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
    WHERE NOT EXISTS(
      SELECT 1 FROM public.consent_records consent WHERE consent.user_id=actor_user_id
        AND consent.consent_type=required_type AND consent.consented=true AND consent.policy_version='phase10b-2026-07-28'
    )
  ) THEN RETURN 'ADULT_CONSENT_REQUIRED'; END IF;
  SELECT * INTO invite FROM public.beta_invites WHERE token_hash=requested_token_hash FOR UPDATE;
  IF invite.id IS NULL THEN RETURN 'UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.beta_members member WHERE member.program_id=invite.program_id AND member.user_id=actor_user_id)
    THEN RETURN 'ALREADY_REDEEMED'; END IF;
  IF invite.revoked_at IS NOT NULL OR invite.expires_at<=now() OR invite.max_uses<>1 OR invite.use_count>=1
    THEN RETURN 'UNAVAILABLE'; END IF;
  IF invite.email_hash IS NOT NULL
    AND (actor_email_hash IS NULL OR invite.email_hash<>actor_email_hash) THEN RETURN 'IDENTITY_MISMATCH'; END IF;
  IF invite.domain_hash IS NOT NULL
    AND (actor_domain_hash IS NULL OR invite.domain_hash<>actor_domain_hash) THEN RETURN 'IDENTITY_MISMATCH'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=invite.program_id AND status='active'
    AND emergency_disabled_at IS NULL AND starts_at<=now() AND ends_at>now() FOR UPDATE;
  IF program.id IS NULL THEN RETURN 'PROGRAM_UNAVAILABLE'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
  IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id
    OR allowed.school_id<>snapshot.target_school_id THEN RETURN 'PROGRAM_CONTRACT_UNAVAILABLE'; END IF;
  IF snapshot.approval_waitlist_enabled IS DISTINCT FROM true THEN RETURN 'WAITLIST_DISABLED'; END IF;
  SELECT count(*) INTO reserved_count FROM public.beta_members
    WHERE program_id=program.id AND status IN ('pending_review','active','suspended');
  IF reserved_count>=snapshot.max_users THEN RETURN 'PROGRAM_FULL'; END IF;
  next_status:=CASE WHEN program.requires_admin_approval THEN 'pending_review' ELSE 'active' END;
  INSERT INTO public.beta_members(program_id,user_id,invite_id,target_school_id,status)
  VALUES(program.id,actor_user_id,invite.id,allowed.school_id,next_status) RETURNING id INTO member_id;
  UPDATE public.beta_invites SET use_count=use_count+1 WHERE id=invite.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('user',actor_user_id::text,'invite_redeemed','beta_member',member_id,'SCHOOL_SCOPE_BOUND');
  RETURN upper(next_status);
END; $$;

REVOKE ALL ON FUNCTION public.redeem_beta_invite(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_beta_invite(uuid,text,text,text) TO service_role;
