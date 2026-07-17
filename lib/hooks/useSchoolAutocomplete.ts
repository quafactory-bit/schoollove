'use client'

// School Search Autocomplete — Phase 4C
// docs/decisions/2026-07-17-school-search-autocomplete.md
// 홈/검색 화면이 공용으로 쓰는 학교 자동완성 훅. 디바운스·오래된 응답 무시는
// lib/policy/schoolSearchAutocomplete.ts의 순수 컨트롤러가 전담하고, 이 훅은 그 결과를
// React 상태에 반영만 하는 얇은 wrapper다. 기존 lib/hooks/useSchoolSearch.ts(학교+동문
// 통합 검색, SubmitForm 전용)와는 별개 — 그 훅의 계약은 건드리지 않는다.

import { useEffect, useRef, useState } from 'react'
import { searchSchoolsForAutocomplete, type SchoolAutocompleteResult } from '@/lib/api/search'
import { createDebouncedAutocompleteSearcher } from '@/lib/policy/schoolSearchAutocomplete'

export type SchoolAutocompleteStatus = 'idle' | 'loading' | 'ok' | 'error'

export interface SchoolAutocompleteState {
  status: SchoolAutocompleteStatus
  results: SchoolAutocompleteResult[]
}

export function useSchoolAutocomplete(query: string): SchoolAutocompleteState {
  const [state, setState] = useState<SchoolAutocompleteState>({ status: 'idle', results: [] })

  const controllerRef = useRef<ReturnType<typeof createDebouncedAutocompleteSearcher<SchoolAutocompleteResult>> | null>(
    null
  )
  if (!controllerRef.current) {
    controllerRef.current = createDebouncedAutocompleteSearcher<SchoolAutocompleteResult>({
      fetcher: searchSchoolsForAutocomplete,
      onStart: () => setState((prev) => ({ status: 'loading', results: prev.results })),
      onResult: (results) => setState({ status: 'ok', results }),
      // 기술 오류를 그대로 노출하지 않는다 — 빈 결과처럼 보이되 status만 'error'로 구분해
      // 컴포넌트가 "일치하는 학교를 찾지 못했어요" 대신 오류 메시지를 고를 수 있게 한다.
      onError: () => setState({ status: 'error', results: [] }),
      onSkip: () => setState({ status: 'idle', results: [] }),
    })
  }

  useEffect(() => {
    controllerRef.current!.search(query)
  }, [query])

  useEffect(() => {
    const controller = controllerRef.current!
    return () => controller.cancel()
  }, [])

  return state
}
