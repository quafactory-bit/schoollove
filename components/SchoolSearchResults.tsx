'use client'

// PHASE 7B COMPLETION PATCH — SCHOOL SEARCH CONTINUITY
// /search의 실제 화면. 검색어는 URL이 아니라 sessionStorage(SCHOOL_SEARCH_STORAGE_KEY)로
// 전달된다 — Home/Submit의 SearchBar가 Enter 시 그 키에 정규화된 검색어를 저장하고
// 여기로 이동하면, 마운트 시 그 값을 읽어 searchSchools()(학교 전용, 기존 함수 그대로)만
// 호출한다. 사람 검색 함수는 이 컴포넌트를 포함해 어디에서도 호출하지 않는다.
//
// 이 페이지 자신의 SearchBar는 onFullSearch 콜백을 받아 라우팅 없이 runSearch를 직접
// 호출한다 — buildFullSearchHref()가 항상 고정된 '/search' 경로만 반환하므로, 이미 이
// 페이지에 있는 상태에서 같은 경로로 다시 이동을 시도해도 Next.js가 no-op으로 처리해
// 화면이 갱신되지 않기 때문이다(§6 "/search 내부 SearchBar에서도 다시 검색 가능").
//
// 검색 입력창 자체는 재검색 시에도 항상 빈 채로 시작한다(이전 검색어를 prop으로
// 되돌려주지 않음) — SearchBar의 내부 query state는 마운트 시 initialQuery로 한 번만
// 초기화되고 이후 prop 변화를 동기화하지 않으므로, 비동기로 읽어온 sessionStorage 값을
// 뒤늦게 initialQuery로 넘기면 SSR과 클라이언트 첫 렌더가 어긋나는(hydration mismatch)
// 위험이 있다. 결과 영역은 별도로 마지막 검색어/결과를 그대로 보여주므로 기능 손실은
// 없다(의도적으로 단순화한 부분, 최종 보고서에 기록).
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { searchSchools, type SchoolSearchResult } from '@/lib/api/search'
import SearchBar from './SearchBar'
import { schoolTypeLabel } from '@/lib/utils'
import {
  AUTOCOMPLETE_MIN_QUERY_LENGTH,
  normalizeAutocompleteQuery,
  SCHOOL_SEARCH_STORAGE_KEY,
} from '@/lib/policy/schoolSearchAutocomplete'

type Status = 'idle' | 'loading' | 'ok' | 'error'

export default function SchoolSearchResults() {
  const [status, setStatus] = useState<Status>('idle')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SchoolSearchResult[]>([])

  // "가장 마지막으로 시작된 실행"만 결과를 반영한다. 개발 모드 React Strict Mode가
  // 마운트 useEffect를 두 번 실행해도 앞선 응답이 최신 검색 결과를 덮어쓰지 않는다.
  const executionRef = useRef(0)

  const runSearch = useCallback((raw: string) => {
    const normalized = normalizeAutocompleteQuery(raw)
    if (normalized.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      // 두 글자 미만(빈 문자열 포함)은 "검색어 없음" 안내와 동일하게 취급한다 — 저장
      // 단계(SearchBar)에서 이미 2글자 미만을 걸러 sessionStorage에 쓰지 않으므로, 정상
      // 사용 흐름에서는 이 분기에 도달하지 않는다. 방어적으로만 남겨둔다.
      executionRef.current += 1
      setStatus('idle')
      setQuery('')
      setResults([])
      return
    }

    const executionId = ++executionRef.current
    setQuery(normalized)
    setStatus('loading')

    searchSchools(normalized).then(
      (schools) => {
        if (executionRef.current !== executionId) return
        setResults(schools)
        setStatus('ok')
      },
      () => {
        if (executionRef.current !== executionId) return
        setStatus('error')
      }
    )
  }, [])

  useEffect(() => {
    let saved: string | null = null
    try {
      saved = sessionStorage.getItem(SCHOOL_SEARCH_STORAGE_KEY)
    } catch {
      saved = null
    }
    if (saved) runSearch(saved)
  }, [runSearch])

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <SearchBar variant="search" onFullSearch={runSearch} />
      <p className="mt-3 rounded-lg bg-white px-4 py-3 text-xs leading-5 text-gray-500">
        학교 기본 정보만 검색합니다. 개인 이름 검색과 공개 명단은 성인 본인 인증 기반 구조로 전환하는 동안 제공하지 않습니다.
      </p>

      {status === 'idle' && (
        <div className="mt-16 text-center">
          <p className="text-sm text-gray-500">학교 이름을 검색해보세요.</p>
          <p className="mt-1 text-xs text-gray-400">
            학교 이름과 지역 등 기본 정보를 확인할 수 있어요.
          </p>
        </div>
      )}

      {status === 'loading' && (
        <p className="mt-16 text-center text-sm text-gray-400">검색하는 중...</p>
      )}

      {status === 'error' && (
        <div className="mt-16 text-center">
          <p className="text-sm text-gray-500">지금은 검색 결과를 불러올 수 없어요.</p>
          <button
            type="button"
            onClick={() => runSearch(query)}
            className="mt-3 text-sm font-medium text-schoollove-text hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {status === 'ok' && results.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-sm font-medium text-gray-600">&apos;{query}&apos; 검색 결과가 없어요.</p>
          <p className="mt-1 text-xs text-gray-400">
            학교명과 지역을 다시 확인해 주세요.
          </p>
        </div>
      )}

      {status === 'ok' && results.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-gray-500">
            &apos;{query}&apos; 검색 결과 {results.length}건
          </h2>
          <div className="space-y-2">
            {results.map((school) => (
              <Link
                key={school.id}
                href={`/school/${school.slug}`}
                className="flex items-center justify-between rounded-xl border border-schoollove-border bg-white px-4 py-3.5 hover:border-schoollove-electric-blue hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏫</span>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{school.school_name}</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {school.sido} {school.sigungu} · {schoolTypeLabel(school.school_type)}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-gray-400">학교 정보 보기</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
