-- PHASE 10B: authenticated adult-only, owner-only private profile foundation.
-- This migration must not be applied to Production as part of the PHASE 10B implementation PR.
-- Existing profile rows are retained and are never assigned to a user automatically.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ownership_status text NOT NULL DEFAULT 'quarantined',
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS ownership_reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_ownership_status_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_ownership_status_check
      CHECK (ownership_status IN ('unclaimed', 'quarantined', 'claimed_pending_review', 'claimed', 'deletion_requested'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_visibility_private_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_visibility_private_check
      CHECK (profile_visibility = 'private');
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.owner_user_id IS
  'Legacy rows remain NULL until a separately reviewed ownership process exists.';

CREATE TABLE IF NOT EXISTS public.adult_eligibility_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  adult_eligible boolean NOT NULL CHECK (adult_eligible = true),
  adult_verified_at timestamptz NOT NULL DEFAULT now(),
  verification_method text NOT NULL CHECK (verification_method = 'self_attestation'),
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consent_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type text NOT NULL CHECK (consent_type IN (
    'terms', 'privacy_collection', 'adult_confirmation', 'private_by_default',
    'instagram_publication', 'marketing', 'today_instagram_promotion'
  )),
  consented boolean NOT NULL,
  policy_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.private_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 50),
  instagram_handle text CHECK (instagram_handle IS NULL OR char_length(instagram_handle) BETWEEN 1 AND 30),
  profile_photo_url text CHECK (profile_photo_url IS NULL OR char_length(profile_photo_url) <= 500),
  introduction text CHECK (introduction IS NULL OR char_length(introduction) <= 300),
  profile_visibility text NOT NULL DEFAULT 'private' CHECK (profile_visibility = 'private'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'deletion_requested')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_user_id)
);

CREATE TABLE IF NOT EXISTS public.profile_school_memberships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  graduation_year integer NOT NULL CHECK (graduation_year BETWEEN 1900 AND 2200),
  class_number integer CHECK (class_number BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_school_memberships_owner_fk
    FOREIGN KEY (profile_id, owner_user_id)
    REFERENCES public.private_profiles(id, owner_user_id) ON DELETE CASCADE,
  UNIQUE (profile_id, school_id, graduation_year)
);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending
  ON public.account_deletion_requests (user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type text NOT NULL DEFAULT 'admin' CHECK (actor_type IN ('admin', 'service_role')),
  action text NOT NULL,
  target_table text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.has_current_adult_access(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    target_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.adult_eligibility_records a
      WHERE a.user_id = target_user_id
        AND a.adult_eligible = true
        AND a.verification_method = 'self_attestation'
        AND a.policy_version = 'phase10b-2026-07-28'
    )
    AND NOT EXISTS (
      SELECT required_type
      FROM unnest(ARRAY['terms','privacy_collection','adult_confirmation','private_by_default']) AS required_type
      WHERE NOT EXISTS (
        SELECT 1 FROM public.consent_records c
        WHERE c.user_id = target_user_id
          AND c.consent_type = required_type
          AND c.consented = true
          AND c.policy_version = 'phase10b-2026-07-28'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.has_current_adult_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_adult_access(uuid) TO authenticated;

ALTER TABLE public.adult_eligibility_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.adult_eligibility_records, public.consent_records,
  public.private_profiles, public.profile_school_memberships,
  public.account_deletion_requests, public.admin_audit_logs FROM PUBLIC, anon, authenticated;

-- Adult eligibility is written only by the server after it has calculated age from the
-- request-local date of birth. Authenticated clients may read their own attestations but
-- cannot bypass that calculation with a direct PostgREST insert.
GRANT SELECT ON public.adult_eligibility_records TO authenticated;
GRANT SELECT, INSERT ON public.consent_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_profiles, public.profile_school_memberships TO authenticated;
GRANT SELECT, INSERT ON public.account_deletion_requests TO authenticated;
GRANT ALL ON TABLE public.adult_eligibility_records, public.consent_records,
  public.private_profiles, public.profile_school_memberships,
  public.account_deletion_requests, public.admin_audit_logs TO service_role;

DROP POLICY IF EXISTS adult_eligibility_owner_select ON public.adult_eligibility_records;
DROP POLICY IF EXISTS adult_eligibility_owner_insert ON public.adult_eligibility_records;
CREATE POLICY adult_eligibility_owner_select ON public.adult_eligibility_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS consent_records_owner_select ON public.consent_records;
DROP POLICY IF EXISTS consent_records_owner_insert ON public.consent_records;
CREATE POLICY consent_records_owner_select ON public.consent_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY consent_records_owner_insert ON public.consent_records
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS private_profiles_owner_select ON public.private_profiles;
DROP POLICY IF EXISTS private_profiles_owner_insert ON public.private_profiles;
DROP POLICY IF EXISTS private_profiles_owner_update ON public.private_profiles;
DROP POLICY IF EXISTS private_profiles_owner_delete ON public.private_profiles;
CREATE POLICY private_profiles_owner_select ON public.private_profiles
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY private_profiles_owner_insert ON public.private_profiles
  FOR INSERT TO authenticated WITH CHECK (
    owner_user_id = auth.uid()
    AND profile_visibility = 'private'
    AND public.has_current_adult_access(auth.uid())
  );
CREATE POLICY private_profiles_owner_update ON public.private_profiles
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid())
  WITH CHECK (
    owner_user_id = auth.uid()
    AND profile_visibility = 'private'
    AND public.has_current_adult_access(auth.uid())
  );
CREATE POLICY private_profiles_owner_delete ON public.private_profiles
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS memberships_owner_select ON public.profile_school_memberships;
DROP POLICY IF EXISTS memberships_owner_insert ON public.profile_school_memberships;
DROP POLICY IF EXISTS memberships_owner_update ON public.profile_school_memberships;
DROP POLICY IF EXISTS memberships_owner_delete ON public.profile_school_memberships;
CREATE POLICY memberships_owner_select ON public.profile_school_memberships
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY memberships_owner_insert ON public.profile_school_memberships
  FOR INSERT TO authenticated WITH CHECK (
    owner_user_id = auth.uid() AND public.has_current_adult_access(auth.uid())
  );
CREATE POLICY memberships_owner_update ON public.profile_school_memberships
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid() AND public.has_current_adult_access(auth.uid()));
CREATE POLICY memberships_owner_delete ON public.profile_school_memberships
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS deletion_requests_owner_select ON public.account_deletion_requests;
DROP POLICY IF EXISTS deletion_requests_owner_insert ON public.account_deletion_requests;
CREATE POLICY deletion_requests_owner_select ON public.account_deletion_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY deletion_requests_owner_insert ON public.account_deletion_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- No public/authenticated policy or grant is created for admin_audit_logs.
-- service_role continues to bypass RLS for the separately authenticated admin routes.
