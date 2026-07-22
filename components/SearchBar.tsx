'use client'

// School Search Autocomplete — Phase 4C (docs/decisions/2026-07-17-school-search-autocomplete.md)
// 홈과 /search가 함께 쓰는 공용 학교 검색 자동완성 컴포넌트. 두 화면의 기존 입력창 모양은
// variant prop으로만 갈라두고(레이아웃/문구/활동 피드는 무수정), 검색 상태·디바운스·키보드
// 이동·URL 생성 로직은 전부 lib/policy/schoolSearchAutocomplete.ts + lib/hooks/useSchoolAutocomplete.ts로
// 위임한다 — 이 컴포넌트는 그 결과를 렌더링/이벤트에 연결하는 역할만 한다.

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useSchoolAutocomplete } from '@/lib/hooks/useSchoolAutocomplete'
import { schoolTypeLabel } from '@/lib/utils'
import {
  buildFullSearchHref,
  buildSchoolHubHref,
  moveActiveIndex,
  normalizeAutocompleteQuery,
  resolveEnterAction,
  SCHOOL_SEARCH_STORAGE_KEY,
} from '@/lib/policy/schoolSearchAutocomplete'

interface SchoolSearchAutocompleteProps {
  variant: 'home' | 'search'
  initialQuery?: string
  className?: string
  // PHASE 7B COMPLETION PATCH — /search 페이지가 자기 자신의 SearchBar에서도 다시 검색할
  // 수 있어야 하는데(§6), buildFullSearchHref()는 항상 '/search'만 반환하므로 이미 /search에
  // 있는 상태에서 router.push('/search')를 호출해도 동일 URL이라 Next.js가 사실상 no-op으로
  // 처리해 화면이 갱신되지 않는다. onFullSearch가 주어지면 라우팅 대신 이 콜백을 직접 호출해
  // 호출부(SchoolSearchResults)가 로컬 state로 즉시 재검색하게 한다. Home/Submit처럼 이
  // prop이 없는 경우는 기존과 동일하게 router.push로 이동한다.
  onFullSearch?: (normalizedQuery: string) => void
}

export default function SearchBar({ variant, initialQuery = '', className, onFullSearch }: SchoolSearchAutocompleteProps) {
  const [query, setQuery] = useState(initialQuery)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const router = useRouter()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const { status, results } = useSchoolAutocomplete(query)

  // 검색어가 바뀔 때마다 이전 검색의 활성 후보 인덱스를 들고 있지 않는다.
  useEffect(() => {
    setActiveIndex(-1)
  }, [query])

  // 2글자 미만이면 드롭다운을 숨긴다. 2글자 이상으로 타이핑 중이면 열어 둔다.
  useEffect(() => {
    setOpen(query.trim().length >= 2)
  }, [query])

  // 바깥 영역 클릭 시 드롭다운을 닫는다.
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function navigateToSchool(slug: string) {
    setOpen(false)
    router.push(buildSchoolHubHref(slug))
  }

  function navigateToFullSearch(q: string) {
    setOpen(false)
    const normalized = normalizeAutocompleteQuery(q)
    // 검색어는 URL이 아니라 sessionStorage로만 전달한다(PHASE 7B COMPLETION PATCH) — 브라우저
    // 히스토리·서버 로그에 남지 않는다. 프라이빗 모드 등에서 sessionStorage 접근이 막혀도
    // 검색 자체(라우팅/콜백 호출)는 계속 진행되어야 하므로 실패를 조용히 무시한다.
    try {
      sessionStorage.setItem(SCHOOL_SEARCH_STORAGE_KEY, normalized)
    } catch {
      // sessionStorage 접근 실패는 무시 — 검색 흐름을 막지 않는다.
    }
    if (onFullSearch) {
      onFullSearch(normalized)
    } else {
      router.push(buildFullSearchHref(normalized))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // 폼 제출(Enter/모바일 검색 버튼)은 학교 전체 검색으로 보낸다 — 검색어는 URL에 붙이지
    // 않고 sessionStorage로만 전달한다(PHASE 7B COMPLETION PATCH). 후보 선택은 키보드
    // Enter(handleKeyDown)와 클릭에서만 처리한다.
    const action = resolveEnterAction(query, -1, [])
    if (action.type === 'search-all') navigateToFullSearch(query)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (!open || results.length === 0) return
      e.preventDefault()
      setActiveIndex((prev) => moveActiveIndex(prev, results.length, 'down'))
      return
    }
    if (e.key === 'ArrowUp') {
      if (!open || results.length === 0) return
      e.preventDefault()
      setActiveIndex((prev) => moveActiveIndex(prev, results.length, 'up'))
      return
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
      }
      return
    }
    if (e.key === 'Enter') {
      const action = resolveEnterAction(
        query,
        activeIndex,
        results.map((r) => r.slug)
      )
      if (action.type === 'noop') return
      e.preventDefault()
      if (action.type === 'navigate-school') {
        navigateToSchool(results[activeIndex].slug)
      } else {
        navigateToFullSearch(query)
      }
    }
  }

  function handleFocus() {
    // 다시 클릭했을 때 유효한 결과가 이미 있으면 드롭다운을 다시 연다.
    if (query.trim().length >= 2 && results.length > 0) {
      setOpen(true)
    }
  }

  const showDropdown = open && query.trim().length >= 2
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
  const showLoading = status === 'idle' || status === 'loading'

  return (
    <div ref={wrapperRef} className={className ? `relative ${className}` : 'relative'}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          {variant === 'home' ? (
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          ) : (
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
          )}
          <input
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            name="q"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="학교 이름을 검색하세요"
            autoComplete="off"
            className={
              variant === 'home'
                ? 'w-full rounded-full border border-schoollove-border bg-white py-2.5 pl-10 pr-4 text-[14px] outline-none transition focus:border-schoollove-electric-blue focus:ring-2 focus:ring-schoollove-electric-blue/15'
                : 'w-full rounded-xl border border-schoollove-border bg-white py-3.5 pl-11 pr-4 text-sm focus:border-schoollove-electric-blue focus:outline-none focus:ring-2 focus:ring-schoollove-electric-blue/15'
            }
          />
        </div>
      </form>

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-x-hidden overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          {showLoading && (
            <li className="px-4 py-3 text-sm text-gray-400" role="presentation">
              학교를 찾는 중...
            </li>
          )}

          {status === 'error' && (
            <li className="px-4 py-3 text-sm text-gray-400" role="presentation">
              지금은 자동완성을 불러올 수 없어요. Enter를 누르면 검색할 수 있어요.
            </li>
          )}

          {status === 'ok' && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500" role="presentation">
              일치하는 학교를 찾지 못했어요.{' '}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => navigateToFullSearch(query)}
                className="font-medium text-schoollove-text hover:underline"
              >
                '{query.trim()}' 전체 검색
              </button>
            </li>
          )}

          {status === 'ok' &&
            results.map((school, index) => (
              <li
                key={school.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(e) => {
                  // outside-click/blur보다 먼저 처리되도록 click이 아닌 mousedown에서 이동한다.
                  e.preventDefault()
                  navigateToSchool(school.slug)
                }}
                className={
                  'flex min-w-0 cursor-pointer items-center justify-between gap-3 border-b border-schoollove-border px-4 py-3 last:border-0 hover:bg-schoollove-surface-subtle ' +
                  (index === activeIndex ? 'bg-schoollove-surface-pressed' : '')
                }
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-800">{school.school_name}</div>
                  <div className="truncate text-xs text-gray-400">
                    {school.sido} {school.sigungu} · {schoolTypeLabel(school.school_type)}
                  </div>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
