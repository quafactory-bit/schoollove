// PHASE 8 — SEO INDEXING CONSISTENCY
// docs/design-package-v1.0/10-seo.md §3: School은 "등록 0~2명 구간은 noindex", Year/Class는
// "프로필 3명 미만은 noindex" — 문서상 세 종류 모두 동일한 숫자(3)다. metadata(School/Year/
// Class Hub)와 sitemap(app/sitemap.ts)이 각자 로컬 상수를 따로 정의하던 것이 이번 PHASE 8의
// 근본 원인(sitemap만 SCHOOL_THRESHOLD=1을 쓰고 Year/Class는 임계값 자체가 없었음)이므로,
// 숫자를 이 파일 한 곳에서만 정의하고 양쪽 모두 이 파일의 함수만 호출하게 한다.
import { buildClassPath, buildSchoolPath, buildYearPath } from '@/lib/seo'

export const SEO_INDEX_THRESHOLD = 3

// count 조회 실패 시(예: DB 오류로 0 반환) 또는 방어적으로 비정상 값이 들어와도 항상
// "색인하지 않음(false)" 쪽으로 안전하게 기본값을 잡는다 — 과도한 색인(thin content 노출)
// 보다 과소 색인이 안전하다.
function isIndexableCount(count: number): boolean {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return false
  return count >= SEO_INDEX_THRESHOLD
}

export function isSchoolPageIndexable(profileCount: number): boolean {
  return isIndexableCount(profileCount)
}

export function isYearPageIndexable(profileCount: number): boolean {
  return isIndexableCount(profileCount)
}

export function isClassPageIndexable(profileCount: number): boolean {
  return isIndexableCount(profileCount)
}

// ── Sitemap 집계 ──────────────────────────────────────────────────
// app/sitemap.ts가 이미 is_hidden=false로 필터링해 가져온 공개 프로필 원문 행(닉네임/
// Instagram ID 등 개인 식별자는 포함하지 않음, 집계에 필요한 필드만)을 넘겨받아 School/
// Year/Class 그룹별로 카운트를 세고, 위 정책 함수로 index 가능한 그룹만 걸러 canonical과
// 동일한 URL 경로(lib/seo.ts의 buildXxxPath)를 만든다. hidden 프로필 제외는 이 함수의
// 책임이 아니라 호출부(app/sitemap.ts의 DB 쿼리)의 책임이다 — 이 함수는 이미 걸러진
// 행을 신뢰한다(계약을 테스트로 명시).
export type SitemapProfileRow = {
  schoolSlug: string | null | undefined
  graduationYear: number | null | undefined
  grade: number | null | undefined
  classNumber: number | null | undefined
  createdAt: string | null | undefined
}

export type SitemapUrlEntry = {
  kind: 'school' | 'year' | 'class'
  path: string
  lastModified: Date
}

type Agg = { count: number; latest: Date | null }

function newAgg(): Agg {
  return { count: 0, latest: null }
}

function bumpAgg(agg: Agg, createdAt: string | null | undefined): void {
  agg.count += 1
  if (!createdAt) return
  const t = new Date(createdAt)
  if (Number.isNaN(t.getTime())) return
  if (!agg.latest || t.getTime() > agg.latest.getTime()) agg.latest = t
}

export function buildIndexableSitemapEntries(rows: SitemapProfileRow[]): SitemapUrlEntry[] {
  const schoolAgg = new Map<string, Agg>()
  const yearAgg = new Map<string, { slug: string; year: number; agg: Agg }>()
  const classAgg = new Map<string, { slug: string; year: number; grade: number; classNumber: number; agg: Agg }>()

  for (const row of rows) {
    const slug = row.schoolSlug
    if (!slug) continue

    const school = schoolAgg.get(slug) ?? newAgg()
    bumpAgg(school, row.createdAt)
    schoolAgg.set(slug, school)

    const year = row.graduationYear
    if (year === null || year === undefined || !Number.isFinite(year)) continue
    const yearKey = `${slug} ${year}`
    const yearEntry = yearAgg.get(yearKey) ?? { slug, year, agg: newAgg() }
    bumpAgg(yearEntry.agg, row.createdAt)
    yearAgg.set(yearKey, yearEntry)

    const { grade, classNumber } = row
    if (
      grade === null || grade === undefined || !Number.isFinite(grade) ||
      classNumber === null || classNumber === undefined || !Number.isFinite(classNumber)
    ) {
      continue
    }
    const classKey = `${slug} ${year} ${grade} ${classNumber}`
    const classEntry = classAgg.get(classKey) ?? { slug, year, grade, classNumber, agg: newAgg() }
    bumpAgg(classEntry.agg, row.createdAt)
    classAgg.set(classKey, classEntry)
  }

  const entries: SitemapUrlEntry[] = []

  for (const [slug, agg] of schoolAgg) {
    if (!isSchoolPageIndexable(agg.count)) continue
    entries.push({ kind: 'school', path: buildSchoolPath(slug), lastModified: agg.latest ?? new Date() })
  }

  for (const { slug, year, agg } of yearAgg.values()) {
    if (!isYearPageIndexable(agg.count)) continue
    entries.push({ kind: 'year', path: buildYearPath(slug, year), lastModified: agg.latest ?? new Date() })
  }

  for (const { slug, year, grade, classNumber, agg } of classAgg.values()) {
    if (!isClassPageIndexable(agg.count)) continue
    entries.push({
      kind: 'class',
      path: buildClassPath(slug, year, grade, classNumber),
      lastModified: agg.latest ?? new Date(),
    })
  }

  return entries
}
