import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { headers } from 'next/headers'
import { Users, MapPin, Calendar, ChevronRight } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getProfilesBySchool, getGraduationYearsBySchool, getSchoolProfileCount, getTotalProfileCount } from '@/lib/api/profiles'
import { incrSchoolView, getSchoolView } from '@/lib/api/views'
import { getTracesBySchool, getTraceCountBySchool } from '@/lib/api/traces'
import { getSchoolSearchCount } from '@/lib/api/searches'
import ProfileCard from '@/components/ProfileCard'
import ShareButton from '@/components/ShareButton'
import SchoolWarmth from '@/components/SchoolWarmth'
import { getSchoolPageMetadata } from '@/lib/seo'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { formatNumber } from '@/lib/utils'
import { schoolTypeImage } from '@/lib/images'

// 프로필 3명 이상인 학교만 구글에 index. 미만은 noindex (thin content 방지)
const INDEX_THRESHOLD = 3

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
    robots: count >= INDEX_THRESHOLD
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

  const [{ data: profiles, count }, years, totalProfiles, viewCount, traces, traceCount, searchCount] = await Promise.all([
    getProfilesBySchool(school.id, page, yearFilter),
    getGraduationYearsBySchool(school.id),
    getTotalProfileCount(),
    isBot ? getSchoolView(school.id) : incrSchoolView(school.id),
    getTracesBySchool(school.id),
    getTraceCountBySchool(school.id),
    getSchoolSearchCount(school.school_name, school.sido),
  ])

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
        <Link href={`/search?q=${encodeURIComponent(school.sido)}`} className="hover:text-gray-600">
          {school.sido}
        </Link>
        <ChevronRight size={12} />
        <span className="text-gray-600 font-medium">{school.school_name}</span>
      </nav>

      {/* 학교 헤더 */}
      <div className="card overflow-hidden">
        {/* 타입별 실사 배너 */}
        <div className="relative aspect-[16/9] w-full">
          <Image
            src={schoolTypeImage(school.school_type)}
            alt=""
            fill
            sizes="(max-width: 600px) 100vw, 600px"
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        </div>

        <div className="p-5 space-y-3">
          <div>
            <h1 className="text-xl font-black text-gray-900">{school.school_name}</h1>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
              <MapPin size={12} />
              <span>{school.sido} {school.sigungu}</span>
              <span className="mx-1 text-gray-300">·</span>
              <span>{SCHOOL_TYPE_LABELS[school.school_type]}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Users size={15} className="text-brand-blue" />
              <span className="font-semibold text-gray-900">{formatNumber(count)}</span>
              <span className="text-gray-500">명 등록</span>
            </div>
            {years.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Calendar size={15} className="text-brand-blue" />
                <span className="text-gray-500">{years[years.length - 1]}~{years[0]}년</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Link
              href={`/submit?school=${slug}`}
              className="btn-primary inline-block text-sm text-center flex-1 sm:flex-none"
            >
              등록하기
            </Link>
            <ShareButton
              text={shareText}
              url={shareUrl}
              label="공유"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-brand-blue hover:text-brand-blue transition-colors"
            />
          </div>
        </div>
      </div>

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

          <div className="flex flex-col gap-2 pt-2">
            <Link href={`/submit?school=${slug}`} className="btn-primary inline-block text-sm">
              친구 이름 남기기
            </Link>
            <ShareButton
              text={shareText}
              url={shareUrl}
              label="친구들에게 이 페이지 알리기"
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:border-brand-blue hover:text-brand-blue transition-colors"
            />
          </div>
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
