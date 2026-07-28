\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path TO public, extensions;

-- The Supabase image already owns auth schema and auth.uid(); reuse both.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  school_name text NOT NULL
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  school_id uuid REFERENCES public.schools(id),
  graduation_year integer,
  grade integer,
  class_number integer,
  department text,
  student_year integer,
  nickname text,
  instagram_id text,
  description text,
  is_self boolean DEFAULT false,
  message text,
  report_count integer DEFAULT 0,
  is_hidden boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text,
  status text,
  requested_instagram_id text
);

CREATE OR REPLACE FUNCTION public.school_growth_ranking_v1(timestamptz,timestamptz,integer)
RETURNS SETOF jsonb LANGUAGE sql SET search_path='' AS $$ SELECT NULL::jsonb WHERE false $$;

GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.profiles TO anon,authenticated;
