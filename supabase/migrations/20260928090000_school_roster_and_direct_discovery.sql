BEGIN;

CREATE TABLE IF NOT EXISTS public.school_roster_consents (
  membership_id uuid PRIMARY KEY REFERENCES public.profile_school_memberships(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_version text NOT NULL CHECK (policy_version = 'school-roster-2026-09-28'),
  consented_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  withdrawn_at timestamptz,
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= consented_at)
);

CREATE INDEX IF NOT EXISTS school_roster_consents_owner_active_idx
  ON public.school_roster_consents(owner_user_id, membership_id)
  WHERE withdrawn_at IS NULL;

ALTER TABLE public.school_roster_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_roster_consents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.school_roster_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.school_roster_consents TO authenticated;
GRANT ALL ON TABLE public.school_roster_consents TO service_role;

DROP POLICY IF EXISTS school_roster_consents_owner_select ON public.school_roster_consents;
CREATE POLICY school_roster_consents_owner_select
  ON public.school_roster_consents FOR SELECT TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.add_own_school_membership_with_roster(
  requested_school_id uuid,
  requested_graduation_year integer,
  requested_grade_classes jsonb,
  requested_roster_consent boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  saved jsonb;
  saved_membership_id uuid;
BEGIN
  IF requester IS NULL OR requested_roster_consent IS NULL
  THEN RAISE EXCEPTION 'INVALID_SCHOOL_ROSTER_PREFERENCE'; END IF;

  saved := public.add_own_school_membership_with_class_history(
    requested_school_id,
    requested_graduation_year,
    requested_grade_classes
  );
  saved_membership_id := (saved ->> 'id')::uuid;

  IF requested_roster_consent THEN
    INSERT INTO public.school_roster_consents(
      membership_id, owner_user_id, policy_version, consented_at, withdrawn_at
    ) VALUES (
      saved_membership_id, requester, 'school-roster-2026-09-28', clock_timestamp(), NULL
    );
  END IF;

  RETURN saved || jsonb_build_object('roster_visible', requested_roster_consent);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_own_school_roster_visibility(
  target_membership_id uuid,
  requested_visible boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  membership_owner uuid;
BEGIN
  IF requester IS NULL OR requested_visible IS NULL
  THEN RAISE EXCEPTION 'INVALID_ROSTER_VISIBILITY'; END IF;

  SELECT membership.owner_user_id INTO membership_owner
  FROM public.profile_school_memberships membership
  WHERE membership.id = target_membership_id
  FOR UPDATE;
  IF membership_owner IS DISTINCT FROM requester
  THEN RAISE EXCEPTION 'SCHOOL_MEMBERSHIP_NOT_FOUND'; END IF;

  IF requested_visible THEN
    IF NOT public.public_account_access_active(requester)
      OR NOT public.has_current_adult_access(requester)
      OR NOT EXISTS (
        SELECT 1 FROM public.private_profiles profile
        WHERE profile.owner_user_id = requester
          AND profile.profile_visibility = 'private'
          AND profile.status = 'active'
      )
    THEN RAISE EXCEPTION 'ROSTER_VISIBILITY_NOT_ALLOWED'; END IF;

    INSERT INTO public.school_roster_consents(
      membership_id, owner_user_id, policy_version, consented_at, withdrawn_at
    ) VALUES (
      target_membership_id, requester, 'school-roster-2026-09-28', clock_timestamp(), NULL
    )
    ON CONFLICT (membership_id) DO UPDATE SET
      owner_user_id = EXCLUDED.owner_user_id,
      policy_version = EXCLUDED.policy_version,
      consented_at = clock_timestamp(),
      withdrawn_at = NULL;
  ELSE
    UPDATE public.school_roster_consents
    SET withdrawn_at = clock_timestamp()
    WHERE membership_id = target_membership_id AND owner_user_id = requester;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_school_member_roster(requested_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester uuid := auth.uid();
  roster jsonb;
BEGIN
  IF requester IS NULL
    OR NOT public.public_account_access_active(requester)
    OR NOT public.has_current_adult_access(requester)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profile_school_memberships own_membership
      JOIN public.school_roster_consents own_consent
        ON own_consent.membership_id = own_membership.id
       AND own_consent.owner_user_id = requester
       AND own_consent.withdrawn_at IS NULL
      WHERE own_membership.owner_user_id = requester
        AND own_membership.school_id = requested_school_id
    )
  THEN RAISE EXCEPTION 'SCHOOL_ROSTER_ACCESS_REQUIRED'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'display_name', profile.display_name,
    'graduation_year', membership.graduation_year,
    'class_history', coalesce(history.rows, '[]'::jsonb)
  ) ORDER BY membership.graduation_year DESC, profile.display_name), '[]'::jsonb)
  INTO roster
  FROM public.school_roster_consents consent
  JOIN public.profile_school_memberships membership
    ON membership.id = consent.membership_id
   AND membership.owner_user_id = consent.owner_user_id
  JOIN public.private_profiles profile
    ON profile.owner_user_id = consent.owner_user_id
   AND profile.id = membership.profile_id
   AND profile.profile_visibility = 'private'
   AND profile.status = 'active'
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'grade_number', class_row.grade_number,
      'class_number', class_row.class_number
    ) ORDER BY class_row.grade_number) AS rows
    FROM public.profile_school_class_histories class_row
    WHERE class_row.membership_id = membership.id
      AND class_row.owner_user_id = membership.owner_user_id
  ) history ON true
  WHERE consent.withdrawn_at IS NULL
    AND consent.policy_version = 'school-roster-2026-09-28'
    AND membership.school_id = requested_school_id
    AND NOT EXISTS (
      SELECT 1 FROM public.safety_account_restrictions restriction
      WHERE restriction.user_id = membership.owner_user_id
        AND restriction.status = 'suspended'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.account_deletion_requests deletion
      WHERE deletion.user_id = membership.owner_user_id
        AND deletion.status IN ('pending','public_data_deleted','auth_deletion_pending','failed_safe','done')
    );

  RETURN roster;
END;
$$;

-- Public account members receive People Discovery immediately after completing
-- adult access, an active profile, a school membership and the new reciprocal
-- roster disclosure. Controlled-beta access remains available as a fallback.
CREATE OR REPLACE FUNCTION public.has_beta_feature_access(target_user_id uuid, requested_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT target_user_id IS NOT NULL
    AND (auth.uid()=target_user_id OR auth.role()='service_role' OR session_user='postgres')
    AND requested_feature IN ('account_registration','private_profile','people_search','connection_request','messaging','instagram_permission','promotion_application','promotion_operations')
    AND NOT EXISTS (
      SELECT 1 FROM public.safety_account_restrictions restriction
      WHERE restriction.user_id=target_user_id AND restriction.status='suspended'
    )
    AND (
      (
        requested_feature IN ('people_search','connection_request')
        AND NOT EXISTS (
          SELECT 1 FROM public.public_account_launch_control control
          WHERE control.control_key='public_account' AND control.state='emergency_stopped'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.account_deletion_requests deletion
          WHERE deletion.user_id=target_user_id AND deletion.status<>'rejected'
        )
        AND public.is_current_adult_account(target_user_id)
        AND EXISTS (
          SELECT 1 FROM public.private_profiles profile
          WHERE profile.owner_user_id=target_user_id
            AND profile.profile_visibility='private' AND profile.status='active'
        )
        AND EXISTS (
          SELECT 1
          FROM public.profile_school_memberships membership
          JOIN public.school_roster_consents consent
            ON consent.membership_id=membership.id
           AND consent.owner_user_id=target_user_id
           AND consent.withdrawn_at IS NULL
          WHERE membership.owner_user_id=target_user_id
        )
      )
      OR (
        NOT EXISTS (
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
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.find_exact_private_profile_match(
  actor_user_id uuid,
  target_school_id uuid,
  target_graduation_year integer,
  exact_display_name text
)
RETURNS TABLE (match_state text, match_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  matched_count integer;
  matched_user uuid;
  matched_membership uuid;
  opaque_token uuid;
BEGIN
  IF actor_user_id IS NULL OR target_school_id IS NULL OR exact_display_name IS NULL
    OR EXISTS (
      SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped'
    )
    OR NOT public.has_beta_feature_access(actor_user_id,'people_search')
    OR NOT public.is_current_adult_account(actor_user_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.profile_school_memberships actor_membership
      JOIN public.school_roster_consents actor_consent
        ON actor_consent.membership_id = actor_membership.id
       AND actor_consent.owner_user_id = actor_user_id
       AND actor_consent.withdrawn_at IS NULL
      WHERE actor_membership.owner_user_id = actor_user_id
        AND actor_membership.school_id = target_school_id
    )
    OR target_graduation_year NOT BETWEEN 1900 AND 2200
    OR char_length(btrim(normalize(exact_display_name,NFKC))) NOT BETWEEN 2 AND 50
    OR normalize(exact_display_name,NFKC) ~ '^[ᄀ-ᇿ㄰-㆏[:space:]]+$' THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT count(*) INTO matched_count
  FROM public.private_profiles p
  JOIN public.profile_school_memberships m
    ON m.profile_id = p.id AND m.owner_user_id = p.owner_user_id
  JOIN public.school_roster_consents roster_consent
    ON roster_consent.membership_id = m.id
   AND roster_consent.owner_user_id = p.owner_user_id
   AND roster_consent.withdrawn_at IS NULL
  WHERE p.status = 'active'
    AND p.owner_user_id <> actor_user_id
    AND m.school_id = target_school_id
    AND m.graduation_year = target_graduation_year
    AND lower(btrim(normalize(p.display_name,NFKC))) = lower(btrim(normalize(exact_display_name,NFKC)));

  IF matched_count <> 1 THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT p.owner_user_id, m.id INTO matched_user, matched_membership
  FROM public.private_profiles p
  JOIN public.profile_school_memberships m
    ON m.profile_id = p.id AND m.owner_user_id = p.owner_user_id
  JOIN public.school_roster_consents roster_consent
    ON roster_consent.membership_id = m.id
   AND roster_consent.owner_user_id = p.owner_user_id
   AND roster_consent.withdrawn_at IS NULL
  WHERE p.status = 'active'
    AND p.owner_user_id <> actor_user_id
    AND m.school_id = target_school_id
    AND m.graduation_year = target_graduation_year
    AND lower(btrim(normalize(p.display_name,NFKC))) = lower(btrim(normalize(exact_display_name,NFKC)));

  IF matched_user IS NULL OR NOT public.is_current_adult_account(matched_user)
    OR EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_user_id = actor_user_id AND b.blocked_user_id = matched_user)
         OR (b.blocker_user_id = matched_user AND b.blocked_user_id = actor_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.status = 'active'
        AND c.user_low_id = LEAST(actor_user_id, matched_user)
        AND c.user_high_id = GREATEST(actor_user_id, matched_user)
    )
    OR EXISTS (
      SELECT 1 FROM public.connection_requests r
      WHERE r.pair_low_id = LEAST(actor_user_id, matched_user)
        AND r.pair_high_id = GREATEST(actor_user_id, matched_user)
    ) THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  opaque_token := extensions.uuid_generate_v4();
  INSERT INTO public.connection_match_tokens (
    token_hash, requester_user_id, receiver_user_id, target_school_membership_id
  ) VALUES (
    encode(extensions.digest(convert_to(opaque_token::text, 'UTF8'), 'sha256'), 'hex'),
    actor_user_id, matched_user, matched_membership
  );

  RETURN QUERY SELECT 'match_available'::text, opaque_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_exact_private_profile_class_match(
  actor_user_id uuid,
  target_school_id uuid,
  target_graduation_year integer,
  target_grade_number integer,
  target_class_number integer,
  exact_display_name text
)
RETURNS TABLE (match_state text, match_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  school_type_authority text;
  maximum_grade integer;
  matched_count integer;
  matched_user uuid;
  matched_membership uuid;
  opaque_token uuid;
  original_matched_user uuid;
  validation_pass integer;
BEGIN
  -- First find the candidate; then re-run every predicate with both user locks held.
  FOR validation_pass IN 1..2 LOOP
  SELECT school.school_type
  INTO school_type_authority
  FROM public.schools school
  WHERE school.id = target_school_id;

  maximum_grade := CASE school_type_authority
    WHEN 'elementary' THEN 6
    WHEN 'middle' THEN 3
    WHEN 'high' THEN 3
    ELSE NULL
  END;

  IF actor_user_id IS NULL OR target_school_id IS NULL OR exact_display_name IS NULL
    OR target_graduation_year NOT BETWEEN 1900 AND 2200
    OR target_grade_number NOT BETWEEN 1 AND 6
    OR target_class_number NOT BETWEEN 1 AND 100
    OR maximum_grade IS NULL
    OR target_grade_number > maximum_grade
    OR EXISTS (
      SELECT 1 FROM public.public_account_launch_control control
      WHERE control.control_key = 'public_account' AND control.state = 'emergency_stopped'
    )
    OR NOT public.has_beta_feature_access(actor_user_id, 'people_search')
    OR NOT public.is_current_adult_account(actor_user_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.profile_school_memberships actor_membership
      JOIN public.school_roster_consents actor_consent
        ON actor_consent.membership_id = actor_membership.id
       AND actor_consent.owner_user_id = actor_user_id
       AND actor_consent.withdrawn_at IS NULL
      JOIN public.profile_school_class_histories actor_history
        ON actor_history.membership_id = actor_membership.id
        AND actor_history.owner_user_id = actor_user_id
      WHERE actor_membership.owner_user_id = actor_user_id
        AND actor_membership.school_id = target_school_id
        AND actor_membership.graduation_year = target_graduation_year
        AND actor_history.grade_number = target_grade_number
        AND actor_history.class_number = target_class_number
    )
    OR char_length(btrim(normalize(exact_display_name, NFKC))) NOT BETWEEN 2 AND 50
    OR normalize(exact_display_name, NFKC) ~ '^[ᄀ-ᇿ㄰-㆏[:space:]]+$'
  THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT count(*) INTO matched_count
  FROM public.private_profiles profile
  JOIN public.profile_school_memberships membership
    ON membership.profile_id = profile.id AND membership.owner_user_id = profile.owner_user_id
  JOIN public.school_roster_consents roster_consent
    ON roster_consent.membership_id = membership.id
   AND roster_consent.owner_user_id = profile.owner_user_id
   AND roster_consent.withdrawn_at IS NULL
  JOIN public.profile_school_class_histories history
    ON history.membership_id = membership.id AND history.owner_user_id = profile.owner_user_id
  WHERE profile.status = 'active' AND profile.profile_visibility = 'private'
    AND profile.owner_user_id <> actor_user_id
    AND membership.school_id = target_school_id
    AND membership.graduation_year = target_graduation_year
    AND history.grade_number = target_grade_number
    AND history.class_number = target_class_number
    AND lower(btrim(normalize(profile.display_name, NFKC))) = lower(btrim(normalize(exact_display_name, NFKC)));

  IF matched_count <> 1 THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT profile.owner_user_id, membership.id
  INTO matched_user, matched_membership
  FROM public.private_profiles profile
  JOIN public.profile_school_memberships membership
    ON membership.profile_id = profile.id AND membership.owner_user_id = profile.owner_user_id
  JOIN public.school_roster_consents roster_consent
    ON roster_consent.membership_id = membership.id
   AND roster_consent.owner_user_id = profile.owner_user_id
   AND roster_consent.withdrawn_at IS NULL
  JOIN public.profile_school_class_histories history
    ON history.membership_id = membership.id AND history.owner_user_id = profile.owner_user_id
  WHERE profile.status = 'active' AND profile.profile_visibility = 'private'
    AND profile.owner_user_id <> actor_user_id
    AND membership.school_id = target_school_id
    AND membership.graduation_year = target_graduation_year
    AND history.grade_number = target_grade_number
    AND history.class_number = target_class_number
    AND lower(btrim(normalize(profile.display_name, NFKC))) = lower(btrim(normalize(exact_display_name, NFKC)));

  IF matched_user IS NULL
    OR (validation_pass = 2 AND matched_user IS DISTINCT FROM original_matched_user)
    OR NOT public.is_current_adult_account(matched_user)
    OR EXISTS (
      SELECT 1 FROM public.user_blocks block
      WHERE (block.blocker_user_id = actor_user_id AND block.blocked_user_id = matched_user)
         OR (block.blocker_user_id = matched_user AND block.blocked_user_id = actor_user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.connections connection
      WHERE connection.status = 'active'
        AND connection.user_low_id = LEAST(actor_user_id, matched_user)
        AND connection.user_high_id = GREATEST(actor_user_id, matched_user)
    )
    OR EXISTS (
      SELECT 1 FROM public.connection_requests request
      WHERE request.pair_low_id = LEAST(actor_user_id, matched_user)
        AND request.pair_high_id = GREATEST(actor_user_id, matched_user)
    )
  THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::uuid;
    RETURN;
  END IF;

  IF validation_pass = 1 THEN
    original_matched_user := matched_user;
    -- Same namespace as owner replacement. UUID order is identical for A→B and B→A.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(LEAST(actor_user_id::text, matched_user::text), 0));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(GREATEST(actor_user_id::text, matched_user::text), 0));
  END IF;
  END LOOP;
  -- Post-lock revalidation above succeeded; transaction locks cover token insertion.
  opaque_token := extensions.uuid_generate_v4();
  INSERT INTO public.connection_match_tokens (
    token_hash, requester_user_id, receiver_user_id, target_school_membership_id
  ) VALUES (
    encode(extensions.digest(convert_to(opaque_token::text, 'UTF8'), 'sha256'), 'hex'),
    actor_user_id, matched_user, matched_membership
  );

  RETURN QUERY SELECT 'match_available'::text, opaque_token;
END;
$$;

REVOKE ALL ON FUNCTION public.add_own_school_membership_with_class_history(uuid,integer,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_own_school_roster_visibility(uuid,boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_school_member_roster(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_beta_feature_access(uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_exact_private_profile_match(uuid,uuid,integer,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.add_own_school_membership_with_class_history(uuid,integer,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.add_own_school_membership_with_roster(uuid,integer,jsonb,boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_own_school_roster_visibility(uuid,boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_school_member_roster(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_beta_feature_access(uuid,text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_exact_private_profile_match(uuid,uuid,integer,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.find_exact_private_profile_class_match(uuid,uuid,integer,integer,integer,text)
  TO service_role;

COMMIT;
