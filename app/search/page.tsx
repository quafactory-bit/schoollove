import { Suspense } from 'react'
import type { Metadata } from 'next'
import { searchSchools } from '@/lib/api/schools'
import { searchProfiles } from '@/lib/api/profiles'
import SearchBar from '@/components/SearchBar'
import SchoolCard from '@/components/SchoolCard'
import ProfileCard from '@/components/ProfileCard'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import type { SchoolType } from '@/types/school'

interface PageProps {
  searchParams: Promise<{ q?: string; type?: SchoolType }>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams
  const q = params.q || ''
  return {
    title: q ? `"${q}" 검색 결과` : '학교 검색',
    description: q
      ? `"${q}" 검색 결과 — 스쿨러브아이`
      : '전국 초·중·고·대학교를 검색하세요',
    robots: { index: false },
  }
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams
  const query = params.q?.trim() || ''
  const typeFilter = params.type

  const [schools, profiles] = query
    ? await Promise.all([searchSchools(query, 20), searchProfiles(query, 20)])
    : [[], []]

  const filteredSchools = typeFilter
    ? schools.filter((s) => s.school_type === typeFilter)
    : schools

  const totalCount = filteredSchools.length + profiles.length

  return (
    <div className="page-container space-y-6">
      {/* 검색창 */}
      <SearchBar
        size="md"
        placeholder="학교명 또는 이름 검색"
        autoFocus={!query}
      />

      {query && (
        <>
          {/* 검색어 + 결과 수 */}
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-gray-700">
              <span className="text-brand-blue">"{query}"</span> 검색 결과
            </h1>
            <span className="text-xs text-gray-400">총 {totalCount}건</span>
          </div>

          {/* 학교 타입 필터 */}
          {schools.length > 0 && (
            <TypeFilterChips currentType={typeFilter} query={query} />
          )}

          {/* 학교 결과 */}
          {filteredSchools.length > 0 && (
            <section className="space-y-2">
              <h2 className="section-title">
                학교 검색 결과 ({filteredSchools.length})
              </h2>
              <div className="space-y-2">
                {filteredSchools.map((school) => (
                  <SchoolCard key={school.id} school={school} />
                ))}
              </div>
            </section>
          )}

          {/* 사람 결과 */}
          {profiles.length > 0 && (
            <section className="space-y-2">
              <h2 className="section-title">사람 검색 결과 ({profiles.length})</h2>
              <div className="card overflow-hidden divide-y divide-gray-100">
                {profiles.map((profile) => (
                  <ProfileCard key={profile.id} profile={profile} showSchool />
                ))}
              </div>
            </section>
          )}

          {/* 결과 없음 */}
          {totalCount === 0 && (
            <div className="card p-10 text-center space-y-2">
              <p className="text-2xl">🔍</p>
              <p className="font-semibold text-gray-700">검색 결과가 없습니다</p>
              <p className="text-sm text-gray-500">
                "{query}"와 일치하는 학교나 사람이 없어요
              </p>
            </div>
          )}
        </>
      )}

      {/* 검색어 없을 때 — 학교 타입 네비게이션 */}
      {!query && (
        <div className="space-y-4">
          <h2 className="section-title">학교 유형으로 찾기</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(Object.entries(SCHOOL_TYPE_LABELS) as [SchoolType, string][]).map(([type, label]) => {
              const emoji: Record<SchoolType, string> = {
                elementary: '🏫',
                middle: '📖',
                high: '🎓',
                university: '🏛',
                college: '📚',
              }
              return (
                <a
                  key={type}
                  href={`/search?type=${type}`}
                  className="card p-4 text-center hover:border-brand-blue transition-colors group"
                >
                  <span className="text-2xl">{emoji[type]}</span>
                  <p className="mt-2 font-semibold text-sm text-gray-800 group-hover:text-brand-blue transition-colors">
                    {label}
                  </p>
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TypeFilterChips({
  currentType,
  query,
}: {
  currentType?: SchoolType
  query: string
}) {
  const baseUrl = `/search?q=${encodeURIComponent(query)}`
  const types = Object.entries(SCHOOL_TYPE_LABELS) as [SchoolType, string][]

  return (
    <div className="flex gap-2 flex-wrap">
      <a
        href={baseUrl}
        className={`chip ${!currentType ? 'chip-active' : 'chip-inactive'}`}
      >
        전체
      </a>
      {types.map(([type, label]) => (
        <a
          key={type}
          href={`${baseUrl}&type=${type}`}
          className={`chip ${currentType === type ? 'chip-active' : 'chip-inactive'}`}
        >
          {label}
        </a>
      ))}
    </div>
  )
}
