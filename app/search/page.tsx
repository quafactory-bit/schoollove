import { Suspense } from 'react'
import Link from 'next/link'
import { searchAll } from '@/lib/api/search'
import { schoolTypeLabel } from '@/lib/utils'
import type { Metadata } from 'next'

interface Props {
  searchParams: Promise<{ q?: string }>
}
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = resolvedParams.q?.trim() || ''
  return {
    title: q ? `'${q}' 검색 결과 | 스쿨러브아이` : '검색 | 스쿨러브아이',
    robots: { index: false },
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const resolvedParams = await searchParams
  const q = resolvedParams.q?.trim() || ''
  const { schools, profiles } = q.length >= 2
    ? await searchAll(q)
    : { schools: [], profiles: [] }

  const totalCount = schools.length + profiles.length

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* 검색창 */}
        <form method="get" action="/search" className="mb-6">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              name="q"
              type="text"
              defaultValue={q}
              placeholder="학교 이름을 검색하세요"
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              autoComplete="off"
            />
          </div>
        </form>

        {/* 검색어 없음 */}
        {!q && (
          <p className="text-center text-gray-400 text-sm mt-16">검색어를 입력해주세요.</p>
        )}

        {/* 검색어 너무 짧음 */}
        {q && q.length < 2 && (
          <p className="text-center text-gray-400 text-sm mt-16">두 글자 이상 입력해주세요.</p>
        )}

        {/* 검색 결과 */}
        {q.length >= 2 && (
          <>
            {/* 탭 요약 */}
            <div className="flex gap-4 mb-6 border-b border-gray-200 pb-2">
              <span className="text-sm font-semibold text-blue-600">
                전체 ({totalCount})
              </span>
              <span className="text-sm text-gray-400">
                학교 ({schools.length})
              </span>
              <span className="text-sm text-gray-400">
                등록된 동문 ({profiles.length})
              </span>
            </div>

            {/* 결과 없음 */}
            {totalCount === 0 && (
              <div className="text-center py-16">
                <p className="text-gray-600 font-medium mb-1">검색 결과가 없습니다.</p>
                <p className="text-sm text-gray-400 mb-6">
                  찾는 학교가 없다면 학교 등록을 요청하거나,<br />
                  내 공개 인스타그램을 먼저 등록해보세요.
                </p>
                <div className="flex gap-3 justify-center">
                  <Link href="/submit"
                    className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg">
                    내 인스타 등록하기
                  </Link>
                </div>
              </div>
            )}

            {/* 학교 검색 결과 */}
            {schools.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-semibold text-gray-500 mb-3">학교 검색 결과</h2>
                <div className="space-y-2">
                  {schools.map((school) => (
                    <Link
                      key={school.id}
                      href={`/school/${school.slug}`}
                      className="flex items-center justify-between bg-white rounded-xl px-4 py-3.5 border border-gray-100 hover:border-blue-300 hover:shadow-sm transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🏫</span>
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{school.school_name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {school.sido} {school.sigungu} · {schoolTypeLabel(school.school_type)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        {school.profile_count > 0 ? (
                          <span className="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded-full">
                            동문 {school.profile_count}명
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">등록 없음</span>
                        )}
                        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-gray-300">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* 등록된 동문 검색 결과 */}
            {profiles.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-500">등록된 동문</h2>
                  <span className="text-xs text-gray-400">공개 등록 프로필</span>
                </div>
                <div className="space-y-2">
                  {profiles.map((profile) => (
                    <Link
                      key={profile.id}
                      href={`/school/${profile.school_slug}`}
                      className="flex items-center justify-between bg-white rounded-xl px-4 py-3.5 border border-gray-100 hover:border-blue-300 hover:shadow-sm transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-500 shrink-0">
                          {profile.nickname.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{profile.nickname}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {profile.school_name} · {profile.graduation_year}년 졸업
                          </div>
                          {profile.instagram_id && (
                            <div className="text-xs text-blue-400 mt-0.5">@{profile.instagram_id}</div>
                          )}
                        </div>
                      </div>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-gray-300 shrink-0">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </Link>
                  ))}
                </div>

                <p className="text-xs text-gray-300 text-center mt-4">
                  공개 등록된 인스타그램 프로필만 표시됩니다.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
