-- Part 2 P3 (operator approved 2026-11-19): two new tables + owner/public/admin functions.
-- Add-only. Existing tables, functions and data are not changed.
-- Both tables: RLS enabled and forced, every client privilege revoked, access only through
-- the SECURITY DEFINER functions below (explicit GRANT EXECUTE per function).
BEGIN;

-- ① 근황 태그·한마디 (본인 것만)
CREATE TABLE public.profile_status_tags (
  owner_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (cardinality(tags) <= 3
      AND tags <@ ARRAY['직장인','자영업','프리랜서','육아 중','공부 중','쉬는 중','이직 준비','해외 거주']::text[]),
  note text CHECK (note IS NULL OR (
    char_length(note) BETWEEN 1 AND 30
    AND note !~* '(https?:|www\.|@|[0-9]{3,}|카톡|카카오|오픈채팅|인스타|instagram|insta)')),
  show_on_school_page boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_status_tags_profile_fk FOREIGN KEY (profile_id, owner_user_id)
    REFERENCES public.private_profiles(id, owner_user_id) ON DELETE CASCADE
);
ALTER TABLE public.profile_status_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_status_tags FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_status_tags FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.profile_status_tags TO service_role;

-- ② 지명 소환장
CREATE TABLE public.summons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code text NOT NULL UNIQUE CHECK (share_code ~ '^[a-f0-9]{12}$'),
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id),
  graduation_year integer NOT NULL CHECK (graduation_year BETWEEN 1950 AND 2100),
  target_name text NOT NULL CHECK (char_length(target_name) BETWEEN 2 AND 10 AND target_name ~ '^[가-힣A-Za-z ]+$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden_at timestamptz,
  hidden_reason text CHECK (hidden_reason IN ('self_request','report','admin','creator')),
  report_count integer NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  CHECK ((hidden_at IS NULL) = (hidden_reason IS NULL))
);
CREATE INDEX summons_creator_created_idx ON public.summons (creator_user_id, created_at DESC);
CREATE INDEX summons_created_idx ON public.summons (created_at DESC);
ALTER TABLE public.summons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summons FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.summons FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.summons TO service_role;

-- Name rule shared by create: Korean/latin letters, no student wording, no abuse.
CREATE FUNCTION public.part2_summons_name_allowed(candidate text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT candidate IS NOT NULL
    AND char_length(btrim(candidate)) BETWEEN 2 AND 10
    AND btrim(candidate) ~ '^[가-힣A-Za-z ]+$'
    AND btrim(candidate) !~* '(학생|초딩|중딩|고딩|학년|교복|씨발|시발|병신|개새|좆|존나|미친|바보|fuck|shit|bitch)';
$$;
REVOKE ALL ON FUNCTION public.part2_summons_name_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.part2_summons_name_allowed(text) TO service_role;

-- Owner: read own tags.
CREATE FUNCTION public.part2_get_own_status_tags()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('tags', t.tags, 'note', t.note, 'show_on_school_page', t.show_on_school_page)
    FROM public.profile_status_tags t WHERE t.owner_user_id = auth.uid()
  ), jsonb_build_object('tags', '[]'::jsonb, 'note', NULL, 'show_on_school_page', false));
$$;

-- Owner: save own tags (replaces the whole row).
CREATE FUNCTION public.part2_set_own_status_tags(requested_tags text[], requested_note text, requested_show boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  own_profile uuid;
  clean_note text := nullif(btrim(coalesce(requested_note, '')), '');
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.public_account_access_active(actor) OR NOT public.has_current_adult_access(actor) THEN
    RAISE EXCEPTION 'ACCOUNT_ACCESS_REQUIRED';
  END IF;
  SELECT p.id INTO own_profile FROM public.private_profiles p
  WHERE p.owner_user_id = actor AND p.status = 'active' LIMIT 1;
  IF own_profile IS NULL THEN RAISE EXCEPTION 'PROFILE_REQUIRED'; END IF;
  INSERT INTO public.profile_status_tags AS t (owner_user_id, profile_id, tags, note, show_on_school_page, updated_at)
  VALUES (actor, own_profile, coalesce(requested_tags, '{}'::text[]), clean_note, coalesce(requested_show, false), now())
  ON CONFLICT (owner_user_id) DO UPDATE
    SET profile_id = EXCLUDED.profile_id, tags = EXCLUDED.tags, note = EXCLUDED.note,
        show_on_school_page = EXCLUDED.show_on_school_page, updated_at = now();
  RETURN public.part2_get_own_status_tags();
END;
$$;

-- Public (logged-out) year preview v2: DB-masked name + tags/note only when the owner turned on
-- "학교 페이지에 보이기". Never Instagram, photo or class.
CREATE FUNCTION public.part2_year_masked_preview_v2(p_school_id uuid, p_year integer)
RETURNS TABLE(masked_name text, tags text[], note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
           WHEN char_length(clean.name) <= 1 THEN 'O'
           WHEN char_length(clean.name) = 2 THEN left(clean.name, 1) || 'O'
           ELSE left(clean.name, 1) || 'O' || right(clean.name, 1)
         END,
         CASE WHEN st.show_on_school_page THEN st.tags ELSE '{}'::text[] END,
         CASE WHEN st.show_on_school_page THEN st.note ELSE NULL END
  FROM (
    SELECT regexp_replace(btrim(profile.display_name), '\s+', '', 'g') AS name, consent.consented_at, membership.owner_user_id
    FROM public.profile_school_memberships membership
    JOIN public.school_roster_consents consent
      ON consent.membership_id = membership.id AND consent.owner_user_id = membership.owner_user_id AND consent.withdrawn_at IS NULL
    JOIN public.private_profiles profile
      ON profile.id = membership.profile_id AND profile.owner_user_id = membership.owner_user_id AND profile.status = 'active'
    WHERE membership.school_id = p_school_id AND membership.graduation_year = p_year
  ) clean
  LEFT JOIN public.profile_status_tags st ON st.owner_user_id = clean.owner_user_id
  WHERE char_length(clean.name) > 0
  ORDER BY clean.consented_at DESC
  LIMIT 6;
$$;

-- Member: same school·year chalkboard. Locked below 3 roster members; requester must be one of them.
CREATE FUNCTION public.part2_get_year_chalkboard(p_school_id uuid, p_year integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  members integer;
  board jsonb;
BEGIN
  IF actor IS NULL OR NOT public.public_account_access_active(actor) OR NOT public.has_current_adult_access(actor) THEN
    RAISE EXCEPTION 'ACCOUNT_ACCESS_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_school_memberships m
    JOIN public.school_roster_consents c ON c.membership_id = m.id AND c.owner_user_id = m.owner_user_id AND c.withdrawn_at IS NULL
    WHERE m.owner_user_id = actor AND m.school_id = p_school_id AND m.graduation_year = p_year
  ) THEN RAISE EXCEPTION 'SCHOOL_ROSTER_ACCESS_REQUIRED'; END IF;

  SELECT count(*)::integer INTO members
  FROM public.profile_school_memberships m
  JOIN public.school_roster_consents c ON c.membership_id = m.id AND c.owner_user_id = m.owner_user_id AND c.withdrawn_at IS NULL
  JOIN public.private_profiles p ON p.id = m.profile_id AND p.owner_user_id = m.owner_user_id AND p.status = 'active'
  WHERE m.school_id = p_school_id AND m.graduation_year = p_year;

  IF members < 3 THEN
    RETURN jsonb_build_object('locked', true, 'members', members, 'needed', 3);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('display_name', p.display_name, 'tags', t.tags, 'note', t.note)
           ORDER BY t.updated_at DESC), '[]'::jsonb) INTO board
  FROM public.profile_school_memberships m
  JOIN public.school_roster_consents c ON c.membership_id = m.id AND c.owner_user_id = m.owner_user_id AND c.withdrawn_at IS NULL
  JOIN public.private_profiles p ON p.id = m.profile_id AND p.owner_user_id = m.owner_user_id AND p.status = 'active'
  JOIN public.profile_status_tags t ON t.owner_user_id = m.owner_user_id
  WHERE m.school_id = p_school_id AND m.graduation_year = p_year
    AND (cardinality(t.tags) > 0 OR t.note IS NOT NULL);

  RETURN jsonb_build_object('locked', false, 'members', members, 'needed', 3, 'entries', board);
END;
$$;

-- Member: create a summons for the same school·year. 3 per KST day.
CREATE FUNCTION public.part2_create_summons(p_school_id uuid, p_year integer, p_target_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  clean_name text := regexp_replace(btrim(coalesce(p_target_name, '')), '\s+', ' ', 'g');
  today_count integer;
  code text;
BEGIN
  IF actor IS NULL OR NOT public.public_account_access_active(actor) OR NOT public.has_current_adult_access(actor) THEN
    RAISE EXCEPTION 'ACCOUNT_ACCESS_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_school_memberships m
    JOIN public.private_profiles p ON p.id = m.profile_id AND p.owner_user_id = m.owner_user_id AND p.status = 'active'
    WHERE m.owner_user_id = actor AND m.school_id = p_school_id AND m.graduation_year = p_year
  ) THEN RAISE EXCEPTION 'SAME_SCHOOL_YEAR_REQUIRED'; END IF;
  IF NOT public.part2_summons_name_allowed(clean_name) THEN RAISE EXCEPTION 'SUMMONS_NAME_REJECTED'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('part2_summons:' || actor::text, 0));
  SELECT count(*)::integer INTO today_count FROM public.summons s
  WHERE s.creator_user_id = actor
    AND (s.created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date;
  IF today_count >= 3 THEN RAISE EXCEPTION 'SUMMONS_DAILY_LIMIT'; END IF;
  code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  INSERT INTO public.summons (share_code, creator_user_id, school_id, graduation_year, target_name)
  VALUES (code, actor, p_school_id, p_year, clean_name);
  RETURN code;
END;
$$;

-- Member: own summons list (for sharing again / taking down).
CREATE FUNCTION public.part2_list_own_summons()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'share_code', s.share_code, 'target_name', s.target_name, 'graduation_year', s.graduation_year,
    'school_name', sc.school_name, 'hidden', s.hidden_at IS NOT NULL, 'created_at', s.created_at
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM public.summons s JOIN public.schools sc ON sc.id = s.school_id
  WHERE s.creator_user_id = auth.uid() AND s.created_at > now() - interval '90 days';
$$;

-- Member: take down own summons.
CREATE FUNCTION public.part2_hide_own_summons(p_code text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH changed AS (
    UPDATE public.summons SET hidden_at = now(), hidden_reason = 'creator'
    WHERE share_code = p_code AND creator_user_id = auth.uid() AND hidden_at IS NULL
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM changed);
$$;

-- Public: summons card data. Only school, year, target name. Never creator, Instagram, contact,
-- or whether the target is on the roster. Hidden, older than 90 days or creator deleting → nothing.
CREATE FUNCTION public.part2_get_public_summons(p_code text)
RETURNS TABLE(school_name text, school_slug text, graduation_year integer, target_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT sc.school_name, sc.slug, s.graduation_year, s.target_name
  FROM public.summons s JOIN public.schools sc ON sc.id = s.school_id
  WHERE s.share_code = p_code
    AND s.hidden_at IS NULL
    AND s.created_at > now() - interval '90 days'
    AND NOT EXISTS (SELECT 1 FROM public.account_deletion_requests r WHERE r.user_id = s.creator_user_id AND r.status <> 'rejected');
$$;

-- Public: "내 이름이 올라갔어요 · 내려 주세요" → hidden immediately (recorded for admin).
CREATE FUNCTION public.part2_request_summons_takedown(p_code text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH changed AS (
    UPDATE public.summons SET hidden_at = now(), hidden_reason = 'self_request'
    WHERE share_code = p_code AND hidden_at IS NULL
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM changed);
$$;

-- Public: report. Third report hides the card.
CREATE FUNCTION public.part2_report_summons(p_code text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH changed AS (
    UPDATE public.summons
    SET report_count = report_count + 1,
        hidden_at = CASE WHEN hidden_at IS NULL AND report_count + 1 >= 3 THEN now() ELSE hidden_at END,
        hidden_reason = CASE WHEN hidden_at IS NULL AND report_count + 1 >= 3 THEN 'report' ELSE hidden_reason END
    WHERE share_code = p_code
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM changed);
$$;

-- Admin (server only): recent summons without creator identity, and take-down.
CREATE FUNCTION public.part2_admin_list_summons()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(row_data ORDER BY created DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', s.id, 'share_code', s.share_code, 'school_name', sc.school_name,
      'graduation_year', s.graduation_year, 'target_name', s.target_name, 'created_at', s.created_at,
      'hidden_at', s.hidden_at, 'hidden_reason', s.hidden_reason, 'report_count', s.report_count) AS row_data,
      s.created_at AS created
    FROM public.summons s JOIN public.schools sc ON sc.id = s.school_id
    ORDER BY s.created_at DESC LIMIT 200
  ) recent;
$$;

CREATE FUNCTION public.part2_admin_hide_summons(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH changed AS (
    UPDATE public.summons SET hidden_at = now(), hidden_reason = 'admin'
    WHERE id = p_id AND hidden_at IS NULL RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM changed);
$$;

REVOKE ALL ON FUNCTION public.part2_get_own_status_tags() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.part2_set_own_status_tags(text[], text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.part2_year_masked_preview_v2(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.part2_get_year_chalkboard(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.part2_create_summons(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.part2_list_own_summons() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.part2_hide_own_summons(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.part2_get_public_summons(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.part2_request_summons_takedown(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part2_report_summons(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part2_admin_list_summons() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part2_admin_hide_summons(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.part2_get_own_status_tags() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_set_own_status_tags(text[], text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_year_masked_preview_v2(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_get_year_chalkboard(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_create_summons(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_list_own_summons() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_hide_own_summons(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.part2_get_public_summons(text) TO anon, authenticated, service_role;
-- Takedown/report go through rate-limited server routes only.
GRANT EXECUTE ON FUNCTION public.part2_request_summons_takedown(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part2_report_summons(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.part2_admin_list_summons() TO service_role;
GRANT EXECUTE ON FUNCTION public.part2_admin_hide_summons(uuid) TO service_role;

COMMIT;
