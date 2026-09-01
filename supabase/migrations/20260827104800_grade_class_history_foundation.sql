BEGIN;

-- PHASE 10AA keeps a school membership as one school + one graduation year.
-- Grade/class pairs are private child history and never become public people data.
ALTER TABLE public.profile_school_memberships
  ADD CONSTRAINT profile_school_memberships_id_owner_key
  UNIQUE (id, owner_user_id);

-- Existing class_number values have no trustworthy grade authority. Keep the column and
-- any legacy values, but require every write after this migration to use child rows.
ALTER TABLE public.profile_school_memberships
  ADD CONSTRAINT profile_school_memberships_legacy_class_deprecated
  CHECK (class_number IS NULL) NOT VALID;

CREATE TABLE public.profile_school_class_histories (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  membership_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grade_number integer NOT NULL CHECK (grade_number BETWEEN 1 AND 6),
  class_number integer NOT NULL CHECK (class_number BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_school_class_histories_membership_owner_fk
    FOREIGN KEY (membership_id, owner_user_id)
    REFERENCES public.profile_school_memberships(id, owner_user_id)
    ON DELETE CASCADE,
  CONSTRAINT profile_school_class_histories_membership_grade_key
    UNIQUE (membership_id, grade_number)
);

COMMENT ON TABLE public.profile_school_class_histories IS
  'Owner-private K12 grade/class history beneath one school + graduation-year membership.';
COMMENT ON COLUMN public.profile_school_memberships.class_number IS
  'Deprecated legacy value without grade authority. New writes must be NULL.';

CREATE INDEX profile_school_class_histories_owner_membership_idx
  ON public.profile_school_class_histories(owner_user_id, membership_id, grade_number);

ALTER TABLE public.profile_school_class_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_school_class_histories FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_school_class_histories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profile_school_class_histories TO authenticated;
GRANT ALL ON TABLE public.profile_school_class_histories TO service_role;

CREATE POLICY profile_school_class_histories_owner_select
  ON public.profile_school_class_histories
  FOR SELECT TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));

-- Retire the legacy RPC from browser authority. Its three-argument signature remains in place
-- only so historical database objects are not rewritten; the NOT VALID constraint also makes
-- every future parent write store class_number = NULL.
REVOKE ALL ON FUNCTION public.add_own_school_membership(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.add_own_school_membership_with_class_history(
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
  IF requester IS NULL
    OR NOT public.public_account_access_active(requester)
    OR NOT public.has_current_adult_access(requester)
    OR requested_graduation_year NOT BETWEEN 1900
      AND extract(year FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer
  THEN
    RAISE EXCEPTION 'INVALID_SCHOOL_MEMBERSHIP';
  END IF;

  IF requested_grade_classes IS NULL
    OR pg_catalog.jsonb_typeof(requested_grade_classes) <> 'array'
    OR pg_catalog.jsonb_array_length(requested_grade_classes) > 6
  THEN
    RAISE EXCEPTION 'INVALID_GRADE_CLASS_HISTORY';
  END IF;

  SELECT school.school_type
  INTO school_type_authority
  FROM public.schools school
  WHERE school.id = requested_school_id;

  IF school_type_authority IS NULL THEN
    RAISE EXCEPTION 'INVALID_SCHOOL_MEMBERSHIP';
  END IF;

  maximum_grade := CASE school_type_authority
    WHEN 'elementary' THEN 6
    WHEN 'middle' THEN 3
    WHEN 'high' THEN 3
    ELSE 0
  END;

  IF maximum_grade = 0 AND pg_catalog.jsonb_array_length(requested_grade_classes) > 0 THEN
    RAISE EXCEPTION 'GRADE_CLASS_HISTORY_NOT_ALLOWED_FOR_SCHOOL_TYPE';
  END IF;

  FOR grade_item IN
    SELECT value FROM pg_catalog.jsonb_array_elements(requested_grade_classes)
  LOOP
    IF pg_catalog.jsonb_typeof(grade_item) <> 'object'
      OR NOT (grade_item ? 'grade_number')
      OR NOT (grade_item ? 'class_number')
      OR pg_catalog.jsonb_typeof(grade_item -> 'grade_number') <> 'number'
      OR pg_catalog.jsonb_typeof(grade_item -> 'class_number') <> 'number'
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_object_keys(grade_item) AS key_name
        WHERE key_name NOT IN ('grade_number', 'class_number')
      )
      OR (grade_item ->> 'grade_number') !~ '^[0-9]+$'
      OR (grade_item ->> 'class_number') !~ '^[0-9]+$'
    THEN
      RAISE EXCEPTION 'INVALID_GRADE_CLASS_HISTORY';
    END IF;

    parsed_grade := (grade_item ->> 'grade_number')::integer;
    parsed_class := (grade_item ->> 'class_number')::integer;

    IF parsed_grade NOT BETWEEN 1 AND maximum_grade
      OR parsed_class NOT BETWEEN 1 AND 100
    THEN
      RAISE EXCEPTION 'INVALID_GRADE_CLASS_HISTORY';
    END IF;
  END LOOP;

  SELECT count(*), count(DISTINCT (value ->> 'grade_number')::integer)
  INTO supplied_count, distinct_grade_count
  FROM pg_catalog.jsonb_array_elements(requested_grade_classes);

  IF supplied_count <> distinct_grade_count THEN
    RAISE EXCEPTION 'DUPLICATE_GRADE_CLASS_HISTORY';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester::text, 0)
  );

  SELECT *
  INTO own_profile
  FROM public.private_profiles
  WHERE owner_user_id = requester
    AND profile_visibility = 'private'
    AND status = 'active'
  FOR UPDATE;

  IF own_profile.id IS NULL THEN
    RAISE EXCEPTION 'PRIVATE_PROFILE_REQUIRED';
  END IF;

  IF NOT (
    public.public_account_feature_enabled('school_membership')
    OR public.has_beta_feature_access(requester, 'private_profile')
  ) THEN
    RAISE EXCEPTION 'SCHOOL_MEMBERSHIP_CLOSED';
  END IF;

  INSERT INTO public.profile_school_memberships(
    profile_id,
    owner_user_id,
    school_id,
    graduation_year,
    class_number
  )
  VALUES (
    own_profile.id,
    requester,
    requested_school_id,
    requested_graduation_year,
    NULL
  )
  RETURNING * INTO saved;

  INSERT INTO public.profile_school_class_histories(
    membership_id,
    owner_user_id,
    grade_number,
    class_number
  )
  SELECT
    saved.id,
    requester,
    (value ->> 'grade_number')::integer,
    (value ->> 'class_number')::integer
  FROM pg_catalog.jsonb_array_elements(requested_grade_classes)
  ORDER BY (value ->> 'grade_number')::integer;

  UPDATE public.adult_eligibility_records
  SET school_membership_first_created_at = clock_timestamp()
  WHERE user_id = requester
    AND policy_version = 'phase10b-2026-07-28'
    AND school_membership_first_created_at IS NULL;
  first_now := FOUND;

  IF first_now THEN
    PERFORM public.increment_public_account_metric(
      'first_school_membership_created',
      'onboarding',
      'milestone'
    );
  END IF;
  PERFORM public.maybe_record_own_onboarding_completion(requester);

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'grade_number', history.grade_number,
        'class_number', history.class_number
      )
      ORDER BY history.grade_number
    ),
    '[]'::jsonb
  )
  INTO saved_history
  FROM public.profile_school_class_histories history
  WHERE history.membership_id = saved.id
    AND history.owner_user_id = requester;

  RETURN pg_catalog.jsonb_build_object(
    'id', saved.id,
    'school_id', saved.school_id,
    'graduation_year', saved.graduation_year,
    'class_number', saved.class_number,
    'class_history', saved_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_own_school_membership_with_class_history(uuid, integer, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_own_school_membership_with_class_history(uuid, integer, jsonb)
  TO authenticated;

DO $phase10aa_postflight$
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'profile_school_class_histories'
        AND relation.relkind = 'r'
    )
    OR NOT (
      SELECT relation.relrowsecurity AND relation.relforcerowsecurity
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'profile_school_class_histories'
    )
    OR has_table_privilege('anon', 'public.profile_school_class_histories', 'SELECT')
    OR has_table_privilege('authenticated', 'public.profile_school_class_histories', 'INSERT')
    OR has_table_privilege('authenticated', 'public.profile_school_class_histories', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.profile_school_class_histories', 'DELETE')
    OR NOT has_table_privilege('authenticated', 'public.profile_school_class_histories', 'SELECT')
    OR has_function_privilege(
      'authenticated',
      'public.add_own_school_membership(uuid,integer,integer)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.add_own_school_membership_with_class_history(uuid,integer,jsonb)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'PHASE10AA_POSTFLIGHT_MISMATCH';
  END IF;
END;
$phase10aa_postflight$;

COMMIT;
