import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getProfilesBySchool, getClassesBySchoolYear, getYearProfileCount } from '@/lib/api/profiles'
import ProfileCard from '@/components/ProfileCard'
import { getYearPageMetadata } from '@/lib/seo'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { formatNumber } from '@/lib/utils'

// 프로필 3명 이상인 페이지만 구글에 index. 미만은 noindex (thin content 방지)
const INDEX_THRESHOLD = 3

interface PageProps {
  params: Promise<{ slug: string; year: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, year } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return { title: '학교를 찾을 수 없습니다', robots: { index: false, follow: false } }

  const meta = getYearPageMetadata(school, parseInt(year))

  const count = await getYearProfileCount(school.id, parseInt(year))

  return {
    ...meta,
    robots: count >= INDEX_THRESHOLD
      ? { index: true, follow: true }
      : { index: false, follow: true },
  }
}

export default async function YearPage({ params, searchParams }: PageProps) {
  const { slug, year: yearStr } = await params
  const sp = await searchParams
  const year = parseInt(yearStr)
  const page = sp.page ? parseInt(sp.page) : 1

  if (isNaN(year) || year < 1980 || year > new Date().getFullYear() + 10) notFound()

  const school = await getSchoolBySlug(slug)
  if (!school) notFound()

  const [{ data: profiles, count }, classes] = await Promise.all([
    getProfilesBySchool(school.id, page, year),
    getClassesBySchoolYear(school.id, year),
  ])

  const totalPages = Math.ceil(count / 20)

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

      {/* 헤더 */}
      <div className="card p-5 space-y-2">
        <h1 className="text-xl font-black text-gray-900">
          {school.school_name}
          <span className="text-brand-blue ml-2">{year}년</span>
        </h1>
        <p className="text-sm text-gray-500">
          {SCHOOL_TYPE_LABELS[school.school_type]} · 졸업(예정) · 총 {formatNumber(count)}명
        </p>
        <Link href="/submit" className="btn-primary inline-block text-sm">
          등록하기
        </Link>
      </div>

      {/* 반별 바로가기 (초/중/고만) */}
      {classes.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">반별 보기</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {classes.map(({ grade, class_number }) => (
              <Link
                key={`${grade}-${class_number}`}
                href={`/school/${slug}/${year}/${grade}-${class_number}`}
                className="card p-3 text-center hover:border-brand-blue transition-colors group"
              >
                <p className="font-semibold text-sm text-gray-800 group-hover:text-brand-blue">
                  {grade}학년 {class_number}반
                </p>
              </Link>
            ))}
          </div>
        </section>
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
          <p className="font-semibold text-gray-700">{year}년 등록된 사람이 없어요</p>
          <Link href="/submit" className="btn-primary inline-block text-sm mt-2">
            첫 번째로 등록하기
          </Link>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={`/school/${slug}/${year}?page=${page - 1}`} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-brand-blue text-gray-600">이전</Link>
          )}
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={`/school/${slug}/${year}?page=${page + 1}`} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-brand-blue text-gray-600">다음</Link>
          )}
        </div>
      )}
    </div>
  )
}
