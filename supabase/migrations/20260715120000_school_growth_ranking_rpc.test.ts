import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 실제 DB에 접속하지 않는 정적 테스트 — migration SQL 파일 텍스트에
// 이번 Phase 1B에서 요구된 조건들이 실제로 존재하는지만 확인한다.
// (Supabase에 적용된 뒤의 실제 동작은 별도 smoke test로 검증해야 한다.)
const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '20260715120000_school_growth_ranking_rpc.sql')
const sql = readFileSync(sqlPath, 'utf-8')

describe('school_growth_ranking_v1 migration SQL — 정적 검토', () => {
  it('함수가 존재한다', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.school_growth_ranking_v1/)
  })

  it('is_hidden = false 조건이 존재한다', () => {
    expect(sql).toMatch(/p\.is_hidden = false/)
  })

  it('기간 조건(p_since ~ p_until)이 존재한다', () => {
    expect(sql).toMatch(/p\.created_at >= p_since/)
    expect(sql).toMatch(/p\.created_at <= LEAST\(p_until, now\(\)\)/)
  })

  it('ranked CTE 내부 정렬이 결정적이다(신규 수 → 최근 등록 시각 → 학교명 → school_id 4단계)', () => {
    expect(sql).toMatch(/ORDER BY\s+pa\.new_visible_profiles DESC,\s+pa\.most_recent_registration_at DESC,\s+s\.school_name ASC,\s+s\.id ASC/)
  })

  it('최종 SELECT(FROM ranked r 이후)에도 동일한 결정적 ORDER BY가 존재한다 — CTE 내부 정렬만으로는 최종 반환 순서가 보장되지 않기 때문', () => {
    const finalSelectIndex = sql.indexOf('FROM ranked r')
    expect(finalSelectIndex).toBeGreaterThan(-1)
    const finalSelectTail = sql.slice(finalSelectIndex)

    expect(finalSelectTail).toMatch(
      /ORDER BY\s+r\.new_visible_profiles DESC,\s+r\.most_recent_registration_at DESC,\s+r\.school_name ASC,\s+r\.school_id ASC/
    )
  })

  it('LIMIT이 안전한 범위(1~50)로 clamp된다', () => {
    expect(sql).toMatch(/LIMIT LEAST\(GREATEST\(COALESCE\(p_limit, 5\), 1\), 50\)/)
  })

  it('nickname, instagram_id, message 등 개인정보성 필드를 반환하지 않는다', () => {
    expect(sql).not.toMatch(/nickname/)
    expect(sql).not.toMatch(/instagram_id/)
    expect(sql).not.toMatch(/\bmessage\b/)
  })

  it('SECURITY INVOKER로 선언되어 RLS를 우회하지 않는다', () => {
    expect(sql).toMatch(/SECURITY INVOKER/)
    expect(sql).not.toMatch(/SECURITY DEFINER/)
  })

  it('anon과 authenticated에게 EXECUTE 권한을 부여하고, service_role 전용으로 제한하지 않는다', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.school_growth_ranking_v1\([^)]*\) TO anon, authenticated/)
    expect(sql).not.toMatch(/TO service_role/)
  })

  it('PUBLIC 기본 실행 권한을 명시적으로 REVOKE한다(최소 권한 원칙)', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.school_growth_ranking_v1\([^)]*\) FROM PUBLIC/)
  })

  it('LANGUAGE sql이며 동적 SQL(EXECUTE)을 사용하지 않는다', () => {
    expect(sql).toMatch(/LANGUAGE sql/)
    expect(sql).not.toMatch(/EXECUTE\s+'/i)
    expect(sql).not.toMatch(/format\(/i)
  })

  it('DB를 변경하는 구문(INSERT/UPDATE/DELETE)이 없다 — 읽기 전용', () => {
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(sql).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
  })

  it('is_hidden=false 조건으로 스코프된 부분 인덱스를 함께 추가한다', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_profiles_visible_created_school/)
    expect(sql).toMatch(/ON profiles \(created_at DESC, school_id\)/)
    expect(sql).toMatch(/WHERE is_hidden = false/)
  })

  it('파일에 깨진 인코딩 문자(유니코드 치환 문자 U+FFFD)가 없다', () => {
    expect(sql).not.toContain('�')
  })

  it('한국어 주석과 COMMENT 문자열이 정상적으로 읽힌다(실제 UTF-8 파일임을 텍스트로도 확인)', () => {
    expect(sql).toContain('부분 인덱스')
    expect(sql).toContain('School Growth Foundation Phase 1B')
    expect(sql).toMatch(/COMMENT ON FUNCTION public\.school_growth_ranking_v1/)
  })
})
