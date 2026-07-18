import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 실제 DB에 접속하지 않는 정적 테스트 — migration SQL 파일 텍스트에
// 와일드카드 리터럴 처리 보정에서 요구된 조건들이 실제로 존재하는지만
// 확인한다. (Supabase에 적용된 뒤의 실제 동작은 별도 smoke test로 검증해야
// 한다.) 백슬래시가 포함된 리터럴은 정규식 대신 String.raw + toContain으로
// 비교해 JS 문자열/정규식 이스케이프가 이중으로 겹치는 것을 피한다.
const sqlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '20260718100000_escape_search_log_count_wildcards.sql'
)
const sql = readFileSync(sqlPath, 'utf-8')

describe('get_school_search_count 와일드카드 리터럴 처리 보정 migration — 정적 검토', () => {
  it('기존 함수 시그니처를 CREATE OR REPLACE로 유지한다', () => {
    expect(sql).toMatch(
      /create or replace function public\.get_school_search_count\(\s*search_tokens text\[\]\s*\)/
    )
  })

  it('RETURNS integer, LANGUAGE sql, STABLE을 유지한다', () => {
    expect(sql).toMatch(/returns integer/)
    expect(sql).toMatch(/language sql/)
    expect(sql).toMatch(/\bstable\b/)
  })

  it('SECURITY DEFINER와 빈 search_path를 유지한다', () => {
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = ''/)
  })

  it('public.search_logs를 스키마까지 명시해서 참조한다', () => {
    expect(sql).toMatch(/from public\.search_logs sl/)
  })

  it('입력 배열이 20개를 초과하면 빈 집합으로 처리하는 cardinality 가드가 있다', () => {
    expect(sql).toMatch(
      /cardinality\(\s*coalesce\(search_tokens, array\[\]::text\[\]\)\s*\)\s*>\s*20/
    )
    expect(sql).toMatch(/then array\[\]::text\[\]/)
  })

  it('cardinality 가드를 통과한 입력은 앞 8개 토큰만 사용한다', () => {
    expect(sql).toMatch(/\)\[1:8\]/)
  })

  it('btrim 후 길이 2~100인 토큰만 사용한다', () => {
    expect(sql).toMatch(/length\(btrim\(raw_token\)\) between 2 and 100/)
  })

  it('DISTINCT로 중복 토큰을 제거한다', () => {
    expect(sql).toMatch(/select distinct\s+btrim\(raw_token\) as token/)
  })

  it('백슬래시를 %, _ 보다 먼저 이스케이프한다(순서가 정확해야 한다)', () => {
    const backslashIndex = sql.indexOf(String.raw`E'\\',`)
    const percentIndex = sql.indexOf(`'%',`, backslashIndex)
    const underscoreIndex = sql.indexOf(`'_',`, percentIndex)

    expect(backslashIndex).toBeGreaterThan(-1)
    expect(percentIndex).toBeGreaterThan(backslashIndex)
    expect(underscoreIndex).toBeGreaterThan(percentIndex)
  })

  it('백슬래시를 이중 이스케이프(단일 -> 이중)로 치환한다', () => {
    expect(sql).toContain(String.raw`E'\\',`)
    expect(sql).toContain(String.raw`E'\\\\'`)
  })

  it('%를 리터럴 이스케이프(\\%)로 치환한다', () => {
    expect(sql).toContain(`'%',`)
    expect(sql).toContain(String.raw`E'\\%'`)
  })

  it('_를 리터럴 이스케이프(\\_)로 치환한다', () => {
    expect(sql).toContain(`'_',`)
    expect(sql).toContain(String.raw`E'\\_'`)
  })

  it('ILIKE 패턴에 ESCAPE 절이 명시돼 있다', () => {
    expect(sql).toMatch(/ilike \(\s*'%' \|\| et\.escaped_token \|\| '%'\s*\)/)
    expect(sql).toContain(String.raw`escape E'\\'`)
  })

  it('각 토큰의 매칭 카운트 중 MAX를 반환한다', () => {
    expect(sql).toMatch(/select coalesce\(max\(cnt\), 0\)::integer/)
    expect(sql).toMatch(/from token_counts/)
  })

  it('PUBLIC 기본 실행 권한을 REVOKE한다', () => {
    expect(sql).toMatch(
      /revoke all\s+on function public\.get_school_search_count\(text\[\]\)\s+from public;/
    )
  })

  it('anon, authenticated, service_role에 EXECUTE를 부여한다', () => {
    expect(sql).toMatch(
      /grant execute\s+on function public\.get_school_search_count\(text\[\]\)\s+to anon, authenticated, service_role;/
    )
  })

  it('id, query, created_at 등 개별 로그 행 컬럼을 SELECT 목록으로 반환하지 않는다', () => {
    const bodyStart = sql.indexOf('as $$')
    const bodyEnd = sql.indexOf('$$;', bodyStart)
    const body = sql.slice(bodyStart, bodyEnd)

    expect(body).not.toMatch(/select\s+sl\.\*/)
    expect(body).not.toMatch(/select\s+sl\.id\b/)
    expect(body).not.toMatch(/select\s+sl\.query\b/)
    expect(body).not.toMatch(/select\s+sl\.created_at\b/)
  })

  it('LANGUAGE sql이며 동적 SQL(EXECUTE 문자열 실행, format())을 사용하지 않는다', () => {
    expect(sql).not.toMatch(/execute\s+'/i)
    expect(sql).not.toMatch(/format\(/i)
  })

  it('DB를 변경하는 구문(INSERT/UPDATE/DELETE/TRUNCATE)이 없다 — 읽기 전용', () => {
    expect(sql).not.toMatch(/\binsert\s+into\b/i)
    expect(sql).not.toMatch(/\bupdate\s+\w+\s+set\b/i)
    expect(sql).not.toMatch(/\bdelete\s+from\b/i)
    expect(sql).not.toMatch(/\btruncate\b/i)
  })

  it('DROP 구문이 없다', () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|function|policy|index)\b/i)
  })

  it('기존 search_logs 테이블 권한을 직접 GRANT/REVOKE하지 않는다 — 함수 권한만 다룬다', () => {
    expect(sql).not.toMatch(/revoke[^;]*on (table )?public\.search_logs/i)
    expect(sql).not.toMatch(/grant[^;]*on (table )?public\.search_logs/i)
  })

  it('trigram 확장이나 인덱스를 포함하지 않는다 — 성능 작업은 별도 migration으로 분리한다', () => {
    expect(sql).not.toMatch(/create extension/i)
    expect(sql).not.toMatch(/create index/i)
    expect(sql).not.toMatch(/gin_trgm_ops/i)
  })

  it('파일에 깨진 인코딩 문자(유니코드 치환 문자 U+FFFD)가 없다', () => {
    expect(sql).not.toContain('�')
  })

  it('한국어 주석이 정상적으로 읽힌다(실제 UTF-8 파일임을 텍스트로도 확인)', () => {
    expect(sql).toContain('와일드카드 리터럴 처리 보정')
    expect(sql).toContain('injection이 아니다')
  })
})
