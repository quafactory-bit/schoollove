import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 실제 DB에 접속하지 않는 정적 테스트 — migration SQL 파일 텍스트에
// 운영 DB 수동 보안 변경 동기화에서 요구된 조건들이 실제로 존재하는지만 확인한다.
// (Supabase에 적용된 뒤의 실제 동작은 별도 smoke test로 검증해야 한다.)
const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '20260717130000_rls_manual_security_sync.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const TABLES = ['reports', 'profiles', 'schools', 'search_logs', 'traces']

describe('운영 DB 수동 RLS 보안 변경 동기화 migration — 정적 검토', () => {
  it('5개 테이블 모두 ROW LEVEL SECURITY를 활성화한다', () => {
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`))
    }
  })

  it('5개 테이블 모두 anon/authenticated의 전체 권한을 먼저 REVOKE한다 — TRUNCATE/UPDATE/DELETE 포함 공개 권한 제거', () => {
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated;`))
    }
  })

  it('anon/authenticated에게 UPDATE/DELETE/TRUNCATE 테이블 권한을 별도로 GRANT하는 구문이 없다', () => {
    expect(sql).not.toMatch(/GRANT\s+UPDATE\b/i)
    expect(sql).not.toMatch(/GRANT\s+DELETE\b/i)
    expect(sql).not.toMatch(/GRANT\s+TRUNCATE\b/i)
  })

  it('reports: 지정된 컬럼만 INSERT 허용, SELECT는 GRANT하지 않는다', () => {
    expect(sql).toMatch(
      /GRANT INSERT \(profile_id, type, reason, requested_instagram_id, is_self_claimed\)\s+ON public\.reports TO anon, authenticated;/
    )
    expect(sql).not.toMatch(/GRANT SELECT ON public\.reports/)
  })

  it('profiles: SELECT 허용 + 지정된 컬럼만 INSERT 허용(id/created_at/report_count/is_hidden 제외)', () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.profiles TO anon, authenticated;/)
    expect(sql).toMatch(
      /GRANT INSERT \(\s*school_id, graduation_year, grade, class_number, department,\s*student_year, nickname, instagram_id, description, is_self, message\s*\) ON public\.profiles TO anon, authenticated;/
    )
  })

  it('schools: SELECT만 허용하고 INSERT는 GRANT하지 않는다', () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.schools TO anon, authenticated;/)
    expect(sql).not.toMatch(/GRANT INSERT[^;]*ON public\.schools/)
  })

  it('search_logs: SELECT를 GRANT하지 않고, 지정된 컬럼만 INSERT 허용(id/created_at 제외)', () => {
    expect(sql).not.toMatch(/GRANT SELECT ON public\.search_logs/)
    expect(sql).toMatch(
      /GRANT INSERT \(query, result_count, clicked_school_id\)\s+ON public\.search_logs TO anon, authenticated;/
    )
  })

  it('traces: SELECT 허용 + 지정된 컬럼만 INSERT 허용(id/created_at/is_hidden/report_count 제외)', () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.traces TO anon, authenticated;/)
    expect(sql).toMatch(
      /GRANT INSERT \(school_id, graduation_year, grade, class_number, message\)\s+ON public\.traces TO anon, authenticated;/
    )
  })

  it('위험/중복 정책을 IF EXISTS로 제거한다 — reports', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "anon can read all reports" ON public\.reports;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "anon can update report status" ON public\.reports;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "temp service role delete" ON public\.reports;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "reports_insert" ON public\.reports;/)
  })

  it('위험/중복 정책을 IF EXISTS로 제거한다 — profiles', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "admin_can_delete_profiles" ON public\.profiles;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "anon can read all profiles for admin" ON public\.profiles;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "anon can update profile flags" ON public\.profiles;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "profiles_select_visible" ON public\.profiles;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "profiles_read" ON public\.profiles;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "profiles_insert" ON public\.profiles;/)
  })

  it('위험/중복 정책을 IF EXISTS로 제거한다 — schools/search_logs/traces', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "schools_select_all" ON public\.schools;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Allow anon insert" ON public\.search_logs;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "anon can read search_logs counts" ON public\.search_logs;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "search_logs_insert" ON public\.search_logs;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "traces_select_public" ON public\.traces;/)
    expect(sql).toMatch(/DROP POLICY IF EXISTS "traces_insert_public" ON public\.traces;/)
  })

  it('최종 정책 조건이 지시된 그대로다 — reports_insert', () => {
    expect(sql).toMatch(
      /CREATE POLICY "reports_insert" ON public\.reports\s+FOR INSERT TO anon, authenticated\s+WITH CHECK \(status = 'pending'\);/
    )
  })

  it('최종 정책 조건이 지시된 그대로다 — profiles_read / profiles_insert', () => {
    expect(sql).toMatch(
      /CREATE POLICY "profiles_read" ON public\.profiles\s+FOR SELECT TO anon, authenticated\s+USING \(is_hidden = false\);/
    )
    expect(sql).toMatch(
      /CREATE POLICY "profiles_insert" ON public\.profiles\s+FOR INSERT TO anon, authenticated\s+WITH CHECK \(is_hidden = false AND report_count = 0\);/
    )
  })

  it('최종 정책 조건이 지시된 그대로다 — schools_read', () => {
    expect(sql).toMatch(
      /CREATE POLICY "schools_read" ON public\.schools\s+FOR SELECT TO anon, authenticated\s+USING \(true\);/
    )
  })

  it('최종 정책 조건이 지시된 그대로다 — search_logs_insert', () => {
    expect(sql).toMatch(
      /CREATE POLICY "search_logs_insert" ON public\.search_logs\s+FOR INSERT TO anon, authenticated\s+WITH CHECK \(\s*char_length\(btrim\(query\)\) BETWEEN 1 AND 100\s*AND \(result_count IS NULL OR result_count >= 0\)\s*\);/
    )
  })

  it('최종 정책 조건이 지시된 그대로다 — traces_select_public / traces_insert_public', () => {
    expect(sql).toMatch(
      /CREATE POLICY "traces_select_public" ON public\.traces\s+FOR SELECT TO anon, authenticated\s+USING \(is_hidden = false\);/
    )
    expect(sql).toMatch(
      /CREATE POLICY "traces_insert_public" ON public\.traces\s+FOR INSERT TO anon, authenticated\s+WITH CHECK \(\s*is_hidden = false\s*AND report_count = 0\s*AND char_length\(message\) BETWEEN 1 AND 40\s*\);/
    )
  })

  it('search_logs에 anon/authenticated 공개 SELECT를 부여하는 구문이 전혀 없다', () => {
    expect(sql).not.toMatch(/GRANT SELECT[^;]*search_logs/)
  })

  it('제약조건을 이름 기준 존재 확인(IF NOT EXISTS 의미) 후 추가한다', () => {
    expect(sql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = 'search_logs_query_length_check'\s*\)/
    )
    expect(sql).toMatch(
      /ADD CONSTRAINT search_logs_query_length_check\s*CHECK \(char_length\(btrim\(query\)\) BETWEEN 1 AND 100\);/
    )
    expect(sql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = 'search_logs_result_count_check'\s*\)/
    )
    expect(sql).toMatch(
      /ADD CONSTRAINT search_logs_result_count_check\s*CHECK \(result_count IS NULL OR result_count >= 0\);/
    )
    expect(sql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = 'search_logs_clicked_school_id_fkey'\s*\)/
    )
    expect(sql).toMatch(
      /ADD CONSTRAINT search_logs_clicked_school_id_fkey\s*FOREIGN KEY \(clicked_school_id\) REFERENCES public\.schools\(id\) ON DELETE SET NULL;/
    )
    expect(sql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = 'traces_report_count_check'\s*\)/
    )
    expect(sql).toMatch(
      /ADD CONSTRAINT traces_report_count_check\s*CHECK \(report_count >= 0\);/
    )
  })

  it('public.handle_report_count()의 EXECUTE를 PUBLIC, anon, authenticated에서 회수하고 함수/트리거 자체는 변경하지 않는다', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.handle_report_count\(\) FROM PUBLIC, anon, authenticated;/
    )
    expect(sql).not.toMatch(/DROP FUNCTION[^;]*handle_report_count/i)
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.handle_report_count/i)
    expect(sql).not.toMatch(/DROP TRIGGER/i)
  })

  it('service_role 권한을 REVOKE/GRANT하는 실제 SQL 구문이 전혀 없다(설명 주석 내 언급은 제외)', () => {
    // 줄바꿈을 넘지 않게 제한해 여러 줄짜리 한국어 설명 주석에서의 우연한
    // 단어 인접(예: "...REVOKE ALL\n...service_role은...")을 오탐하지 않는다.
    expect(sql).not.toMatch(/REVOKE[^;\n]*service_role/i)
    expect(sql).not.toMatch(/GRANT[^;\n]*TO[^;\n]*service_role/i)
  })

  it('DROP TABLE, CREATE TABLE, ADD COLUMN 실제 SQL 구문이 없다 — 테이블/컬럼을 새로 만들지 않는다', () => {
    expect(sql).not.toMatch(/^\s*DROP TABLE\b/im)
    expect(sql).not.toMatch(/^\s*CREATE TABLE\b/im)
    expect(sql).not.toMatch(/^\s*(ALTER TABLE[^;]*)?ADD COLUMN\b/im)
  })

  it('DB 데이터를 변경하는 실제 SQL 구문(INSERT/UPDATE/DELETE/TRUNCATE)이 없다 — 스키마/권한 변경 전용', () => {
    // "--"로 시작하지 않는 줄에서만 문(statement) 시작 키워드를 검사해
    // 설명 주석 안의 단어 언급(예: "INSERT/UPDATE/DELETE/TRUNCATE 없음")을 제외한다.
    expect(sql).not.toMatch(/^\s*INSERT\s+INTO\b/im)
    expect(sql).not.toMatch(/^\s*UPDATE\s+public\./im)
    expect(sql).not.toMatch(/^\s*DELETE\s+FROM\b/im)
    expect(sql).not.toMatch(/^\s*TRUNCATE\b/im)
  })

  it('20260717120000 migration과 충돌하지 않음을 주석으로 명시한다', () => {
    expect(sql).toContain('20260717120000_search_logs_aggregate_rpc.sql')
  })

  it('파일에 깨진 인코딩 문자(유니코드 치환 문자 U+FFFD)가 없다', () => {
    expect(sql).not.toContain('�')
  })

  it('한국어 주석이 정상적으로 읽힌다(실제 UTF-8 파일임을 텍스트로도 확인)', () => {
    expect(sql).toContain('운영 DB 수동 RLS/권한 변경 사항을 저장소 migration으로 동기화')
    expect(sql).toContain('기존 데이터는 전혀 건드리지 않는다')
  })
})
