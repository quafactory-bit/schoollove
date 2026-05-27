import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, MapPin, Calendar, ChevronRight } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getProfilesBySchool, getGraduationYearsBySchool } from '@/lib/api/profiles'
import ProfileCard from '@/components/ProfileCard'
import { getSchoolPageMetadata } from '@/lib/seo'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { formatNumber } from '@/lib/utils'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ year?: string; page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return { title: '학교를 찾을 수 없습니다' }
  return getSchoolPageMetadata(school)
}

export default async function SchoolPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = await searchParams
  const yearFilter = sp.year ? parseInt(sp.year) : undefined
  const page = sp.page ? parseInt(sp.page) : 1

  const school = await getSchoolBySlug(slug)
  if (!school) notFound()

  const [{ data: profiles, count }, years] = await Promise.all([
    getProfilesBySchool(school.id, page, yearFilter),
    getGraduationYearsBySchool(school.id),
  ])

  const totalPages = Math.ceil(count / 20)

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
      <div className="card p-5 space-y-3">
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

        <Link href={`/submit?school=${slug}`} className="btn-primary inline-block text-sm text-center w-full sm:w-auto">
  등록하기
</Link>
      </div>

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
        <div className="card p-10 text-center space-y-2">
          <p className="text-2xl">📭</p>
          <p className="font-semibold text-gray-700">아직 등록된 사람이 없어요</p>
          <p className="text-sm text-gray-500">첫 번째로 등록해보세요!</p>
          <Link href={`/submit?school=${slug}`} className="btn-primary inline-block text-sm mt-2">
  지금 등록하기
</Link>
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
