'use client'

// PHASE 7B — Year Hub 이름 검색 + 전체 명단.
// docs/design-package-v1.0/06-people-discovery.md A3: 로드된 명단을 클라이언트에서
// 실시간 필터한다. URL query parameter를 쓰지 않고(검색어는 이 컴포넌트의 로컬 state에만
// 존재), 서버/검색 로그 어디에도 기록하지 않는다 — fetch/API 호출 자체가 없다.
import { useMemo, useState } from 'react'
import ProfileCard from './ProfileCard'
import { filterProfilesByNickname } from '@/lib/policy/yearHub'
import type { YearHubPersonProfile } from '@/lib/api/profiles'

interface Props {
  profiles: YearHubPersonProfile[]
}

export default function YearPeopleSearch({ profiles }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => filterProfilesByNickname(profiles, query), [profiles, query])

  return (
    <section className="space-y-3">
      <div>
        <label htmlFor="year-people-search" className="mb-2 block text-sm font-semibold text-gray-800">
          동기 이름으로 찾기
        </label>
        <div className="relative">
          <input
            id="year-people-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름을 입력하세요"
            aria-label="동기 이름으로 찾기"
            autoComplete="off"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="검색어 지우기"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {query.trim() && (
        <p className="text-xs text-gray-400">
          '{query.trim()}' 검색 결과 {filtered.length}명
        </p>
      )}

      {filtered.length > 0 ? (
        <div className="card overflow-hidden divide-y divide-gray-100">
          {filtered.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center space-y-1">
          <p className="text-2xl">🔍</p>
          <p className="text-sm text-gray-500">일치하는 이름을 찾지 못했어요.</p>
        </div>
      )}
    </section>
  )
}
