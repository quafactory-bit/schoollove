import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getAllProfilesBySchoolYear, getYearProfileCount } from '@/lib/api/profiles'
import YearPeopleSearch from '@/components/YearPeopleSearch'
import {
  aggregateClassCounts,
  classifyYearState,
  formatRelativeTime,
  pickMostActiveClass,
  pickMostRecentRegistration,
} from '@/lib/policy/yearHub'
import { getYearPageMetadata } from '@/lib/seo'
import { isYearPageIndexable } from '@/lib/policy/seoIndexing'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { formatNumber } from '@/lib/utils'

// PHASE 8: noindex 임계값은 lib/policy/seoIndexing.ts(SEO_INDEX_THRESHOLD)로 일원화됐다 —
// sitemap도 동일 함수를 쓰므로 이 페이지의 noindex와 sitemap 포함 여부가 항상 일치한다.
// generateMetadata는 getYearProfileCount만 별도로 호출해(가벼운 head:true count) 페이지
// 본문의 전체 명단 로드와 분리한다(PHASE 7B부터 유지).

interface PageProps {
  params: Promise<{ slug: string; year: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, year } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return { title: '학교를 찾을 수 없습니다', robots: { index: false, follow: false } }

  const meta = getYearPageMetadata(school, parseInt(year))

  const count = await getYearProfileCount(school.id, parseInt(year))

  return {
    ...meta,
    robots: isYearPageIndexable(count)
      ? { index: true, follow: true }
      : { index: false, follow: true },
  }
}

export default async function YearPage({ params }: PageProps) {
  const { slug, year: yearStr } = await params
  const year = parseInt(yearStr)

  if (isNaN(year) || year < 1980 || year > new Date().getFullYear() + 10) notFound()

  const school = await getSchoolBySlug(slug)
  if (!school) notFound()

  // PHASE 7B — docs/design-package-v1.0/06-people-discovery.md §E: 기수 전체 명단을
  // 한 번에 로드한다(페이지네이션 없음). 반별 집계·가장 활발한 반·최근 등록·기수 상태는
  // 전부 이 한 번의 조회 결과로부터 순수 함수(lib/policy/yearHub.ts)가 계산한다 —
  // 추가 DB 왕복이 없다.
  const profiles = await getAllProfilesBySchoolYear(school.id, year)

  const classes = aggregateClassCounts(profiles)
  const mostActiveClass = pickMostActiveClass(classes)
  const mostRecent = pickMostRecentRegistration(profiles)
  const state = classifyYearState(profiles.length)
  const now = new Date()

  return (
    <div className="page-container space-y-5">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1 text-xs text-gray-400 flex-wrap">
        <Link href="/" className="hover:text-gray-600">홈</Link>
        <ChevronRight size={12} />
        <Link href={`/school/${slug}`} className="hover:text-gray-600">{school.school_name}</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600 font-medium">{year}년 졸업</span>
      </nav>

      {/* A. 기수 헤더 */}
      <div className="card p-5 space-y-2">
        <h1 className="text-xl font-black text-gray-900">
          {school.school_name}
          <span className="text-brand-blue ml-2">{year}년</span>
        </h1>
        <p className="text-sm text-gray-500">
          {SCHOOL_TYPE_LABELS[school.school_type]} · 졸업(예정) · 총 {formatNumber(profiles.length)}명
        </p>
        <Link href="/submit" className="btn-primary inline-block text-sm">
          등록하기
        </Link>
      </div>

      {state === 'empty' ? (
        // State 1: 빈 기수 — 검색창을 아예 렌더하지 않는다(발견할 사람이 없음).
        <div className="card p-10 text-center space-y-2">
          <p className="text-2xl">📭</p>
          <p className="font-semibold text-gray-700">{year}년 등록된 사람이 없어요</p>
          <Link href="/submit" className="btn-primary inline-block text-sm mt-2">
            첫 번째로 등록하기
          </Link>
        </div>
      ) : (
        <>
          {/* B. 기수 컨텍스트 — 실제 데이터에서만 계산, 가짜 숫자·placeholder 없음 */}
          <section className="card space-y-1.5 p-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900">이 기수 지금</p>
              {state === 'active' && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">
                  활발한 기수
                </span>
              )}
            </div>
            <p>등록 인원 {formatNumber(profiles.length)}명 · 등록 반 {classes.length}개</p>
            {mostActiveClass && (
              <p>
                가장 활발한 반 ·{' '}
                <span className="font-medium text-gray-800">
                  {mostActiveClass.grade}학년 {mostActiveClass.classNumber}반
                </span>{' '}
                ({mostActiveClass.count}명)
              </p>
            )}
            {mostRecent && <p>최근 등록 · {formatRelativeTime(mostRecent.created_at, now)}</p>}
          </section>

          {/* E. 반 탐색 (초/중/고만 — grade/class_number가 있는 프로필만 집계됨) */}
          {classes.length > 0 && (
            <section className="space-y-2">
              <h2 className="section-title">반별 보기</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {classes.map((c) => (
                  <Link
                    key={`${c.grade}-${c.classNumber}`}
                    href={`/school/${slug}/${year}/${c.grade}-${c.classNumber}`}
                    className="card p-3 text-center hover:border-brand-blue transition-colors group"
                  >
                    <p className="font-semibold text-sm text-gray-800 group-hover:text-brand-blue">
                      {c.grade}학년 {c.classNumber}반
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {c.count}명
                      {mostActiveClass &&
                        c.grade === mostActiveClass.grade &&
                        c.classNumber === mostActiveClass.classNumber && (
                          <span className="ml-1 text-blue-500">· 활발</span>
                        )}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* C+D. 이름 검색 + 전체 명단(검색어 없을 때) */}
          <YearPeopleSearch profiles={profiles} />
        </>
      )}
    </div>
  )
}
