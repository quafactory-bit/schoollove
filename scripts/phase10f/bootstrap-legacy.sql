-- Local-only bridge for schema history that predates repository migrations.
-- Never run this file against Production. Production already owns these columns.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS current_level integer NOT NULL DEFAULT 1;
-- Production's legacy school shape includes this pre-migration column; later
-- reset/preflight migrations assert it before any PHASE 10O fixture runs.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS level_updated_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_self boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS message text;

CREATE TABLE IF NOT EXISTS public.search_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  query text NOT NULL,
  result_count integer,
  clicked_school_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.traces (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  graduation_year integer,
  grade integer,
  class_number integer,
  message text NOT NULL,
  report_count integer NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_report_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.profiles SET report_count=report_count+1 WHERE id=NEW.profile_id;
  RETURN NEW;
END; $$;
