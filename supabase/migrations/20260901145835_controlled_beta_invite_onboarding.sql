-- Invite-bound provisional onboarding for the exact People Discovery controlled-beta contract.
-- This forward-only migration does not change launch state, feature exposure, programs, or invites.

BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('controlled-beta-invite-onboarding-v1', 0)
);

CREATE TABLE public.beta_onboarding_invite_claims (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  program_id uuid NOT NULL REFERENCES public.beta_programs(id) ON DELETE CASCADE,
  invite_id uuid NOT NULL REFERENCES public.beta_invites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_school_id uuid NOT NULL REFERENCES public.schools(id),
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'consumed', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (invite_id),
  UNIQUE (program_id, user_id),
  CHECK (expires_at > created_at),
  CHECK ((status = 'consumed') = (consumed_at IS NOT NULL)),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CHECK (status <> 'claimed' OR (consumed_at IS NULL AND revoked_at IS NULL)),
  CHECK (status <> 'expired' OR (consumed_at IS NULL AND revoked_at IS NULL))
);

CREATE INDEX beta_onboarding_invite_claims_capacity_idx
  ON public.beta_onboarding_invite_claims(program_id, status, expires_at);
CREATE INDEX beta_onboarding_invite_claims_user_idx
  ON public.beta_onboarding_invite_claims(user_id, status, expires_at);

COMMENT ON TABLE public.beta_onboarding_invite_claims IS
  'Token-free, invite-bound reservation that grants four owner-only onboarding writes before beta membership.';

ALTER TABLE public.beta_onboarding_invite_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_onboarding_invite_claims FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beta_onboarding_invite_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.beta_onboarding_invite_claims TO service_role;

CREATE FUNCTION public.is_people_discovery_beta_contract(target_program_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_program_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.beta_programs program
      JOIN public.beta_program_setup_snapshots snapshot ON snapshot.program_id = program.id
      JOIN public.beta_program_schools allowed
        ON allowed.program_id = program.id
        AND allowed.source_snapshot_id = snapshot.id
        AND allowed.school_id = snapshot.target_school_id
      WHERE program.id = target_program_id
        AND program.status = 'active'
        AND program.emergency_disabled_at IS NULL
        AND program.starts_at <= now()
        AND program.ends_at > now()
        AND program.ends_at - program.starts_at = interval '14 days'
        AND program.requires_admin_approval IS TRUE
        AND snapshot.max_users = 20
        AND snapshot.approval_waitlist_enabled IS TRUE
        AND snapshot.invite_policy IS NOT DISTINCT FROM
          '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
        AND snapshot.enabled_features @> ARRAY['people_search','connection_request']::text[]
        AND snapshot.enabled_features <@ ARRAY['people_search','connection_request']::text[]
        AND cardinality(snapshot.enabled_features) = 2
        AND (SELECT count(*) FROM public.beta_program_schools school_scope
          WHERE school_scope.program_id = program.id) = 1
        AND (SELECT count(*) FROM public.beta_feature_flags program_flag
          WHERE program_flag.program_id = program.id AND program_flag.user_id IS NULL) = 8
        AND (SELECT count(*) FROM public.beta_feature_flags program_flag
          WHERE program_flag.program_id = program.id AND program_flag.user_id IS NULL
            AND program_flag.enabled) = 2
        AND NOT EXISTS (
          SELECT 1 FROM public.beta_feature_flags program_flag
          WHERE program_flag.program_id = program.id AND program_flag.user_id IS NULL
            AND program_flag.enabled
            AND program_flag.feature_key NOT IN ('people_search','connection_request')
        )
        AND NOT EXISTS (
          SELECT 1 FROM unnest(ARRAY['people_search','connection_request']::text[]) expected(feature_key)
          WHERE NOT EXISTS (
            SELECT 1 FROM public.beta_feature_flags program_flag
            WHERE program_flag.program_id = program.id AND program_flag.user_id IS NULL
              AND program_flag.feature_key = expected.feature_key AND program_flag.enabled
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.beta_feature_flags global_stop
          WHERE global_stop.program_id IS NULL AND global_stop.user_id IS NULL
            AND global_stop.feature_key IN ('people_search','connection_request')
            AND global_stop.enabled = false
        )
    );
$$;

CREATE FUNCTION public.has_beta_onboarding_access(
  target_user_id uuid,
  requested_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_user_id IS NOT NULL
    AND requested_capability IN (
      'adult_eligibility','required_consents','private_profile','school_membership'
    )
    AND (auth.uid() = target_user_id OR auth.role() = 'service_role' OR session_user = 'postgres')
    AND EXISTS (
      SELECT 1 FROM public.public_account_launch_control launch
      WHERE launch.control_key = 'public_account'
        AND launch.state = 'closed'
        AND launch.account_registration_enabled = false
        AND launch.private_profile_enabled = false
        AND launch.school_membership_enabled = false
        AND launch.emergency_stopped_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.account_deletion_requests deletion
      WHERE deletion.user_id = target_user_id AND deletion.status <> 'rejected'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.safety_account_restrictions restriction
      WHERE restriction.user_id = target_user_id AND restriction.status = 'suspended'
    )
    AND (
      SELECT count(*)
      FROM private.private_accounts account
      JOIN private.social_identity_registry identity
        ON identity.account_id = account.id
        AND identity.auth_user_id = account.auth_user_id
        AND identity.provider = account.primary_provider
        AND identity.broker_subject = account.primary_broker_subject
      JOIN auth.identities auth_identity
        ON auth_identity.user_id = account.auth_user_id
        AND auth_identity.provider = 'custom:schoollove-' || identity.provider
        AND auth_identity.provider_id = identity.broker_subject
        AND auth_identity.identity_data ->> 'sub' = identity.broker_subject
      WHERE account.auth_user_id = target_user_id
        AND account.status IN ('provisional','active')
        AND identity.status = account.status
    ) = 1
    AND EXISTS (
      SELECT 1
      FROM public.beta_onboarding_invite_claims claim
      JOIN public.beta_invites invite
        ON invite.id = claim.invite_id AND invite.program_id = claim.program_id
      JOIN public.beta_program_schools allowed
        ON allowed.program_id = claim.program_id
        AND allowed.school_id = claim.target_school_id
      WHERE claim.user_id = target_user_id
        AND claim.status = 'claimed'
        AND claim.expires_at > now()
        AND invite.revoked_at IS NULL
        AND invite.expires_at > now()
        AND invite.max_uses = 1
        AND invite.use_count = 0
        AND public.is_people_discovery_beta_contract(claim.program_id)
    );
$$;

-- The existing dormant-feature trigger remains the final insert boundary for the
-- two onboarding-owned tables. Admit only the matching invite claim capability;
-- every other beta-only table continues to use the established feature gate.
CREATE OR REPLACE FUNCTION public.enforce_beta_write_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid;
  feature text;
  public_feature text;
  onboarding_capability text;
BEGIN
  actor := (CASE TG_TABLE_NAME
    WHEN 'private_profiles' THEN to_jsonb(NEW)->>'owner_user_id'
    WHEN 'profile_school_memberships' THEN to_jsonb(NEW)->>'owner_user_id'
    WHEN 'connection_match_tokens' THEN to_jsonb(NEW)->>'requester_user_id'
    WHEN 'connection_requests' THEN to_jsonb(NEW)->>'sender_user_id'
    WHEN 'connection_messages' THEN to_jsonb(NEW)->>'sender_user_id'
    WHEN 'connection_instagram_permissions' THEN to_jsonb(NEW)->>'grantor_user_id'
    WHEN 'promotion_accounts' THEN to_jsonb(NEW)->>'owner_user_id'
    WHEN 'promotion_requests' THEN to_jsonb(NEW)->>'owner_user_id'
    ELSE NULL END)::uuid;
  feature := CASE TG_TABLE_NAME
    WHEN 'private_profiles' THEN 'private_profile'
    WHEN 'profile_school_memberships' THEN 'private_profile'
    WHEN 'connection_match_tokens' THEN 'people_search'
    WHEN 'connection_requests' THEN 'connection_request'
    WHEN 'connection_messages' THEN 'messaging'
    WHEN 'connection_instagram_permissions' THEN 'instagram_permission'
    WHEN 'promotion_accounts' THEN 'promotion_application'
    WHEN 'promotion_requests' THEN 'promotion_application'
    ELSE 'account_registration' END;
  public_feature := CASE TG_TABLE_NAME
    WHEN 'private_profiles' THEN 'private_profile'
    WHEN 'profile_school_memberships' THEN 'school_membership'
    ELSE NULL END;
  onboarding_capability := CASE TG_TABLE_NAME
    WHEN 'private_profiles' THEN 'private_profile'
    WHEN 'profile_school_memberships' THEN 'school_membership'
    ELSE NULL END;

  IF onboarding_capability IS NOT NULL
    AND public.has_beta_onboarding_access(actor, onboarding_capability)
  THEN RETURN NEW; END IF;
  IF public_feature IS NOT NULL
    AND public.public_account_access_active(actor)
    AND public.public_account_feature_enabled(public_feature)
  THEN RETURN NEW; END IF;
  IF NOT public.has_beta_feature_access(actor, feature)
  THEN RAISE EXCEPTION 'BETA_ACCESS_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.claim_beta_invite_for_onboarding(
  actor_user_id uuid,
  requested_token_hash text,
  actor_email_hash text,
  actor_domain_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invite public.beta_invites%ROWTYPE;
  program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE;
  existing_claim public.beta_onboarding_invite_claims%ROWTYPE;
  member_count integer;
  claim_count integer;
BEGIN
  IF actor_user_id IS NULL
    OR NOT (auth.uid() = actor_user_id OR auth.role() = 'service_role' OR session_user = 'postgres')
  THEN RETURN 'UNAVAILABLE'; END IF;

  IF requested_token_hash IS NULL OR requested_token_hash !~ '^[0-9a-f]{64}$'
    OR (actor_email_hash IS NOT NULL AND actor_email_hash !~ '^[0-9a-f]{64}$')
    OR (actor_domain_hash IS NOT NULL AND actor_domain_hash !~ '^[0-9a-f]{64}$')
  THEN RETURN 'UNAVAILABLE'; END IF;

  SELECT * INTO invite
  FROM public.beta_invites
  WHERE token_hash = requested_token_hash
  FOR UPDATE;
  IF invite.id IS NULL THEN RETURN 'UNAVAILABLE'; END IF;
  SELECT * INTO snapshot
  FROM public.beta_program_setup_snapshots
  WHERE program_id = invite.program_id;
  IF snapshot.enabled_features @> ARRAY['account_registration','private_profile']::text[]
    AND snapshot.enabled_features <@ ARRAY['account_registration','private_profile']::text[]
    AND cardinality(snapshot.enabled_features) = 2
  THEN RETURN 'LEGACY_CONTRACT'; END IF;

  IF NOT EXISTS (
      SELECT 1 FROM public.public_account_launch_control launch
      WHERE launch.control_key = 'public_account' AND launch.state = 'closed'
        AND launch.account_registration_enabled = false
        AND launch.private_profile_enabled = false
        AND launch.school_membership_enabled = false
        AND launch.emergency_stopped_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.account_deletion_requests deletion
      WHERE deletion.user_id = actor_user_id AND deletion.status <> 'rejected'
    )
    OR (
      SELECT count(*)
      FROM private.private_accounts account
      JOIN private.social_identity_registry identity
        ON identity.account_id = account.id
        AND identity.auth_user_id = account.auth_user_id
        AND identity.provider = account.primary_provider
        AND identity.broker_subject = account.primary_broker_subject
      JOIN auth.identities auth_identity
        ON auth_identity.user_id = account.auth_user_id
        AND auth_identity.provider = 'custom:schoollove-' || identity.provider
        AND auth_identity.provider_id = identity.broker_subject
        AND auth_identity.identity_data ->> 'sub' = identity.broker_subject
      WHERE account.auth_user_id = actor_user_id
        AND account.status IN ('provisional','active')
        AND identity.status = account.status
    ) <> 1
  THEN RETURN 'UNAVAILABLE'; END IF;

  IF invite.revoked_at IS NOT NULL OR invite.expires_at <= now()
    OR invite.max_uses <> 1 OR invite.use_count <> 0
    OR (invite.email_hash IS NOT NULL
      AND (actor_email_hash IS NULL OR invite.email_hash <> actor_email_hash))
    OR (invite.domain_hash IS NOT NULL
      AND (actor_domain_hash IS NULL OR invite.domain_hash <> actor_domain_hash))
  THEN RETURN 'UNAVAILABLE'; END IF;

  SELECT * INTO program FROM public.beta_programs WHERE id = invite.program_id FOR UPDATE;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id = invite.program_id;

  IF program.id IS NULL OR snapshot.id IS NULL OR allowed.program_id IS NULL
    OR allowed.source_snapshot_id <> snapshot.id OR allowed.school_id <> snapshot.target_school_id
  THEN RETURN 'UNAVAILABLE'; END IF;

  IF NOT public.is_people_discovery_beta_contract(program.id)
    OR invite.expires_at > program.ends_at
  THEN RETURN 'UNAVAILABLE'; END IF;

  SELECT * INTO existing_claim
  FROM public.beta_onboarding_invite_claims
  WHERE invite_id = invite.id
  FOR UPDATE;
  IF existing_claim.id IS NOT NULL THEN
    IF existing_claim.user_id = actor_user_id
      AND existing_claim.status = 'claimed'
      AND existing_claim.expires_at > now()
    THEN RETURN 'ONBOARDING_CLAIMED'; END IF;
    RETURN 'UNAVAILABLE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.beta_members member
    WHERE member.program_id = program.id AND member.user_id = actor_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.beta_onboarding_invite_claims claim
    WHERE claim.program_id = program.id AND claim.user_id = actor_user_id
  ) THEN RETURN 'UNAVAILABLE'; END IF;

  SELECT count(*) INTO member_count FROM public.beta_members member
  WHERE member.program_id = program.id AND member.status IN ('pending_review','active','suspended');
  SELECT count(*) INTO claim_count FROM public.beta_onboarding_invite_claims claim
  WHERE claim.program_id = program.id AND claim.status = 'claimed' AND claim.expires_at > now();
  IF member_count + claim_count >= snapshot.max_users THEN RETURN 'UNAVAILABLE'; END IF;

  BEGIN
    INSERT INTO public.beta_onboarding_invite_claims(
      program_id, invite_id, user_id, target_school_id, expires_at
    ) VALUES (
      program.id, invite.id, actor_user_id, allowed.school_id,
      least(invite.expires_at, program.ends_at)
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN 'UNAVAILABLE';
  END;

  INSERT INTO public.beta_audit_logs(
    actor_type, actor_reference, action, target_type, target_id, reason_code
  ) VALUES (
    'user', actor_user_id::text, 'beta_onboarding_invite_claimed',
    'beta_invite', invite.id, 'PEOPLE_DISCOVERY_ONBOARDING'
  );
  RETURN 'ONBOARDING_CLAIMED';
END;
$$;

CREATE FUNCTION public.finalize_beta_onboarding_claim(actor_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claim public.beta_onboarding_invite_claims%ROWTYPE;
  invite public.beta_invites%ROWTYPE;
  program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE;
  member_id uuid;
  member_count integer;
  claim_count integer;
BEGIN
  IF actor_user_id IS NULL
    OR NOT (auth.uid() = actor_user_id OR auth.role() = 'service_role' OR session_user = 'postgres')
  THEN RETURN 'UNAVAILABLE'; END IF;

  SELECT * INTO claim
  FROM public.beta_onboarding_invite_claims
  WHERE user_id = actor_user_id AND status = 'claimed'
  FOR UPDATE;
  IF claim.id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.beta_members member
      WHERE member.user_id = actor_user_id AND member.status = 'pending_review'
    ) THEN RETURN 'PENDING_REVIEW'; END IF;
    RETURN 'UNAVAILABLE';
  END IF;

  SELECT * INTO program FROM public.beta_programs WHERE id = claim.program_id FOR UPDATE;
  SELECT * INTO invite FROM public.beta_invites WHERE id = claim.invite_id FOR UPDATE;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id = claim.program_id;

  IF NOT public.has_beta_onboarding_access(actor_user_id, 'school_membership')
    OR claim.expires_at <= now()
    OR program.id IS NULL OR invite.id IS NULL OR snapshot.id IS NULL
    OR invite.program_id <> program.id OR invite.revoked_at IS NOT NULL
    OR invite.expires_at <= now() OR invite.max_uses <> 1 OR invite.use_count <> 0
    OR NOT public.is_people_discovery_beta_contract(program.id)
  THEN RETURN 'UNAVAILABLE'; END IF;

  IF NOT EXISTS (
      SELECT 1 FROM public.adult_eligibility_records adult
      WHERE adult.user_id = actor_user_id AND adult.adult_eligible = true
        AND adult.verification_method = 'self_attestation'
        AND adult.policy_version = 'phase10b-2026-07-28'
    )
  THEN RETURN 'ONBOARDING_REQUIRED'; END IF;

  IF EXISTS (
    SELECT required_type
    FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
    WHERE NOT EXISTS (
      SELECT 1 FROM public.consent_records consent
      WHERE consent.user_id = actor_user_id AND consent.consent_type = required_type
        AND consent.consented = true AND consent.policy_version = 'phase10b-2026-07-28'
    )
  ) THEN RETURN 'ONBOARDING_REQUIRED'; END IF;

  IF NOT EXISTS (
      SELECT 1 FROM public.private_profiles profile
      WHERE profile.owner_user_id = actor_user_id
        AND profile.profile_visibility = 'private' AND profile.status = 'active'
    )
    OR (SELECT count(*) FROM public.profile_school_memberships membership
      WHERE membership.owner_user_id = actor_user_id) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.profile_school_memberships membership
      WHERE membership.owner_user_id = actor_user_id
        AND membership.school_id = claim.target_school_id
    )
  THEN RETURN 'ONBOARDING_REQUIRED'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.beta_members member
    WHERE member.program_id = program.id AND member.user_id = actor_user_id
  ) THEN RETURN 'PENDING_REVIEW'; END IF;

  SELECT count(*) INTO member_count FROM public.beta_members member
  WHERE member.program_id = program.id AND member.status IN ('pending_review','active','suspended');
  SELECT count(*) INTO claim_count FROM public.beta_onboarding_invite_claims other_claim
  WHERE other_claim.program_id = program.id AND other_claim.status = 'claimed'
    AND other_claim.expires_at > now() AND other_claim.id <> claim.id;
  IF member_count + claim_count >= snapshot.max_users THEN RETURN 'UNAVAILABLE'; END IF;

  INSERT INTO public.beta_members(program_id, user_id, invite_id, target_school_id, status)
  VALUES(program.id, actor_user_id, invite.id, claim.target_school_id, 'pending_review')
  RETURNING id INTO member_id;

  UPDATE public.beta_invites SET use_count = 1
  WHERE id = invite.id AND use_count = 0 AND max_uses = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'BETA_ONBOARDING_FINALIZE_RACE'; END IF;

  UPDATE public.beta_onboarding_invite_claims
  SET status = 'consumed', consumed_at = clock_timestamp()
  WHERE id = claim.id AND status = 'claimed';
  IF NOT FOUND THEN RAISE EXCEPTION 'BETA_ONBOARDING_FINALIZE_RACE'; END IF;

  INSERT INTO public.beta_audit_logs(
    actor_type, actor_reference, action, target_type, target_id, reason_code
  ) VALUES (
    'user', actor_user_id::text, 'beta_onboarding_finalized',
    'beta_member', member_id, 'PENDING_REVIEW'
  );
  RETURN 'PENDING_REVIEW';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_complete_own_adult_eligibility(
  target_user_id uuid, requested_policy_version text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE inserted_count integer;
BEGIN
  IF target_user_id IS NULL OR requested_policy_version <> 'phase10b-2026-07-28'
    OR EXISTS (
      SELECT 1 FROM public.account_deletion_requests request
      WHERE request.user_id = target_user_id AND request.status <> 'rejected'
    )
    OR NOT (
      EXISTS (
        SELECT 1 FROM public.public_account_launch_control control
        WHERE control.control_key = 'public_account'
          AND control.state IN ('internal_test','open') AND control.private_profile_enabled
      )
      OR public.has_beta_feature_access(target_user_id, 'private_profile')
      OR public.has_beta_onboarding_access(target_user_id, 'adult_eligibility')
    )
  THEN RAISE EXCEPTION 'ADULT_ELIGIBILITY_NOT_ALLOWED'; END IF;
  INSERT INTO public.adult_eligibility_records(
    user_id, adult_eligible, verification_method, policy_version
  ) VALUES (
    target_user_id, true, 'self_attestation', requested_policy_version
  ) ON CONFLICT(user_id, policy_version) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 THEN
    PERFORM public.increment_public_account_metric(
      'adult_eligibility_completed','onboarding','milestone'
    );
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_own_required_consents(requested_policy_version text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE requester uuid := auth.uid(); updated_count integer;
BEGIN
  IF requester IS NULL OR requested_policy_version <> 'phase10b-2026-07-28'
    OR NOT EXISTS (
      SELECT 1 FROM public.adult_eligibility_records
      WHERE user_id = requester AND adult_eligible AND policy_version = requested_policy_version
    )
    OR NOT public.public_account_access_active(requester)
    OR NOT (
      public.public_account_feature_enabled('private_profile')
      OR public.has_beta_feature_access(requester, 'private_profile')
      OR public.has_beta_onboarding_access(requester, 'required_consents')
    )
  THEN RAISE EXCEPTION 'CONSENT_RECORDING_NOT_ALLOWED'; END IF;
  INSERT INTO public.consent_records(user_id, consent_type, consented, policy_version)
  SELECT requester, consent_type, true, requested_policy_version
  FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) consent_type
  ON CONFLICT(user_id, consent_type, policy_version) DO NOTHING;
  UPDATE public.adult_eligibility_records SET required_consents_completed_at = clock_timestamp()
  WHERE user_id = requester AND policy_version = requested_policy_version
    AND required_consents_completed_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 1 THEN
    PERFORM public.increment_public_account_metric(
      'required_consents_completed','onboarding','milestone'
    );
  END IF;
  PERFORM public.maybe_record_own_onboarding_completion(requester);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_own_private_profile(
  requested_display_name text,
  requested_instagram_handle text,
  requested_introduction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  normalized_name text;
  normalized_instagram text;
  normalized_intro text;
  saved public.private_profiles%ROWTYPE;
  created_now boolean := false;
BEGIN
  normalized_name := btrim(normalize(requested_display_name, NFKC));
  normalized_instagram := nullif(lower(btrim(normalize(requested_instagram_handle, NFKC))), '');
  normalized_intro := nullif(btrim(normalize(requested_introduction, NFKC)), '');
  IF requester IS NULL OR NOT public.public_account_access_active(requester)
    OR NOT public.has_current_adult_access(requester)
    OR NOT (
      public.public_account_feature_enabled('private_profile')
      OR public.has_beta_feature_access(requester, 'private_profile')
      OR public.has_beta_onboarding_access(requester, 'private_profile')
    )
    OR char_length(normalized_name) NOT BETWEEN 1 AND 50 OR normalized_name ~ '[[:cntrl:]]'
    OR normalized_name ~ '[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]'
    OR (normalized_instagram IS NOT NULL AND normalized_instagram !~ '^[a-z0-9._]{1,30}$')
    OR (normalized_intro IS NOT NULL
      AND (char_length(normalized_intro) > 300 OR normalized_intro ~ '[[:cntrl:]]'))
  THEN RAISE EXCEPTION 'INVALID_PRIVATE_PROFILE'; END IF;
  INSERT INTO public.private_profiles(
    owner_user_id, display_name, instagram_handle, profile_photo_url,
    introduction, profile_visibility, status
  ) VALUES (
    requester, normalized_name, normalized_instagram, NULL,
    normalized_intro, 'private', 'active'
  ) ON CONFLICT(owner_user_id) DO UPDATE SET
    display_name = excluded.display_name,
    instagram_handle = excluded.instagram_handle,
    profile_photo_url = NULL,
    introduction = excluded.introduction,
    profile_visibility = 'private',
    status = 'active',
    updated_at = clock_timestamp()
  RETURNING * INTO saved;
  UPDATE public.adult_eligibility_records SET private_profile_first_created_at = clock_timestamp()
  WHERE user_id = requester AND policy_version = 'phase10b-2026-07-28'
    AND private_profile_first_created_at IS NULL;
  created_now := FOUND;
  IF created_now THEN
    PERFORM public.increment_public_account_metric('private_profile_created','onboarding','milestone');
  END IF;
  PERFORM public.maybe_record_own_onboarding_completion(requester);
  RETURN jsonb_build_object(
    'id', saved.id,
    'display_name', saved.display_name,
    'instagram_handle', saved.instagram_handle,
    'introduction', saved.introduction,
    'profile_visibility', saved.profile_visibility,
    'status', saved.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_public_or_controlled_beta_school_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  member public.beta_members%ROWTYPE;
  claim public.beta_onboarding_invite_claims%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE;
  member_count integer;
  existing_count integer;
  onboarding_write boolean;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.owner_user_id
  THEN RAISE EXCEPTION 'MEMBERSHIP_OWNER_REQUIRED'; END IF;

  onboarding_write := public.has_beta_onboarding_access(NEW.owner_user_id, 'school_membership');
  IF onboarding_write THEN
    SELECT * INTO claim FROM public.beta_onboarding_invite_claims candidate
    WHERE candidate.user_id = NEW.owner_user_id AND candidate.status = 'claimed'
      AND candidate.expires_at > now();
    IF claim.id IS NULL OR NEW.school_id <> claim.target_school_id
    THEN RAISE EXCEPTION 'SCHOOL_OUTSIDE_BETA_SCOPE'; END IF;
  ELSIF public.has_beta_feature_access(NEW.owner_user_id, 'private_profile') THEN
    SELECT count(*) INTO member_count
    FROM public.beta_members candidate
    JOIN public.beta_programs program ON program.id = candidate.program_id
    WHERE candidate.user_id = NEW.owner_user_id AND candidate.status = 'active'
      AND program.status = 'active' AND program.emergency_disabled_at IS NULL
      AND program.starts_at <= now() AND program.ends_at > now();
    IF member_count <> 1 THEN
      RAISE EXCEPTION 'ACTIVE_CONTROLLED_BETA_MEMBERSHIP_REQUIRED';
    END IF;
    SELECT candidate.* INTO member
    FROM public.beta_members candidate
    JOIN public.beta_programs program ON program.id = candidate.program_id
    WHERE candidate.user_id = NEW.owner_user_id AND candidate.status = 'active'
      AND program.status = 'active' AND program.emergency_disabled_at IS NULL
      AND program.starts_at <= now() AND program.ends_at > now();
    SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id = member.program_id;
    IF allowed.program_id IS NULL OR member.target_school_id IS NULL
      OR allowed.school_id <> member.target_school_id OR NEW.school_id <> allowed.school_id
    THEN RAISE EXCEPTION 'SCHOOL_OUTSIDE_BETA_SCOPE'; END IF;
  ELSIF NOT public.public_account_feature_enabled('school_membership') THEN
    RAISE EXCEPTION 'ACTIVE_CONTROLLED_BETA_MEMBERSHIP_REQUIRED';
  END IF;

  IF NEW.graduation_year > extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer
  THEN RAISE EXCEPTION 'FUTURE_GRADUATION_YEAR_NOT_ALLOWED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.private_profiles profile
    WHERE profile.id = NEW.profile_id AND profile.owner_user_id = NEW.owner_user_id
      AND profile.status = 'active' AND profile.profile_visibility = 'private'
  ) THEN RAISE EXCEPTION 'PRIVATE_PROFILE_REQUIRED'; END IF;
  IF NOT EXISTS (
      SELECT 1 FROM public.adult_eligibility_records adult
      WHERE adult.user_id = NEW.owner_user_id AND adult.adult_eligible = true
        AND adult.verification_method = 'self_attestation'
        AND adult.policy_version = 'phase10b-2026-07-28'
    ) OR EXISTS (
      SELECT required_type
      FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
      WHERE NOT EXISTS (
        SELECT 1 FROM public.consent_records consent
        WHERE consent.user_id = NEW.owner_user_id AND consent.consent_type = required_type
          AND consent.consented = true AND consent.policy_version = 'phase10b-2026-07-28'
      )
    )
  THEN RAISE EXCEPTION 'ADULT_CONSENT_REQUIRED'; END IF;

  IF onboarding_write OR public.has_beta_feature_access(NEW.owner_user_id, 'private_profile') THEN
    SELECT count(*) INTO existing_count FROM public.profile_school_memberships existing
    WHERE existing.profile_id = NEW.profile_id AND existing.id <> NEW.id;
    IF existing_count > 0 THEN RAISE EXCEPTION 'SECOND_SCHOOL_NOT_ALLOWED'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_own_school_membership_with_class_history(
  requested_school_id uuid,
  requested_graduation_year integer,
  requested_grade_classes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  own_profile public.private_profiles%ROWTYPE;
  saved public.profile_school_memberships%ROWTYPE;
  school_type_authority text;
  maximum_grade integer;
  grade_item jsonb;
  parsed_grade integer;
  parsed_class integer;
  supplied_count integer;
  distinct_grade_count integer;
  first_now boolean := false;
  saved_history jsonb;
BEGIN
  IF requester IS NULL OR NOT public.public_account_access_active(requester)
    OR NOT public.has_current_adult_access(requester)
    OR requested_graduation_year NOT BETWEEN 1900
      AND extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer
  THEN RAISE EXCEPTION 'INVALID_SCHOOL_MEMBERSHIP'; END IF;
  IF requested_grade_classes IS NULL OR jsonb_typeof(requested_grade_classes) <> 'array'
    OR jsonb_array_length(requested_grade_classes) > 6
  THEN RAISE EXCEPTION 'INVALID_GRADE_CLASS_HISTORY'; END IF;

  SELECT school.school_type INTO school_type_authority
  FROM public.schools school WHERE school.id = requested_school_id;
  IF school_type_authority IS NULL THEN RAISE EXCEPTION 'INVALID_SCHOOL_MEMBERSHIP'; END IF;
  maximum_grade := CASE school_type_authority
    WHEN 'elementary' THEN 6 WHEN 'middle' THEN 3 WHEN 'high' THEN 3 ELSE 0 END;
  IF maximum_grade = 0 AND jsonb_array_length(requested_grade_classes) > 0
  THEN RAISE EXCEPTION 'GRADE_CLASS_HISTORY_NOT_ALLOWED_FOR_SCHOOL_TYPE'; END IF;

  FOR grade_item IN SELECT value FROM jsonb_array_elements(requested_grade_classes)
  LOOP
    IF jsonb_typeof(grade_item) <> 'object'
      OR NOT (grade_item ? 'grade_number') OR NOT (grade_item ? 'class_number')
      OR jsonb_typeof(grade_item -> 'grade_number') <> 'number'
      OR jsonb_typeof(grade_item -> 'class_number') <> 'number'
      OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(grade_item) key_name
        WHERE key_name NOT IN ('grade_number','class_number')
      )
      OR (grade_item ->> 'grade_number') !~ '^[0-9]+$'
      OR (grade_item ->> 'class_number') !~ '^[0-9]+$'
    THEN RAISE EXCEPTION 'INVALID_GRADE_CLASS_HISTORY'; END IF;
    parsed_grade := (grade_item ->> 'grade_number')::integer;
    parsed_class := (grade_item ->> 'class_number')::integer;
    IF parsed_grade NOT BETWEEN 1 AND maximum_grade OR parsed_class NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_GRADE_CLASS_HISTORY'; END IF;
  END LOOP;
  SELECT count(*), count(DISTINCT (value ->> 'grade_number')::integer)
  INTO supplied_count, distinct_grade_count FROM jsonb_array_elements(requested_grade_classes);
  IF supplied_count <> distinct_grade_count
  THEN RAISE EXCEPTION 'DUPLICATE_GRADE_CLASS_HISTORY'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(requester::text, 0));
  SELECT * INTO own_profile FROM public.private_profiles
  WHERE owner_user_id = requester AND profile_visibility = 'private' AND status = 'active'
  FOR UPDATE;
  IF own_profile.id IS NULL THEN RAISE EXCEPTION 'PRIVATE_PROFILE_REQUIRED'; END IF;
  IF NOT (
    public.public_account_feature_enabled('school_membership')
    OR public.has_beta_feature_access(requester, 'private_profile')
    OR public.has_beta_onboarding_access(requester, 'school_membership')
  ) THEN RAISE EXCEPTION 'SCHOOL_MEMBERSHIP_CLOSED'; END IF;
  IF public.has_beta_onboarding_access(requester, 'school_membership')
    AND NOT EXISTS (
      SELECT 1 FROM public.beta_onboarding_invite_claims claim
      WHERE claim.user_id = requester AND claim.status = 'claimed'
        AND claim.expires_at > now() AND claim.target_school_id = requested_school_id
    )
  THEN RAISE EXCEPTION 'SCHOOL_OUTSIDE_BETA_SCOPE'; END IF;

  INSERT INTO public.profile_school_memberships(
    profile_id, owner_user_id, school_id, graduation_year, class_number
  ) VALUES (
    own_profile.id, requester, requested_school_id, requested_graduation_year, NULL
  ) RETURNING * INTO saved;
  INSERT INTO public.profile_school_class_histories(
    membership_id, owner_user_id, grade_number, class_number
  ) SELECT saved.id, requester,
      (value ->> 'grade_number')::integer, (value ->> 'class_number')::integer
    FROM jsonb_array_elements(requested_grade_classes)
    ORDER BY (value ->> 'grade_number')::integer;

  UPDATE public.adult_eligibility_records SET school_membership_first_created_at = clock_timestamp()
  WHERE user_id = requester AND policy_version = 'phase10b-2026-07-28'
    AND school_membership_first_created_at IS NULL;
  first_now := FOUND;
  IF first_now THEN
    PERFORM public.increment_public_account_metric(
      'first_school_membership_created','onboarding','milestone'
    );
  END IF;
  PERFORM public.maybe_record_own_onboarding_completion(requester);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'grade_number', history.grade_number, 'class_number', history.class_number
    ) ORDER BY history.grade_number), '[]'::jsonb)
  INTO saved_history FROM public.profile_school_class_histories history
  WHERE history.membership_id = saved.id AND history.owner_user_id = requester;
  RETURN jsonb_build_object(
    'id', saved.id, 'school_id', saved.school_id,
    'graduation_year', saved.graduation_year, 'class_number', saved.class_number,
    'class_history', saved_history
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_beta_member(
  target_member_id uuid,
  requested_status text,
  requested_reason text,
  admin_actor text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  member public.beta_members%ROWTYPE;
  program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE;
  invite public.beta_invites%ROWTYPE;
  occupied_count integer;
  people_discovery_contract boolean;
BEGIN
  IF requested_status NOT IN ('active','suspended','rejected','withdrawn')
    OR requested_reason !~ '^[A-Z0-9_]{2,60}$'
    OR char_length(admin_actor) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'INVALID_REVIEW'; END IF;
  SELECT * INTO member FROM public.beta_members WHERE id = target_member_id FOR UPDATE;
  IF member.id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF requested_status = 'active' AND member.status = 'active' THEN RETURN true; END IF;
  IF requested_status = 'active' THEN
    IF member.status <> 'pending_review' THEN RAISE EXCEPTION 'MEMBER_NOT_PENDING_REVIEW'; END IF;
    SELECT * INTO program FROM public.beta_programs WHERE id = member.program_id FOR UPDATE;
    IF program.id IS NULL OR program.status <> 'active' OR program.emergency_disabled_at IS NOT NULL
      OR program.starts_at > now() OR program.ends_at <= now()
    THEN RAISE EXCEPTION 'PROGRAM_UNAVAILABLE'; END IF;
    SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id = program.id;
    SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id = program.id;
    IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id <> snapshot.id
      OR allowed.school_id <> snapshot.target_school_id OR member.target_school_id <> allowed.school_id
    THEN RAISE EXCEPTION 'PROGRAM_SCHOOL_CONTRACT_INVALID'; END IF;
    IF snapshot.approval_waitlist_enabled IS DISTINCT FROM true
      OR program.requires_admin_approval IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'APPROVAL_POLICY_INVALID'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.adult_eligibility_records adult
        WHERE adult.user_id = member.user_id AND adult.adult_eligible = true
          AND adult.verification_method = 'self_attestation'
          AND adult.policy_version = 'phase10b-2026-07-28'
      ) OR EXISTS (
        SELECT required_type
        FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
        WHERE NOT EXISTS (
          SELECT 1 FROM public.consent_records consent
          WHERE consent.user_id = member.user_id AND consent.consent_type = required_type
            AND consent.consented = true AND consent.policy_version = 'phase10b-2026-07-28'
        )
      )
    THEN RAISE EXCEPTION 'ADULT_CONSENT_REQUIRED'; END IF;
    SELECT * INTO invite FROM public.beta_invites
    WHERE id = member.invite_id AND program_id = program.id FOR UPDATE;
    IF invite.id IS NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at <= now()
      OR invite.max_uses <> 1 OR invite.use_count <> 1 OR invite.expires_at > program.ends_at
    THEN RAISE EXCEPTION 'INVITE_CONTRACT_INVALID'; END IF;

    people_discovery_contract := snapshot.enabled_features @>
      ARRAY['people_search','connection_request']::text[]
      AND snapshot.enabled_features <@ ARRAY['people_search','connection_request']::text[]
      AND cardinality(snapshot.enabled_features) = 2;
    IF people_discovery_contract THEN
      IF NOT public.is_people_discovery_beta_contract(program.id)
      THEN RAISE EXCEPTION 'PROGRAM_FEATURE_SET_INCOMPLETE'; END IF;
      IF NOT EXISTS (
          SELECT 1 FROM public.private_profiles profile
          WHERE profile.owner_user_id = member.user_id
            AND profile.profile_visibility = 'private' AND profile.status = 'active'
        )
        OR (SELECT count(*) FROM public.profile_school_memberships membership
          WHERE membership.owner_user_id = member.user_id) <> 1
        OR NOT EXISTS (
          SELECT 1 FROM public.profile_school_memberships membership
          WHERE membership.owner_user_id = member.user_id
            AND membership.school_id = member.target_school_id
        )
      THEN RAISE EXCEPTION 'PEOPLE_DISCOVERY_ONBOARDING_INCOMPLETE'; END IF;
    END IF;

    SELECT count(*) INTO occupied_count FROM public.beta_members candidate
    WHERE candidate.program_id = program.id AND candidate.id <> member.id
      AND candidate.status IN ('pending_review','active','suspended');
    IF occupied_count >= snapshot.max_users THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  END IF;
  UPDATE public.beta_members SET
    status = requested_status, reviewed_at = now(), reviewed_by = admin_actor,
    reason_code = requested_reason, updated_at = now()
  WHERE id = member.id;
  INSERT INTO public.beta_audit_logs(
    actor_type, actor_reference, action, target_type, target_id, reason_code
  ) VALUES ('admin', admin_actor, 'member_reviewed', 'beta_member', member.id, requested_reason);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_people_discovery_beta_contract(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_beta_onboarding_access(uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_beta_write_access()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_beta_invite_for_onboarding(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_beta_onboarding_claim(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_public_or_controlled_beta_school_membership()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_beta_onboarding_access(uuid,text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_beta_invite_for_onboarding(uuid,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_beta_onboarding_claim(uuid)
  TO service_role;

COMMIT;
