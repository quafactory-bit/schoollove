'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSchoolSearch } from '@/lib/hooks/useSchoolSearch'
import { schoolTypeLabel } from '@/lib/utils'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isFetching } = useSchoolSearch(query)

  const hasResults =
    query.length >= 2 &&
    ((data?.schools?.length ?? 0) > 0 || (data?.profiles?.length ?? 0) > 0)

  const showEmpty = query.length >= 2 && !isFetching && !hasResults

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim().length < 2) return
    setOpen(false)
    router.push(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="학교 이름을 검색하세요"
            className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* 드롭다운 */}
      {open && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">

          {isFetching && (
            <div className="px-4 py-3 text-sm text-gray-400">검색 중...</div>
          )}

          {!isFetching && showEmpty && (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-gray-500 mb-1">검색 결과가 없습니다.</p>
              <p className="text-xs text-gray-400 mb-3">
                찾는 학교가 없다면 내 공개 인스타그램을 먼저 등록해보세요.
              </p>
              <div className="flex gap-2 justify-center">
                <Link href="/submit" onClick={() => setOpen(false)}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg">
                  내 인스타 등록하기
                </Link>
              </div>
            </div>
          )}

          {/* 학교 결과 */}
          {!isFetching && (data?.schools?.length ?? 0) > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100">
                학교
              </div>
              {data!.schools.map((school) => (
                <Link
                  key={school.id}
                  href={`/school/${school.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🏫</span>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{school.school_name}</div>
                      <div className="text-xs text-gray-400">{school.sido} {school.sigungu} · {schoolTypeLabel(school.school_type)}</div>
                    </div>
                  </div>
                  {school.profile_count > 0 && (
                    <span className="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                      {school.profile_count}명
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {/* 등록된 동문 결과 */}
          {!isFetching && (data?.profiles?.length ?? 0) > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100 border-t border-t-gray-200">
                등록된 동문
              </div>
              {data!.profiles.map((profile) => (
                <Link
                  key={profile.id}
                  href={`/school/${profile.school_slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">👤</span>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{profile.nickname}</div>
                      <div className="text-xs text-gray-400">
                        {profile.school_name} · {profile.graduation_year}년 졸업
                        {profile.instagram_id && (
                          <span className="ml-1 text-blue-400">@{profile.instagram_id}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* 전체 결과 보기 */}
          {hasResults && (
            <button
              onClick={handleSubmit}
              className="w-full px-4 py-3 text-xs text-blue-600 hover:bg-blue-50 transition border-t border-gray-100 text-center font-medium"
            >
              '{query}' 전체 결과 보기 →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
