-- Add an exact Connected Instagram controlled-beta contract without changing
-- the existing Account / Private or People Discovery snapshots.
-- No table, column, program, invite, member, launch, or feature exposure is changed.

BEGIN;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('connected-instagram-beta-contract-v1', 0)
);

CREATE OR REPLACE FUNCTION private.controlled_beta_contract_kind(requested_features text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN requested_features @> ARRAY['account_registration','private_profile']::text[]
      AND requested_features <@ ARRAY['account_registration','private_profile']::text[]
      AND cardinality(requested_features) = 2
      THEN 'ACCOUNT_PRIVATE_BETA'
    WHEN requested_features @> ARRAY['people_search','connection_request']::text[]
      AND requested_features <@ ARRAY['people_search','connection_request']::text[]
      AND cardinality(requested_features) = 2
      THEN 'PEOPLE_DISCOVERY_BETA'
    WHEN requested_features @> ARRAY['instagram_permission']::text[]
      AND requested_features <@ ARRAY['instagram_permission']::text[]
      AND cardinality(requested_features) = 1
      THEN 'CONNECTED_INSTAGRAM_BETA'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.controlled_beta_contract_max_users(contract_kind text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE contract_kind
    WHEN 'ACCOUNT_PRIVATE_BETA' THEN 20
    WHEN 'PEOPLE_DISCOVERY_BETA' THEN 20
    WHEN 'CONNECTED_INSTAGRAM_BETA' THEN 3
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.has_connected_instagram_beta_prerequisites(
  target_user_id uuid,
  target_school_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_user_id IS NOT NULL
    AND target_school_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.adult_eligibility_records adult
      WHERE adult.user_id = target_user_id
        AND adult.adult_eligible = true
        AND adult.verification_method = 'self_attestation'
        AND adult.policy_version = 'phase10b-2026-07-28'
    )
    AND NOT EXISTS (
      SELECT required_type
      FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) required_type
      WHERE NOT EXISTS (
        SELECT 1 FROM public.consent_records consent
        WHERE consent.user_id = target_user_id
          AND consent.consent_type = required_type
          AND consent.consented = true
          AND consent.policy_version = 'phase10b-2026-07-28'
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.private_profiles profile
      WHERE profile.owner_user_id = target_user_id
        AND profile.profile_visibility = 'private'
        AND profile.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.profile_school_memberships membership
      WHERE membership.owner_user_id = target_user_id
        AND membership.school_id = target_school_id
    )
    AND EXISTS (
      SELECT 1 FROM public.beta_members member
      WHERE member.user_id = target_user_id
        AND member.target_school_id = target_school_id
        AND member.status = 'active'
        AND public.is_people_discovery_beta_contract(member.program_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.connections connection
      WHERE connection.status = 'active'
        AND connection.disconnected_at IS NULL
        AND target_user_id IN (connection.user_low_id, connection.user_high_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_save_beta_setup(
  target_draft_id uuid, requested_draft_key text, requested_name text,
  requested_starts_at timestamptz, requested_ends_at timestamptz, requested_max_users integer,
  requested_target_scope text, requested_target_school_id uuid, requested_features text[],
  requested_invite_policy jsonb, requested_waitlist boolean, requested_stop_conditions jsonb,
  requested_memo text, requested_status text, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  result_id uuid;
  existing_draft public.beta_setup_drafts%ROWTYPE;
  previous_key text;
  contract_kind text := private.controlled_beta_contract_kind(requested_features);
BEGIN
  IF char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_ADMIN_ACTOR'; END IF;
  IF requested_status NOT IN ('draft','validated','archived') THEN RAISE EXCEPTION 'INVALID_SETUP_STATUS'; END IF;
  IF requested_draft_key !~ '^[a-z0-9][a-z0-9_-]{2,39}$' THEN RAISE EXCEPTION 'INVALID_DRAFT_KEY'; END IF;
  IF requested_status='validated' AND requested_target_school_id IS NULL THEN RAISE EXCEPTION 'TARGET_SCHOOL_REQUIRED'; END IF;
  IF requested_target_school_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.schools school WHERE school.id=requested_target_school_id)
    THEN RAISE EXCEPTION 'TARGET_SCHOOL_NOT_FOUND'; END IF;
  IF contract_kind IS NULL THEN
    IF requested_features && ARRAY['account_registration','private_profile']::text[]
      THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_FEATURE_SET';
      ELSE RAISE EXCEPTION 'INVALID_CONTROLLED_BETA_FEATURE_SET';
    END IF;
  END IF;
  IF requested_stop_conditions IS NULL OR jsonb_typeof(requested_stop_conditions) IS DISTINCT FROM 'object'
    OR NOT (requested_stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'REQUIRED_STOP_CONDITION_MISSING'; END IF;
  IF requested_invite_policy IS NULL OR jsonb_typeof(requested_invite_policy) IS DISTINCT FROM 'object'
    OR requested_invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_INVITE_POLICY'; END IF;
  IF requested_status='validated' AND (
    requested_max_users IS DISTINCT FROM private.controlled_beta_contract_max_users(contract_kind)
    OR requested_starts_at IS NULL OR requested_ends_at IS NULL
    OR requested_ends_at-requested_starts_at<>interval '14 days'
    OR requested_waitlist IS DISTINCT FROM true
  ) THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_CONTRACT'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase10j-program-key:'||requested_draft_key,0));
  IF EXISTS(SELECT 1 FROM public.beta_programs WHERE program_key=requested_draft_key) THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END IF;
  IF target_draft_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.beta_setup_drafts WHERE draft_key=requested_draft_key) THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END IF;
    BEGIN
      INSERT INTO public.beta_setup_drafts(
        draft_key,name,starts_at,ends_at,max_users,target_scope,target_school_id,enabled_features,
        invite_policy,approval_waitlist_enabled,stop_conditions,operator_memo,status,created_by
      ) VALUES(
        requested_draft_key,requested_name,requested_starts_at,requested_ends_at,requested_max_users,
        requested_target_scope,requested_target_school_id,requested_features,requested_invite_policy,
        requested_waitlist,requested_stop_conditions,coalesce(requested_memo,''),requested_status,admin_actor
      ) RETURNING id INTO result_id;
    EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END;
    previous_key:=NULL;
  ELSE
    SELECT * INTO existing_draft FROM public.beta_setup_drafts WHERE id=target_draft_id FOR UPDATE;
    IF existing_draft.id IS NULL THEN RAISE EXCEPTION 'DRAFT_NOT_FOUND'; END IF;
    IF existing_draft.status='activated' THEN RAISE EXCEPTION 'DRAFT_ALREADY_ACTIVATED'; END IF;
    IF EXISTS(SELECT 1 FROM public.beta_setup_drafts WHERE draft_key=requested_draft_key AND id<>target_draft_id)
      THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END IF;
    previous_key:=existing_draft.draft_key;
    BEGIN
      UPDATE public.beta_setup_drafts SET
        draft_key=requested_draft_key,name=requested_name,starts_at=requested_starts_at,ends_at=requested_ends_at,
        max_users=requested_max_users,target_scope=requested_target_scope,target_school_id=requested_target_school_id,
        enabled_features=requested_features,invite_policy=requested_invite_policy,
        approval_waitlist_enabled=requested_waitlist,stop_conditions=requested_stop_conditions,
        operator_memo=coalesce(requested_memo,''),status=requested_status,updated_at=now()
      WHERE id=target_draft_id RETURNING id INTO result_id;
    EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'DRAFT_KEY_CONFLICT'; END;
  END IF;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'beta_setup_saved','beta_setup_draft',result_id,upper(requested_status));
  IF previous_key IS DISTINCT FROM requested_draft_key THEN
    INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
    VALUES('admin',admin_actor,'beta_setup_key_changed','beta_setup_draft',result_id,'DRAFT_KEY_CHANGED',
      jsonb_build_object('previous_key',previous_key,'new_key',requested_draft_key));
  END IF;
  RETURN result_id;
END; $$;

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
  contract_kind text;
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
    contract_kind:=private.controlled_beta_contract_kind(snapshot.enabled_features);
    IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id <> snapshot.id
      OR allowed.school_id <> snapshot.target_school_id OR member.target_school_id <> allowed.school_id
      OR (SELECT count(*) FROM public.beta_program_schools scope WHERE scope.program_id=program.id)<>1
      OR contract_kind IS NULL
      OR snapshot.max_users IS DISTINCT FROM private.controlled_beta_contract_max_users(contract_kind)
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

    IF contract_kind='PEOPLE_DISCOVERY_BETA' THEN
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
    ELSIF contract_kind='CONNECTED_INSTAGRAM_BETA' THEN
      IF (SELECT count(*) FROM public.beta_feature_flags flag
          WHERE flag.program_id=program.id AND flag.user_id IS NULL)<>8
        OR EXISTS(SELECT 1 FROM public.beta_feature_flags flag
          WHERE flag.program_id=program.id AND flag.user_id IS NULL
            AND flag.enabled IS DISTINCT FROM (flag.feature_key='instagram_permission'))
        OR EXISTS(SELECT 1 FROM public.beta_feature_flags global_stop
          WHERE global_stop.program_id IS NULL AND global_stop.user_id IS NULL
            AND global_stop.feature_key='instagram_permission' AND global_stop.enabled=false)
      THEN RAISE EXCEPTION 'PROGRAM_FEATURE_SET_INCOMPLETE'; END IF;
      IF NOT private.has_connected_instagram_beta_prerequisites(member.user_id,member.target_school_id)
      THEN RAISE EXCEPTION 'CONNECTED_INSTAGRAM_APPROVAL_PREREQUISITES_REQUIRED'; END IF;
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

CREATE OR REPLACE FUNCTION public.admin_issue_beta_invite(
  target_program_id uuid, requested_token_hash text, requested_email_hash text,
  requested_domain_hash text, requested_max_uses integer,
  requested_expires_at timestamptz, admin_actor text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  invite_id uuid;
  program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE;
  occupied integer;
  outstanding integer;
  contract_kind text;
BEGIN
  IF requested_token_hash !~ '^[0-9a-f]{64}$'
    OR (requested_email_hash IS NOT NULL AND requested_email_hash !~ '^[0-9a-f]{64}$')
    OR (requested_domain_hash IS NOT NULL AND requested_domain_hash !~ '^[0-9a-f]{64}$')
    OR requested_max_uses<>1 OR requested_expires_at<=now()
    OR requested_expires_at>now()+interval '7 days' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_INVITE'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL OR program.status<>'active' OR program.emergency_disabled_at IS NOT NULL
    OR now()<program.starts_at OR now()>=program.ends_at THEN RAISE EXCEPTION 'PROGRAM_UNAVAILABLE'; END IF;
  IF requested_expires_at>program.ends_at THEN RAISE EXCEPTION 'INVITE_EXCEEDS_PROGRAM_END'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
  contract_kind:=private.controlled_beta_contract_kind(snapshot.enabled_features);
  IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id
    OR allowed.school_id<>snapshot.target_school_id
    OR (SELECT count(*) FROM public.beta_program_schools scope WHERE scope.program_id=program.id)<>1
    THEN RAISE EXCEPTION 'PROGRAM_SCHOOL_CONTRACT_INVALID'; END IF;
  IF contract_kind IS NULL
    OR snapshot.max_users IS DISTINCT FROM private.controlled_beta_contract_max_users(contract_kind)
    OR snapshot.invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR snapshot.approval_waitlist_enabled IS DISTINCT FROM true
    OR program.requires_admin_approval IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'INVITE_POLICY_NOT_ACTIVE'; END IF;
  IF (SELECT count(*) FROM public.beta_feature_flags flag
      WHERE flag.program_id=program.id AND flag.user_id IS NULL)<>8
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags flag
      WHERE flag.program_id=program.id AND flag.user_id IS NULL
        AND flag.enabled IS DISTINCT FROM (flag.feature_key=ANY(snapshot.enabled_features)))
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags global_stop
      WHERE global_stop.program_id IS NULL AND global_stop.user_id IS NULL
        AND global_stop.feature_key=ANY(snapshot.enabled_features) AND global_stop.enabled=false)
    THEN RAISE EXCEPTION 'PROGRAM_FEATURE_SET_INCOMPLETE'; END IF;
  SELECT count(*) INTO occupied FROM public.beta_members
    WHERE program_id=program.id AND status IN ('pending_review','active','suspended');
  SELECT count(*) INTO outstanding FROM public.beta_invites
    WHERE program_id=program.id AND revoked_at IS NULL AND expires_at>now() AND use_count<max_uses;
  IF occupied+outstanding>=snapshot.max_users THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  INSERT INTO public.beta_invites(program_id,token_hash,email_hash,domain_hash,max_uses,expires_at,created_by)
  VALUES(program.id,requested_token_hash,requested_email_hash,requested_domain_hash,1,requested_expires_at,admin_actor)
  RETURNING id INTO invite_id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'invite_issued','beta_invite',invite_id,'FIRST_BETA_SINGLE_USE',
    jsonb_build_object('contract_kind',contract_kind));
  RETURN invite_id;
END; $$;

CREATE OR REPLACE FUNCTION public.redeem_beta_invite(
  actor_user_id uuid, requested_token_hash text, actor_email_hash text, actor_domain_hash text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  invite public.beta_invites%ROWTYPE;
  program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE;
  next_status text;
  reserved_count integer;
  member_id uuid;
  contract_kind text;
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
  contract_kind:=private.controlled_beta_contract_kind(snapshot.enabled_features);
  IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id
    OR allowed.school_id<>snapshot.target_school_id
    OR (SELECT count(*) FROM public.beta_program_schools scope WHERE scope.program_id=program.id)<>1
    OR contract_kind IS NULL
    OR snapshot.max_users IS DISTINCT FROM private.controlled_beta_contract_max_users(contract_kind)
    THEN RETURN 'PROGRAM_CONTRACT_UNAVAILABLE'; END IF;
  IF snapshot.approval_waitlist_enabled IS DISTINCT FROM true
    OR program.requires_admin_approval IS DISTINCT FROM true THEN RETURN 'WAITLIST_DISABLED'; END IF;
  IF contract_kind='CONNECTED_INSTAGRAM_BETA'
    AND NOT private.has_connected_instagram_beta_prerequisites(actor_user_id,allowed.school_id)
    THEN RETURN 'CONNECTED_INSTAGRAM_PREREQUISITES_REQUIRED'; END IF;
  SELECT count(*) INTO reserved_count FROM public.beta_members
    WHERE program_id=program.id AND status IN ('pending_review','active','suspended');
  IF reserved_count>=snapshot.max_users THEN RETURN 'PROGRAM_FULL'; END IF;
  next_status:='pending_review';
  INSERT INTO public.beta_members(program_id,user_id,invite_id,target_school_id,status)
  VALUES(program.id,actor_user_id,invite.id,allowed.school_id,next_status) RETURNING id INTO member_id;
  UPDATE public.beta_invites SET use_count=use_count+1 WHERE id=invite.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('user',actor_user_id::text,'invite_redeemed','beta_member',member_id,'SCHOOL_SCOPE_BOUND',
    jsonb_build_object('contract_kind',contract_kind));
  RETURN upper(next_status);
END; $$;

CREATE OR REPLACE FUNCTION public.has_beta_feature_access(target_user_id uuid, requested_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT target_user_id IS NOT NULL
    AND (auth.uid()=target_user_id OR auth.role()='service_role' OR session_user='postgres')
    AND requested_feature IN ('account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations')
    AND NOT EXISTS (
      SELECT 1 FROM public.beta_feature_flags global_stop
      WHERE global_stop.program_id IS NULL AND global_stop.user_id IS NULL
        AND global_stop.feature_key=requested_feature AND global_stop.enabled=false
    )
    AND NOT (
      requested_feature='connection_request' AND EXISTS (
        SELECT 1 FROM public.beta_feature_flags dependency_stop
        WHERE dependency_stop.program_id IS NULL AND dependency_stop.user_id IS NULL
          AND dependency_stop.feature_key='people_search' AND dependency_stop.enabled=false
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.safety_account_restrictions restriction
      WHERE restriction.user_id=target_user_id AND restriction.status='suspended'
    )
    AND EXISTS (
      SELECT 1 FROM public.beta_members member
      JOIN public.beta_programs program ON program.id=member.program_id
      JOIN public.beta_program_setup_snapshots snapshot ON snapshot.program_id=program.id
      JOIN public.beta_program_schools allowed
        ON allowed.program_id=program.id AND allowed.source_snapshot_id=snapshot.id
      WHERE member.user_id=target_user_id AND member.status='active' AND program.status='active'
        AND program.emergency_disabled_at IS NULL
        AND program.starts_at<=now() AND program.ends_at>now()
        AND member.target_school_id=allowed.school_id AND allowed.school_id=snapshot.target_school_id
        AND private.controlled_beta_contract_kind(snapshot.enabled_features) IS NOT NULL
        AND snapshot.max_users=private.controlled_beta_contract_max_users(
          private.controlled_beta_contract_kind(snapshot.enabled_features)
        )
        AND requested_feature=ANY(snapshot.enabled_features)
        AND EXISTS(
          SELECT 1 FROM public.beta_feature_flags program_flag
          WHERE program_flag.program_id=program.id AND program_flag.user_id IS NULL
            AND program_flag.feature_key=requested_feature AND program_flag.enabled=true
        )
        AND COALESCE((
          SELECT user_flag.enabled FROM public.beta_feature_flags user_flag
          WHERE user_flag.user_id=target_user_id AND user_flag.program_id IS NULL
            AND user_flag.feature_key=requested_feature
        ),true)
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_configure_controlled_beta_features(
  target_program_id uuid, requested_enabled_features text[], admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE;
  current_valid boolean;
  contract_kind text;
  snapshot_kind text;
  expected_enabled_count integer;
BEGIN
  IF char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_ADMIN_ACTOR'; END IF;
  contract_kind:=private.controlled_beta_contract_kind(requested_enabled_features);
  IF contract_kind IS NULL THEN
    IF requested_enabled_features && ARRAY['account_registration','private_profile']::text[]
      THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_FEATURE_SET';
      ELSE RAISE EXCEPTION 'INVALID_CONTROLLED_BETA_FEATURE_SET';
    END IF;
  END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  IF program.status<>'paused' OR program.emergency_disabled_at IS NOT NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_CONFIGURABLE'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  snapshot_kind:=private.controlled_beta_contract_kind(snapshot.enabled_features);
  IF snapshot.id IS NULL OR snapshot_kind IS NULL
    OR snapshot.max_users IS DISTINCT FROM private.controlled_beta_contract_max_users(snapshot_kind)
    OR snapshot_kind<>contract_kind
  THEN RAISE EXCEPTION 'PROGRAM_SETUP_CONTRACT_INVALID'; END IF;
  IF NOT (requested_enabled_features @> snapshot.enabled_features AND requested_enabled_features <@ snapshot.enabled_features)
    THEN RAISE EXCEPTION 'PROGRAM_SETUP_CONTRACT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.beta_invites WHERE program_id=program.id)
    OR EXISTS(SELECT 1 FROM public.beta_members WHERE program_id=program.id)
    THEN RAISE EXCEPTION 'PROGRAM_ALREADY_USED'; END IF;
  expected_enabled_count:=cardinality(snapshot.enabled_features);
  SELECT count(*)=8
    AND count(*) FILTER(WHERE enabled)=expected_enabled_count
    AND count(*) FILTER(WHERE enabled AND feature_key=ANY(snapshot.enabled_features))=expected_enabled_count
    AND count(*) FILTER(WHERE enabled AND feature_key<>ALL(snapshot.enabled_features))=0
    INTO current_valid
  FROM public.beta_feature_flags WHERE program_id=program.id AND user_id IS NULL;
  IF current_valid THEN RETURN true; END IF;
  INSERT INTO public.beta_feature_flags(program_id,user_id,feature_key,enabled,reason_code,updated_by)
  SELECT program.id,NULL,feature_key,feature_key=ANY(snapshot.enabled_features),contract_kind,admin_actor
  FROM unnest(ARRAY[
    'account_registration','private_profile','people_search','connection_request','messaging',
    'instagram_permission','promotion_application','promotion_operations'
  ]::text[]) feature_key
  ON CONFLICT(program_id,feature_key) WHERE program_id IS NOT NULL AND user_id IS NULL
  DO UPDATE SET enabled=excluded.enabled,reason_code=excluded.reason_code,updated_by=excluded.updated_by,updated_at=now();
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code)
  VALUES('admin',admin_actor,'controlled_beta_features_configured','beta_program',program.id,contract_kind);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_start_controlled_beta_program(
  target_program_id uuid, requested_reason text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE;
  flag_count integer;
  enabled_count integer;
  readiness public.beta_readiness_snapshots%ROWTYPE;
  contract_kind text;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR char_length(admin_actor) NOT BETWEEN 1 AND 100
    THEN RAISE EXCEPTION 'INVALID_START_REQUEST'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  IF program.status='active' AND EXISTS(
    SELECT 1 FROM public.beta_audit_logs log WHERE log.target_id=program.id AND log.action='controlled_beta_started'
  ) THEN RETURN true; END IF;
  IF program.status<>'paused' THEN RAISE EXCEPTION 'PROGRAM_NOT_PAUSED'; END IF;
  IF program.program_key='limited_beta_2026' OR program.emergency_disabled_at IS NOT NULL
    THEN RAISE EXCEPTION 'LEGACY_OR_EMERGENCY_PROGRAM_REJECTED'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  IF snapshot.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_SETUP_SNAPSHOT_REQUIRED'; END IF;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
  IF allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id OR allowed.school_id<>snapshot.target_school_id
    OR (SELECT count(*) FROM public.beta_program_schools scope WHERE scope.program_id=program.id)<>1
    THEN RAISE EXCEPTION 'PROGRAM_SCHOOL_CONTRACT_INVALID'; END IF;
  contract_kind:=private.controlled_beta_contract_kind(snapshot.enabled_features);
  IF contract_kind IS NULL
    OR snapshot.max_users IS DISTINCT FROM private.controlled_beta_contract_max_users(contract_kind)
    OR program.starts_at IS NULL OR program.ends_at IS NULL
    OR program.ends_at-program.starts_at<>interval '14 days'
    OR now()<program.starts_at OR now()>=program.ends_at
    OR snapshot.invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR snapshot.approval_waitlist_enabled IS DISTINCT FROM true
    OR NOT (snapshot.stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'PROGRAM_SETUP_CONTRACT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.beta_invites WHERE program_id=program.id)
    OR EXISTS(SELECT 1 FROM public.beta_members WHERE program_id=program.id)
    THEN RAISE EXCEPTION 'PROGRAM_ALREADY_USED'; END IF;
  SELECT count(*),count(*) FILTER(WHERE enabled) INTO flag_count,enabled_count
    FROM public.beta_feature_flags WHERE program_id=program.id AND user_id IS NULL;
  IF flag_count<>8 OR enabled_count<>cardinality(snapshot.enabled_features)
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags
      WHERE program_id=program.id AND enabled AND feature_key<>ALL(snapshot.enabled_features))
    OR EXISTS(SELECT 1 FROM unnest(snapshot.enabled_features) AS expected(feature) WHERE NOT EXISTS(
      SELECT 1 FROM public.beta_feature_flags flag
      WHERE flag.program_id=program.id AND flag.user_id IS NULL AND flag.feature_key=expected.feature AND flag.enabled))
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id IS NULL AND user_id IS NULL
      AND feature_key=ANY(snapshot.enabled_features) AND enabled=false)
    THEN RAISE EXCEPTION 'PROGRAM_FEATURE_SET_INCOMPLETE'; END IF;
  SELECT * INTO readiness FROM public.beta_readiness_snapshots WHERE program_id=program.id ORDER BY created_at DESC LIMIT 1;
  IF readiness.id IS NULL OR readiness.status<>'limited_beta' OR readiness.operator_decision IS DISTINCT FROM true
    OR cardinality(readiness.blocker_codes)<>0 THEN RAISE EXCEPTION 'FRESH_READINESS_REQUIRED'; END IF;
  UPDATE public.beta_programs SET status='active',updated_at=now() WHERE id=program.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'controlled_beta_started','beta_program',program.id,requested_reason,
    jsonb_build_object('snapshot_id',snapshot.id,'school_contract',true,'max_users',snapshot.max_users,'duration_days',14,'contract_kind',contract_kind));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_controlled_beta_program(
  target_program_id uuid, requested_reason text, requested_resolution_code text, admin_actor text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  program public.beta_programs%ROWTYPE;
  snapshot public.beta_program_setup_snapshots%ROWTYPE;
  allowed public.beta_program_schools%ROWTYPE;
  readiness public.beta_readiness_snapshots%ROWTYPE;
  flag_count integer;
  enabled_count integer;
  occupied integer;
  contract_kind text;
BEGIN
  IF requested_reason !~ '^[A-Z0-9_]{2,60}$' OR requested_resolution_code !~ '^[A-Z0-9_]{2,60}$'
    OR char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_REACTIVATION_REQUEST'; END IF;
  SELECT * INTO program FROM public.beta_programs WHERE id=target_program_id FOR UPDATE;
  IF program.id IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_FOUND'; END IF;
  IF program.program_key='limited_beta_2026' THEN RAISE EXCEPTION 'LEGACY_PROGRAM_REJECTED'; END IF;
  IF program.status='active' AND program.emergency_disabled_at IS NULL
    AND EXISTS(SELECT 1 FROM public.beta_audit_logs WHERE target_id=program.id AND action='controlled_beta_reactivated')
    THEN RETURN true; END IF;
  IF program.status<>'paused' OR program.emergency_disabled_at IS NULL THEN RAISE EXCEPTION 'PROGRAM_NOT_REACTIVATABLE'; END IF;
  SELECT * INTO snapshot FROM public.beta_program_setup_snapshots WHERE program_id=program.id;
  SELECT * INTO allowed FROM public.beta_program_schools WHERE program_id=program.id;
  IF snapshot.id IS NULL OR allowed.program_id IS NULL OR allowed.source_snapshot_id<>snapshot.id
    OR allowed.school_id<>snapshot.target_school_id
    OR (SELECT count(*) FROM public.beta_program_schools scope WHERE scope.program_id=program.id)<>1
    THEN RAISE EXCEPTION 'PROGRAM_SCHOOL_CONTRACT_INVALID'; END IF;
  contract_kind:=private.controlled_beta_contract_kind(snapshot.enabled_features);
  IF contract_kind IS NULL
    OR snapshot.max_users IS DISTINCT FROM private.controlled_beta_contract_max_users(contract_kind)
    OR program.starts_at IS NULL OR program.ends_at IS NULL
    OR program.ends_at-program.starts_at<>interval '14 days' OR now()<program.starts_at OR now()>=program.ends_at
    OR snapshot.invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR snapshot.approval_waitlist_enabled IS DISTINCT FROM true
    OR NOT (snapshot.stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'PROGRAM_SETUP_CONTRACT_INVALID'; END IF;
  SELECT count(*),count(*) FILTER(WHERE enabled) INTO flag_count,enabled_count
    FROM public.beta_feature_flags WHERE program_id=program.id AND user_id IS NULL;
  IF flag_count<>8 OR enabled_count<>cardinality(snapshot.enabled_features)
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags
      WHERE program_id=program.id AND enabled AND feature_key<>ALL(snapshot.enabled_features))
    OR EXISTS(SELECT 1 FROM unnest(snapshot.enabled_features) AS expected(feature) WHERE NOT EXISTS(
      SELECT 1 FROM public.beta_feature_flags flag
      WHERE flag.program_id=program.id AND flag.user_id IS NULL AND flag.feature_key=expected.feature AND flag.enabled))
    OR EXISTS(SELECT 1 FROM public.beta_feature_flags WHERE program_id IS NULL AND user_id IS NULL
      AND feature_key=ANY(snapshot.enabled_features) AND enabled=false)
    THEN RAISE EXCEPTION 'PROGRAM_FEATURE_SET_INCOMPLETE'; END IF;
  SELECT count(*) INTO occupied FROM public.beta_members WHERE program_id=program.id AND status IN ('pending_review','active','suspended');
  IF occupied>snapshot.max_users THEN RAISE EXCEPTION 'PROGRAM_FULL'; END IF;
  SELECT * INTO readiness FROM public.beta_readiness_snapshots
    WHERE program_id=program.id AND created_at>program.emergency_disabled_at ORDER BY created_at DESC LIMIT 1;
  IF readiness.id IS NULL OR readiness.status<>'limited_beta' OR readiness.operator_decision IS DISTINCT FROM true
    OR cardinality(readiness.blocker_codes)<>0 THEN RAISE EXCEPTION 'FRESH_READINESS_REQUIRED'; END IF;
  UPDATE public.beta_programs SET status='active',emergency_disabled_at=NULL,updated_at=now() WHERE id=program.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'controlled_beta_reactivated','beta_program',program.id,requested_reason,
    jsonb_build_object('resolution_code',requested_resolution_code,'readiness_id',readiness.id,'contract_kind',contract_kind));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_activate_beta_setup(target_draft_id uuid, admin_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  draft public.beta_setup_drafts%ROWTYPE;
  program_id uuid;
  snapshot_id uuid;
  contract_kind text;
BEGIN
  IF char_length(admin_actor) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_ADMIN_ACTOR'; END IF;
  SELECT * INTO draft FROM public.beta_setup_drafts WHERE id=target_draft_id FOR UPDATE;
  IF draft.id IS NULL THEN RAISE EXCEPTION 'SETUP_NOT_FOUND'; END IF;
  IF draft.status='activated' THEN
    SELECT snapshot.program_id INTO program_id FROM public.beta_program_setup_snapshots snapshot
      JOIN public.beta_program_schools allowed ON allowed.source_snapshot_id=snapshot.id AND allowed.program_id=snapshot.program_id
      WHERE snapshot.source_draft_id=draft.id;
    IF program_id IS NULL THEN RAISE EXCEPTION 'ACTIVATED_SETUP_CONTRACT_MISSING'; END IF;
    RETURN program_id;
  END IF;
  IF draft.status<>'validated' THEN RAISE EXCEPTION 'SETUP_NOT_VALIDATED'; END IF;
  IF draft.target_school_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.schools WHERE id=draft.target_school_id)
    THEN RAISE EXCEPTION 'TARGET_SCHOOL_NOT_FOUND'; END IF;
  contract_kind:=private.controlled_beta_contract_kind(draft.enabled_features);
  IF contract_kind IS NULL
    OR draft.max_users IS DISTINCT FROM private.controlled_beta_contract_max_users(contract_kind)
    OR draft.starts_at IS NULL OR draft.ends_at IS NULL
    OR draft.ends_at-draft.starts_at<>interval '14 days'
    OR draft.invite_policy IS DISTINCT FROM '{"maxUsesPerInvite":1,"expiresInDays":7}'::jsonb
    OR draft.approval_waitlist_enabled IS DISTINCT FROM true
    OR NOT (draft.stop_conditions @> '{"PRIVACY_EXPOSURE":true,"RLS_FAILURE":true,"HEALTH_FAILURE":true}'::jsonb)
    THEN RAISE EXCEPTION 'INVALID_FIRST_BETA_CONTRACT'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase10j-program-key:'||draft.draft_key,0));
  IF EXISTS(SELECT 1 FROM public.beta_programs WHERE program_key=draft.draft_key) THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END IF;
  BEGIN
    INSERT INTO public.beta_programs(program_key,name,status,requires_admin_approval,starts_at,ends_at)
    VALUES(draft.draft_key,draft.name,'paused',true,draft.starts_at,draft.ends_at) RETURNING id INTO program_id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'PROGRAM_KEY_CONFLICT'; END;
  INSERT INTO public.beta_program_setup_snapshots(
    program_id,source_draft_id,max_users,target_scope,target_school_id,enabled_features,
    invite_policy,approval_waitlist_enabled,stop_conditions,created_by
  ) VALUES(
    program_id,draft.id,draft.max_users,draft.target_scope,draft.target_school_id,draft.enabled_features,
    draft.invite_policy,draft.approval_waitlist_enabled,draft.stop_conditions,admin_actor
  ) RETURNING id INTO snapshot_id;
  INSERT INTO public.beta_program_schools(program_id,school_id,source_snapshot_id,created_by)
  VALUES(program_id,draft.target_school_id,snapshot_id,admin_actor);
  UPDATE public.beta_setup_drafts SET status='activated',updated_at=now() WHERE id=draft.id;
  INSERT INTO public.beta_audit_logs(actor_type,actor_reference,action,target_type,target_id,reason_code,metadata)
  VALUES('admin',admin_actor,'beta_setup_activated','beta_program',program_id,'CREATED_PAUSED',
    jsonb_build_object('draft_id',draft.id,'snapshot_id',snapshot_id,'school_contract',true,'contract_kind',contract_kind));
  RETURN program_id;
END; $$;

REVOKE ALL ON FUNCTION private.controlled_beta_contract_kind(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.controlled_beta_contract_max_users(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_connected_instagram_beta_prerequisites(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_activate_beta_setup(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.has_beta_feature_access(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_configure_controlled_beta_features(uuid,text[],text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_start_controlled_beta_program(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_reactivate_controlled_beta_program(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_issue_beta_invite(uuid,text,text,text,integer,timestamptz,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.redeem_beta_invite(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_review_beta_member(uuid,text,text,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION private.controlled_beta_contract_kind(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION private.controlled_beta_contract_max_users(text) TO service_role;
GRANT EXECUTE ON FUNCTION private.has_connected_instagram_beta_prerequisites(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_beta_setup(uuid,text,text,timestamptz,timestamptz,integer,text,uuid,text[],jsonb,boolean,jsonb,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_activate_beta_setup(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_beta_feature_access(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_configure_controlled_beta_features(uuid,text[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_start_controlled_beta_program(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_controlled_beta_program(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_issue_beta_invite(uuid,text,text,text,integer,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_beta_invite(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_beta_member(uuid,text,text,text) TO service_role;

COMMIT;
