-- Disposable local fixture for Part 2 P3 (no remote data). Stubs only what the new functions touch.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
-- auth.uid() reads a session setting, like Supabase's JWT claim.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.schools(id uuid PRIMARY KEY, school_name text NOT NULL, slug text NOT NULL);
CREATE TABLE public.private_profiles(id uuid NOT NULL, owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, display_name text, status text, UNIQUE(id, owner_user_id));
CREATE TABLE public.profile_school_memberships(id uuid PRIMARY KEY, profile_id uuid, owner_user_id uuid, school_id uuid, graduation_year integer);
CREATE TABLE public.school_roster_consents(membership_id uuid PRIMARY KEY, owner_user_id uuid, consented_at timestamptz DEFAULT now(), withdrawn_at timestamptz);
CREATE TABLE public.account_deletion_requests(user_id uuid, status text);
CREATE TABLE public.adult_ok(user_id uuid PRIMARY KEY);
CREATE FUNCTION public.public_account_access_active(target_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT target_user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM public.account_deletion_requests r WHERE r.user_id = target_user_id AND r.status <> 'rejected') $$;
CREATE FUNCTION public.has_current_adult_access(target_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.adult_ok a WHERE a.user_id = target_user_id) $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
-- Supabase-like default: new public tables get client grants unless revoked. Simulate it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

INSERT INTO public.schools VALUES
 ('a0000000-0000-4000-8000-000000000001','서울서초고등학교','seocho-high'),
 ('a0000000-0000-4000-8000-000000000002','부산중학교','busan-middle');
-- u1..u3: 서초고 2005 (3명 → 칠판 열림), u4: 부산중 2010 혼자, u5: 서초고 2005 성인 확인 없음
INSERT INTO auth.users SELECT ('c0000000-0000-4000-8000-00000000000'||n)::uuid FROM generate_series(1,6) n;
INSERT INTO public.adult_ok SELECT ('c0000000-0000-4000-8000-00000000000'||n)::uuid FROM generate_series(1,4) n;
INSERT INTO public.private_profiles(id,owner_user_id,display_name,status)
SELECT ('b0000000-0000-4000-8000-00000000000'||n)::uuid, ('c0000000-0000-4000-8000-00000000000'||n)::uuid,
       (ARRAY['김민수','이준','남궁민수','박서연','최하나','정우'])[n], 'active' FROM generate_series(1,6) n;
INSERT INTO public.profile_school_memberships
SELECT ('d0000000-0000-4000-8000-00000000000'||n)::uuid, ('b0000000-0000-4000-8000-00000000000'||n)::uuid, ('c0000000-0000-4000-8000-00000000000'||n)::uuid,
       CASE WHEN n=4 THEN 'a0000000-0000-4000-8000-000000000002'::uuid ELSE 'a0000000-0000-4000-8000-000000000001'::uuid END,
       CASE WHEN n=4 THEN 2010 ELSE 2005 END
FROM generate_series(1,5) n;
INSERT INTO public.school_roster_consents(membership_id, owner_user_id, consented_at)
SELECT ('d0000000-0000-4000-8000-00000000000'||n)::uuid, ('c0000000-0000-4000-8000-00000000000'||n)::uuid, now() - (n||' hours')::interval FROM generate_series(1,4) n;
