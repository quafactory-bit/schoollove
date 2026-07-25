import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getSchoolBySlug } from '@/lib/api/schools'
import { getProfilesByClass, getClassProfileCount } from '@/lib/api/profiles'
import ProfileCard from '@/components/ProfileCard'
import { getClassPageMetadata } from '@/lib/seo'
import { isClassPageIndexable } from '@/lib/policy/seoIndexing'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { parseClassFromUrl, formatNumber } from '@/lib/utils'
import { buildSubmitContextHref } from '@/app/submit/prefill'

interface PageProps {
  params: Promise<{ slug: string; year: string; class: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, year, class: classStr } = await params
  const school = await getSchoolBySlug(slug)
  if (!school) return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } }
  const parsed = parseClassFromUrl(classStr)
  if (!parsed) return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } }

  const meta = getClassPageMetadata(school, parseInt(year), parsed.grade, parsed.classNumber)

  const count = await getClassProfileCount(
    school.id, parseInt(year), parsed.grade, parsed.classNumber
  )

  return {
    ...meta,
    robots: isClassPageIndexable(count)
      ? { index: true, follow: true }
      : { index: false, follow: true },
  }
}

export default async function ClassPage({ params, searchParams }: PageProps) {
  const { slug, year: yearStr, class: classStr } = await params
  const sp = await searchParams
  const year = parseInt(yearStr)
  const page = sp.page ? parseInt(sp.page) : 1

  const parsed = parseClassFromUrl(classStr)
  if (!parsed || isNaN(year)) notFound()

  const { grade, classNumber } = parsed

  const school = await getSchoolBySlug(slug)
  if (!school) notFound()

  const { data: profiles, count } = await getProfilesByClass(
    school.id, year, grade, classNumber, page
  )

  const totalPages = Math.ceil(count / 20)
  const submitHref = buildSubmitContextHref({
    school: slug,
    year,
    grade,
    classNumber,
  })

  return (
    <div className="page-container space-y-5">
      {/* 브레드크럼 */}
      <nav className="flex items-center gap-1 text-xs text-gray-400 flex-wrap">
        <Link href="/" className="hover:text-gray-600">홈</Link>
        <ChevronRight size={12} />
        <Link href={`/school/${slug}`} className="hover:text-gray-600">{school.school_name}</Link>
        <ChevronRight size={12} />
        <Link href={`/school/${slug}/${year}`} className="hover:text-gray-600">{year}년</Link>
        <ChevronRight size={12} />
        <span className="text-gray-600 font-medium">{grade}학년 {classNumber}반</span>
      </nav>

      {/* 헤더 */}
      <div className="card p-5 space-y-2">
        <h1 className="text-xl font-bold text-gray-900">
          {school.school_name}
        </h1>
        <p className="text-base font-bold text-brand-blue">
          {year}년 {grade}학년 {classNumber}반
        </p>
        <p className="text-sm text-gray-500">{SCHOOL_TYPE_LABELS[school.school_type]}</p>
        <p className="text-base font-semibold text-gray-900">
          이 반에 {formatNumber(count)}명이 등록했어요
        </p>
      </div>

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
          <p className="font-semibold text-gray-700">
            아직 등록된 사람이 없어요
          </p>
          <p className="text-sm text-gray-500">첫 번째로 등록해보세요!</p>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link href={`/school/${slug}/${year}/${classStr}?page=${page - 1}`} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-brand-blue text-gray-600">이전</Link>
          )}
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={`/school/${slug}/${year}/${classStr}?page=${page + 1}`} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-brand-blue text-gray-600">다음</Link>
          )}
        </div>
      )}

      {/* 등록은 현재 사람 목록 또는 빈 상태를 확인한 뒤 이어지는 기여 행동이다. */}
      <section className="space-y-3 border-t border-gray-200 pt-5">
        <div>
          <h2 className="section-title">같은 반 친구가 더 있나요?</h2>
          <p className="mt-1 text-sm text-gray-500">이 반의 사람을 남겨 발견을 이어주세요.</p>
        </div>
        <Link href={submitHref} className="btn-primary inline-flex min-h-11 items-center text-sm">
          {count === 0 ? '이 반의 첫 번째 이름 남기기' : '같은 반 친구 등록하기'}
        </Link>
      </section>

      {/* 다른 반 바로가기 */}
      <div className="flex items-center gap-3 text-sm">
        <Link href={`/school/${slug}/${year}`} className="text-brand-blue hover:underline text-sm">
          ← {year}년 전체 보기
        </Link>
      </div>
    </div>
  )
}
