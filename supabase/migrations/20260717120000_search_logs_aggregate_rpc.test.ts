import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 실제 DB에 접속하지 않는 정적 테스트 — migration SQL 파일 텍스트에
// search_logs 원문 비공개 전환 조건들이 실제로 존재하는지만 확인한다.
// (Supabase에 적용된 뒤의 실제 동작은 별도 smoke test로 검증해야 한다.)
const sqlPath = join(dirname(fileURLToPath(import.meta.url)), '20260717120000_search_logs_aggregate_rpc.sql')
const sql = readFileSync(sqlPath, 'utf-8')

describe('get_school_search_count 집계 RPC — 정적 검토', () => {
  it('함수가 존재하고 text[] 하나만 입력받는다', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_school_search_count\(search_tokens text\[\]\)/)
  })

  it('RETURNS integer, LANGUAGE sql, STABLE이다', () => {
    expect(sql).toMatch(/RETURNS integer/)
    expect(sql).toMatch(/LANGUAGE sql/)
    expect(sql).toMatch(/\bSTABLE\b/)
  })

  it('SECURITY DEFINER이며 SET search_path = \'\' 로 스키마 탐색 경로를 고정한다', () => {
    expect(sql).toMatch(/SECURITY DEFINER/)
    expect(sql).toMatch(/SET search_path = ''/)
  })

  it('search_logs를 반드시 스키마까지 명시해서 참조한다', () => {
    expect(sql).toMatch(/FROM public\.search_logs sl/)
  })

  it('입력 배열에서 앞에서부터 최대 8개 토큰만 사용한다', () => {
    expect(sql).toMatch(/\(COALESCE\(search_tokens, ARRAY\[\]::text\[\]\)\)\[1:8\]/)
  })

  it('btrim 후 길이 2~100인 토큰만 사용한다', () => {
    expect(sql).toMatch(/length\(btrim\(raw_token\)\) BETWEEN 2 AND 100/)
  })

  it('DISTINCT로 중복 토큰을 제거한다', () => {
    expect(sql).toMatch(/SELECT DISTINCT btrim\(raw_token\) AS token/)
  })

  it('토큰마다 query ILIKE 매칭 카운트를 계산하고 최댓값을 반환한다', () => {
    expect(sql).toMatch(/sl\.query ILIKE '%' \|\| vt\.token \|\| '%'/)
    expect(sql).toMatch(/SELECT COALESCE\(MAX\(cnt\), 0\)::integer FROM token_counts/)
  })

  it('id, query, created_at 등 개별 로그 행 컬럼을 SELECT 목록으로 반환하지 않는다', () => {
    const returnClauseIndex = sql.indexOf('RETURNS integer')
    const bodyStart = sql.indexOf('AS $$', returnClauseIndex)
    const bodyEnd = sql.indexOf('$$;', bodyStart)
    const body = sql.slice(bodyStart, bodyEnd)

    expect(body).not.toMatch(/SELECT\s+sl\.\*/)
    expect(body).not.toMatch(/SELECT\s+sl\.id\b/)
    expect(body).not.toMatch(/SELECT\s+sl\.query\b/)
    expect(body).not.toMatch(/SELECT\s+sl\.created_at\b/)
  })

  it('PUBLIC 기본 실행 권한을 REVOKE하고 anon/authenticated/service_role에만 EXECUTE를 부여한다', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_school_search_count\(text\[\]\) FROM PUBLIC/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_school_search_count\(text\[\]\) TO anon, authenticated, service_role/)
  })

  it('기존 anon 공개 조회 정책을 DROP POLICY IF EXISTS로 안전하게 제거한다', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "anon can read search_logs counts" ON public\.search_logs/)
  })

  it('anon과 authenticated의 search_logs 테이블 SELECT 권한을 REVOKE한다', () => {
    expect(sql).toMatch(/REVOKE SELECT ON public\.search_logs FROM anon, authenticated/)
  })

  it('search_logs_insert 정책을 DROP하거나 INSERT 권한을 REVOKE하는 구문이 없다', () => {
    expect(sql).not.toMatch(/DROP POLICY[^;]*search_logs_insert/i)
    expect(sql).not.toMatch(/REVOKE INSERT/i)
    expect(sql).not.toMatch(/DROP POLICY[^;]*insert/i)
  })

  it('service_role 권한을 변경하는 REVOKE 구문이 없다', () => {
    expect(sql).not.toMatch(/REVOKE[^;]*service_role/)
  })

  it('DB 데이터를 변경하는 구문(INSERT/UPDATE/DELETE)이 없다 — 읽기 전용', () => {
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(sql).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
  })

  it('LANGUAGE sql이며 동적 SQL(EXECUTE)을 사용하지 않는다', () => {
    expect(sql).not.toMatch(/EXECUTE\s+'/i)
    expect(sql).not.toMatch(/format\(/i)
  })

  it('파일에 깨진 인코딩 문자(유니코드 치환 문자 U+FFFD)가 없다', () => {
    expect(sql).not.toContain('�')
  })

  it('한국어 주석이 정상적으로 읽힌다(실제 UTF-8 파일임을 텍스트로도 확인)', () => {
    expect(sql).toContain('원문 공개 조회 제거')
    expect(sql).toContain('개별 로그 행(id/query/created_at)은 절대 반환하지 않는다')
  })
})
