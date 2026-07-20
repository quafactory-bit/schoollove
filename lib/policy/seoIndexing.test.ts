import { describe, expect, it } from 'vitest'
import {
  buildIndexableSitemapEntries,
  isClassPageIndexable,
  isSchoolPageIndexable,
  isYearPageIndexable,
  SEO_INDEX_THRESHOLD,
  type SitemapProfileRow,
} from './seoIndexing'

describe('SEO_INDEX_THRESHOLD — docs/design-package-v1.0/10-seo.md §3 (School/Year/Class 공통 3명)', () => {
  it('3이다', () => {
    expect(SEO_INDEX_THRESHOLD).toBe(3)
  })
})

describe.each([
  ['isSchoolPageIndexable', isSchoolPageIndexable],
  ['isYearPageIndexable', isYearPageIndexable],
  ['isClassPageIndexable', isClassPageIndexable],
] as const)('%s — 미만/경계/초과 + 방어적 입력', (_name, fn) => {
  it('0명은 noindex(false)', () => {
    expect(fn(0)).toBe(false)
  })
  it('1명은 noindex(false)', () => {
    expect(fn(1)).toBe(false)
  })
  it('2명(임계값 미만)은 noindex(false)', () => {
    expect(fn(2)).toBe(false)
  })
  it('3명(임계값 경계)은 index(true)', () => {
    expect(fn(3)).toBe(true)
  })
  it('4명(임계값 초과)은 index(true)', () => {
    expect(fn(4)).toBe(true)
  })
  it('음수는 noindex(false)로 안전하게 처리한다', () => {
    expect(fn(-1)).toBe(false)
  })
  it('NaN은 noindex(false)로 안전하게 처리한다', () => {
    expect(fn(NaN)).toBe(false)
  })
  it('Infinity/비정상 타입도 예외를 던지지 않고 noindex(false)를 반환한다', () => {
    expect(fn(Infinity)).toBe(false)
    // @ts-expect-error — 런타임 방어(DB 오류 등으로 숫자가 아닌 값이 들어오는 경우) 검증
    expect(fn(null)).toBe(false)
    // @ts-expect-error
    expect(fn(undefined)).toBe(false)
  })
  it('동일 입력에 항상 동일한 결과를 반환한다(결정적)', () => {
    expect(fn(3)).toBe(fn(3))
    expect(fn(2)).toBe(fn(2))
  })
})

function row(overrides: Partial<SitemapProfileRow> = {}): SitemapProfileRow {
  return {
    schoolSlug: 'daechi-high',
    graduationYear: 2020,
    grade: 1,
    classNumber: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildIndexableSitemapEntries — School/Year/Class 집계 + 정책 필터 + canonical 경로', () => {
  it('학교 3명 미만이면 school entry를 만들지 않는다', () => {
    const rows = [row(), row()]
    const entries = buildIndexableSitemapEntries(rows)
    expect(entries.find((e) => e.kind === 'school')).toBeUndefined()
  })

  it('학교 3명 이상이면 school entry를 canonical과 동일한 경로로 만든다', () => {
    const rows = [row(), row(), row()]
    const entries = buildIndexableSitemapEntries(rows)
    const school = entries.find((e) => e.kind === 'school')
    expect(school?.path).toBe('/school/daechi-high')
  })

  it('같은 학교라도 연도가 다르면 각 연도의 count를 독립적으로 센다', () => {
    const rows = [
      row({ graduationYear: 2020 }),
      row({ graduationYear: 2020 }),
      row({ graduationYear: 2020 }),
      row({ graduationYear: 2021 }),
      row({ graduationYear: 2021 }),
    ]
    const entries = buildIndexableSitemapEntries(rows)
    const years = entries.filter((e) => e.kind === 'year').map((e) => e.path)
    expect(years).toContain('/school/daechi-high/2020')
    expect(years).not.toContain('/school/daechi-high/2021')
  })

  it('반은 학년+반 번호까지 같아야 같은 그룹으로 센다', () => {
    const rows = [
      row({ grade: 1, classNumber: 1 }),
      row({ grade: 1, classNumber: 1 }),
      row({ grade: 1, classNumber: 1 }),
      row({ grade: 1, classNumber: 2 }),
    ]
    const entries = buildIndexableSitemapEntries(rows)
    const classes = entries.filter((e) => e.kind === 'class').map((e) => e.path)
    expect(classes).toContain('/school/daechi-high/2020/1-1')
    expect(classes).not.toContain('/school/daechi-high/2020/1-2')
  })

  it('grade/classNumber가 null이면 school/year count에는 포함되지만 class entry는 만들지 않는다', () => {
    const rows = [
      row({ grade: null, classNumber: null }),
      row({ grade: null, classNumber: null }),
      row({ grade: null, classNumber: null }),
    ]
    const entries = buildIndexableSitemapEntries(rows)
    expect(entries.find((e) => e.kind === 'school')).toBeDefined()
    expect(entries.find((e) => e.kind === 'year')).toBeDefined()
    expect(entries.find((e) => e.kind === 'class')).toBeUndefined()
  })

  it('graduationYear가 null/NaN이면 school count에는 포함되지만 year/class entry는 만들지 않는다', () => {
    const rows = [
      row({ graduationYear: null }),
      row({ graduationYear: null }),
      row({ graduationYear: null }),
    ]
    const entries = buildIndexableSitemapEntries(rows)
    expect(entries.find((e) => e.kind === 'school')).toBeDefined()
    expect(entries.find((e) => e.kind === 'year')).toBeUndefined()
    expect(entries.find((e) => e.kind === 'class')).toBeUndefined()
  })

  it('schoolSlug가 없으면 그 행 전체를 건너뛴다(잘못된 slug 값 제외)', () => {
    const rows = [row({ schoolSlug: null }), row({ schoolSlug: null }), row({ schoolSlug: null })]
    const entries = buildIndexableSitemapEntries(rows)
    expect(entries).toEqual([])
  })

  it('lastModified는 그룹 내 가장 최근 created_at이다', () => {
    const rows = [
      row({ createdAt: '2026-01-01T00:00:00.000Z' }),
      row({ createdAt: '2026-03-15T00:00:00.000Z' }),
      row({ createdAt: '2026-02-01T00:00:00.000Z' }),
    ]
    const entries = buildIndexableSitemapEntries(rows)
    const school = entries.find((e) => e.kind === 'school')
    expect(school?.lastModified.toISOString()).toBe('2026-03-15T00:00:00.000Z')
  })

  it('createdAt이 없거나 유효하지 않아도 예외를 던지지 않는다', () => {
    const rows = [
      row({ createdAt: null }),
      row({ createdAt: 'not-a-date' }),
      row({ createdAt: undefined }),
    ]
    expect(() => buildIndexableSitemapEntries(rows)).not.toThrow()
    const entries = buildIndexableSitemapEntries(rows)
    expect(entries.find((e) => e.kind === 'school')?.lastModified).toBeInstanceOf(Date)
  })

  it('빈 배열이면 빈 배열을 반환한다(빈 DB 결과 방어)', () => {
    expect(buildIndexableSitemapEntries([])).toEqual([])
  })

  it('중복 URL을 만들지 않는다(같은 그룹은 하나의 entry로 합쳐진다)', () => {
    const rows = Array.from({ length: 5 }, () => row())
    const entries = buildIndexableSitemapEntries(rows)
    const paths = entries.map((e) => e.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})
