-- PHASE 10A emergency privacy boundary.
-- Existing profile rows are retained. This migration only removes public access.
-- Apply to Production only after explicit user approval and a read-only preflight.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Revoke table-level and any historical column-level privileges. Revoking only the
-- table privilege is insufficient when column grants already exist.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles FROM anon, authenticated;
REVOKE SELECT (
  id, school_id, graduation_year, grade, class_number, department,
  student_year, nickname, instagram_id, description, is_self, message,
  report_count, is_hidden, created_at
) ON public.profiles FROM anon, authenticated;
REVOKE INSERT (
  school_id, graduation_year, grade, class_number, department,
  student_year, nickname, instagram_id, description, is_self, message
) ON public.profiles FROM anon, authenticated;

-- Remove every known historical public profile policy. service_role continues to
-- bypass RLS for the separately protected administrator boundary.
DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_visible" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_anon" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_system" ON public.profiles;
DROP POLICY IF EXISTS "anon can read all profiles for admin" ON public.profiles;
DROP POLICY IF EXISTS "anon can update profile flags" ON public.profiles;
DROP POLICY IF EXISTS "admin_can_delete_profiles" ON public.profiles;

-- The ranking RPC derives public activity and counts from profiles, so its public
-- execution grant is removed together with direct row access.
REVOKE EXECUTE ON FUNCTION public.school_growth_ranking_v1(
  timestamptz, timestamptz, integer
) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.profiles IS
  'PHASE 10A: private personal data store. Public roles have no row access; administrator service-role access only.';
