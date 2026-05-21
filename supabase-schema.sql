-- =====================================================
-- 스쿨러브아이 Supabase 스키마
-- 실행: Supabase SQL Editor에 전체 붙여넣고 실행
-- =====================================================

-- ─── 확장 ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 1. schools ────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_name  TEXT NOT NULL,
  school_type  TEXT NOT NULL CHECK (school_type IN ('elementary','middle','high','university','college')),
  sido         TEXT NOT NULL DEFAULT '',
  sigungu      TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  school_code  TEXT NOT NULL DEFAULT '',
  slug         TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm  ON schools USING GIN (school_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_schools_slug        ON schools (slug);
CREATE INDEX IF NOT EXISTS idx_schools_type        ON schools (school_type);
CREATE INDEX IF NOT EXISTS idx_schools_sido        ON schools (sido);

-- ─── 2. profiles ───────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  graduation_year  INTEGER NOT NULL,
  grade            INTEGER,
  class_number     INTEGER,
  department       TEXT,
  student_year     INTEGER,
  nickname         TEXT NOT NULL,
  instagram_id     TEXT,
  report_count     INTEGER NOT NULL DEFAULT 0,
  is_hidden        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 중복 방지 (학교+년도+학년+반+이름)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_identity
  ON profiles (school_id, graduation_year, COALESCE(grade, 0), COALESCE(class_number, 0), LOWER(nickname));

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_school_year  ON profiles (school_id, graduation_year);
CREATE INDEX IF NOT EXISTS idx_profiles_hidden        ON profiles (is_hidden);
CREATE INDEX IF NOT EXISTS idx_profiles_nickname_trgm ON profiles USING GIN (nickname gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_instagram      ON profiles (instagram_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created        ON profiles (created_at DESC);

-- ─── 3. reports ────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                     TEXT NOT NULL CHECK (type IN ('report','edit','delete')),
  reason                   TEXT NOT NULL DEFAULT '',
  requested_instagram_id   TEXT,
  is_self_claimed          BOOLEAN NOT NULL DEFAULT FALSE,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_profile    ON reports (profile_id);
CREATE INDEX IF NOT EXISTS idx_reports_status     ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_type       ON reports (type);
CREATE INDEX IF NOT EXISTS idx_reports_created    ON reports (created_at DESC);

-- ─── RLS (Row Level Security) ──────────────────────
ALTER TABLE schools  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports  ENABLE ROW LEVEL SECURITY;

-- schools: 누구나 읽기 가능, 쓰기 불가 (관리자는 Supabase 대시보드 직접)
CREATE POLICY "schools_select_all" ON schools FOR SELECT USING (true);

-- profiles: 숨김 처리 안 된 것만 읽기, 누구나 INSERT
CREATE POLICY "profiles_select_visible" ON profiles FOR SELECT USING (is_hidden = false);
CREATE POLICY "profiles_insert_anon"    ON profiles FOR INSERT WITH CHECK (true);
-- report_count, is_hidden 업데이트는 service role만 (trigger로 처리)
CREATE POLICY "profiles_update_system"  ON profiles FOR UPDATE USING (true); -- MVP: 단순화

-- reports: INSERT만 허용, SELECT 불가 (관리자만 볼 수 있음)
CREATE POLICY "reports_insert_anon" ON reports FOR INSERT WITH CHECK (true);
-- 관리자용 (service role key 사용 시 RLS bypass)

-- ─── 트리거: 신고 3회 이상 → 자동 hidden ──────────
CREATE OR REPLACE FUNCTION auto_hide_on_reports()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_count >= 3 THEN
    NEW.is_hidden := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_hide
  BEFORE UPDATE OF report_count ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_hide_on_reports();

-- ─── 완료 확인 ──────────────────────────────────────
SELECT 'Schema created successfully!' AS status;
