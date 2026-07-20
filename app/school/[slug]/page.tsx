import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { ChevronRight } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getProfilesBySchool, getGraduationYearsBySchool, getSchoolProfileCount, getTotalProfileCount } from '@/lib/api/profiles'
import { incrSchoolView, getSchoolView } from '@/lib/api/views'
import { getTracesBySchool, getTraceCountBySchool } from '@/lib/api/traces'
import { getSchoolSearchCount } from '@/lib/api/searches'
import { calculateSchoolGrowthSnapshot } from '@/lib/policy/schoolGrowth'
import ProfileCard from '@/components/ProfileCard'
import SchoolWarmth from '@/components/SchoolWarmth'
import SchoolGrowthPanel from '@/components/SchoolGrowthPanel'
import { getSchoolPageMetadata } from '@/lib/seo'
import { isSchoolPageIndexable } from '@/lib/policy/seoIndexing'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { formatNumber } from '@/lib/utils'

// 사이트 전체 등록이 이 수를 넘으면 빈 페이지에 "전국 OOO명 등록" 사회적 증거를 노출.
// 미만이면 숫자를 숨기고 "첫 기록을 남겨라" 카피로 동작 (작은 숫자 역효과 방지).
const SOCIAL_PROOF_THRESHOLD = 300

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ year?: string; page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return { title: '학교를 찾을 수 없습니다', robots: { index: false, follow: false } }

  const meta = getSchoolPageMetadata(school)

  const count = await getSchoolProfileCount(school.id)

  return {
    ...meta,
    robots: isSchoolPageIndexable(count)
      ? { index: true, follow: true }
      : { index: false, follow: true },
  }
}

export default async function SchoolPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams
  const yearFilter = sp.year ? parseInt(sp.year) : undefined
  const page = sp.page ? parseInt(sp.page) : 1

  const school = await getSchoolBySlug(slug)
  if (!school) notFound()

  // 방문자 카운트: 사람만 +1, 봇(구글봇 등)은 숫자만 읽어서 안 부풀림
  const h = await headers()
  const ua = h.get('user-agent') ?? ''
  const isBot = /bot|crawl|spider|slurp|facebookexternalhit|bingpreview|embedly|pinterest|whatsapp|telegram/i.test(ua)

  const [{ data: profiles, count }, years, totalProfiles, viewCount, traces, traceCount, searchCount, visibleProfileCount] =
    await Promise.all([
      getProfilesBySchool(school.id, page, yearFilter),
      getGraduationYearsBySchool(school.id),
      getTotalProfileCount(),
      isBot ? getSchoolView(school.id) : incrSchoolView(school.id),
      getTracesBySchool(school.id),
      getTraceCountBySchool(school.id),
      getSchoolSearchCount(school.school_name, school.sido),
      // Growth Snapshot용 학교 전체(연도 필터 없는) 공개 프로필 수 — 위 count는 yearFilter가
      // 있으면 그 연도만의 수라 Level 계산에 그대로 쓸 수 없다(lib/api/levels.ts와 동일 정의 필요).
      getSchoolProfileCount(school.id),
    ])

  // School Hub Growth Panel — 읽기·계산만 수행한다. DB에 쓰지 않고 syncSchoolLevel도 호출하지 않는다.
  // school은 getSchoolBySlug()가 select('*')로 이미 가져온 값이라 current_level/level_updated_at을
  // 다시 조회하지 않는다(불필요한 중복 호출 방지).
  const growthSnapshot = calculateSchoolGrowthSnapshot({
    schoolId: school.id,
    schoolName: school.school_name,
    slug: school.slug,
    visibleProfileCount,
    storedCurrentLevel: school.current_level ?? null,
    levelUpdatedAt: school.level_updated_at ?? null,
  })

  const totalPages = Math.ceil(count / 20)
  const shareText = `${school.school_name} 동창 인스타, 여기서 찾아봐요`
  const shareUrl = `https://www.schoollove.kr/school/${slug}`

  return (
    <div className="page-container space-y-5">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1 text-xs text-gray-400">
        <Link href="/" className="hover:text-gray-600">홈</Link>
        <ChevronRight size={12} />
        <Link href="/search" className="hover:text-gray-600">
          {SCHOOL_TYPE_LABELS[school.school_type]}
        </Link>
        <ChevronRight size={12} />
        <span>{school.sido}</span>
        <ChevronRight size={12} />
        <span className="text-gray-600 font-medium">{school.school_name}</span>
      </nav>

      {/* 학교 성장 패널 — 학교 정체성 + 성장 메시지 + 진행률 + 핵심 CTA (School Hub Growth UI) */}
      <SchoolGrowthPanel
        schoolName={school.school_name}
        schoolType={school.school_type}
        sido={school.sido}
        sigungu={school.sigungu}
        slug={slug}
        snapshot={growthSnapshot}
        shareText={shareText}
        shareUrl={shareUrl}
      />

      {/* 온기 띠 + 한 줄 흔적 (방문자 수 / 검색 수 / 흔적 리스트 / 드롭다운 / 인스타 등록) */}
      <SchoolWarmth
        schoolId={school.id}
        schoolName={school.school_name}
        slug={slug}
        viewCount={viewCount}
        profileCount={count}
        searchCount={searchCount}
        initialTraces={traces}
        hasTraces={traceCount > 0}
      />

      {/*
        State C "사람 둘러보기" CTA가 스크롤로 연결하는 기존 탐색 영역
        (연도 필터 + 프로필 리스트/빈 상태 + 페이지네이션 + 졸업년도 링크).
        새 라우트를 만들지 않고 같은 페이지 안의 앵커로만 연결한다.
      */}
      <div id="discover" className="space-y-5">
      {/* 졸업년도 필터 */}
      {years.length > 0 && (
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 pb-1 w-max">
            <Link
              href={`/school/${slug}`}
              className={`chip text-sm ${!yearFilter ? 'chip-active' : 'chip-inactive'}`}
            >
              전체
            </Link>
            {years.slice(0, 15).map((year) => (
              <Link
                key={year}
                href={`/school/${slug}?year=${year}`}
                className={`chip text-sm whitespace-nowrap ${yearFilter === year ? 'chip-active' : 'chip-inactive'}`}
              >
                {year}년 졸업
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 프로필 리스트 */}
      {profiles.length > 0 ? (
        <div className="card overflow-hidden divide-y divide-gray-100">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      ) : (
        // 등록 CTA/공유 버튼은 상단 SchoolGrowthPanel에 이미 있어(Phase 2B, State A 중복 정리)
        // 여기서는 간단한 빈 상태 설명만 유지한다 — 중복 CTA를 다시 만들지 않는다.
        <div className="card p-8 text-center space-y-3">
          <p className="text-3xl">🌱</p>
          <p className="font-bold text-gray-800">
            아직 아무도 없어요.
            <br />
            이 학교의 <span className="text-brand-blue">첫 기록</span>을 남겨보세요.
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            이름만 적어도 돼요. 친구 몇 명 남겨두면,
            <br />
            그 친구들이 보고 자기 인스타를 직접 연결해요.
          </p>

          {/* 임계값을 넘었을 때만 사회적 증거(진짜 숫자) 노출 */}
          {totalProfiles >= SOCIAL_PROOF_THRESHOLD && (
            <p className="text-xs text-gray-400 pt-1">
              지금까지 전국에서 {formatNumber(totalProfiles)}명이 동창을 등록했어요.
            </p>
          )}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <Pagination
          current={page}
          total={totalPages}
          baseUrl={`/school/${slug}${yearFilter ? `?year=${yearFilter}` : ''}`}
        />
      )}

      {/* 졸업년도 링크 */}
      {years.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">졸업년도별 보기</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {years.map((year) => (
              <Link
                key={year}
                href={`/school/${slug}/${year}`}
                className="card p-3 text-center hover:border-brand-blue transition-colors group"
              >
                <p className="font-semibold text-sm text-gray-800 group-hover:text-brand-blue">
                  {year}년
                </p>
                <p className="text-xs text-gray-400 mt-0.5">졸업</p>
              </Link>
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  )
}

function Pagination({
  current,
  total,
  baseUrl,
}: {
  current: number
  total: number
  baseUrl: string
}) {
  const sep = baseUrl.includes('?') ? '&' : '?'

  return (
    <div className="flex items-center justify-center gap-2">
      {current > 1 && (
        <Link
          href={`${baseUrl}${sep}page=${current - 1}`}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-brand-blue text-gray-600 hover:text-brand-blue transition-colors"
        >
          이전
        </Link>
      )}
      <span className="text-sm text-gray-500">
        {current} / {total}
      </span>
      {current < total && (
        <Link
          href={`${baseUrl}${sep}page=${current + 1}`}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-brand-blue text-gray-600 hover:text-brand-blue transition-colors"
        >
          다음
        </Link>
      )}
    </div>
  )
}
