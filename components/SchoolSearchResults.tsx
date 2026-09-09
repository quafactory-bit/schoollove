'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { searchSchools, type SchoolSearchResult } from '@/lib/api/search'
import SearchBar from './SearchBar'
import { schoolTypeLabel } from '@/lib/utils'
import { recallSchoolQuery } from '@/lib/policy/schoolJourney'
import {
  AUTOCOMPLETE_MIN_QUERY_LENGTH,
  normalizeAutocompleteQuery,
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
    const saved = recallSchoolQuery()
    if (saved) runSearch(saved)
    return () => { executionRef.current += 1 }
  }, [runSearch])

  return (
    <main className="growth-journey mx-auto max-w-2xl px-5 py-8">
      <Link href="/" className="schoollove-focus inline-flex min-h-11 items-center font-bold">스쿨러브아이 ↗</Link>
      <h1 className="mb-5 mt-3 text-3xl font-bold">우리 학교 찾기</h1>
      <SearchBar variant="search" initialQuery={query} onFullSearch={runSearch} />
      <p className="mt-3 rounded-lg bg-white px-4 py-3 text-xs leading-5 text-gray-500">
        학교 이름과 지역 등 공개 학교 정보만 찾아요. 사람 찾기는 별도 승인된 제한 베타에서만 이용할 수 있어요.
      </p>

      {status === 'idle' && (
        <div className="mt-16 text-center">
          <p className="text-sm text-gray-500">학교 이름을 검색해보세요.</p>
          <p className="mt-1 text-xs text-gray-400">
            다른 탭에서 왔거나 임시 검색어가 사라졌다면 이곳에 다시 입력해 주세요.
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
                <span className="shrink-0 text-xs text-gray-600">학교 보기 →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
