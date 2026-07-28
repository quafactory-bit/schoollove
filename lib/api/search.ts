import { supabase } from '@/lib/supabase'
import type { SchoolType } from '@/types/school'

export interface SchoolSearchResult {
  id: string
  school_name: string
  school_type: SchoolType
  sido: string
  sigungu: string
  slug: string
  profile_count: number
  address: string
  school_code: string
  created_at: string
}

// search_schools_v2 RPC 호출 하나로 통일 — searchSchools(전체 검색)와
// searchSchoolsForAutocomplete(자동완성) 둘 다 이 함수만 거쳐 학교 목록을 가져온다.
// 지역 prefix까지 매칭하는 기존 RPC를 재사용한다 (예: "순천이수초" → "이수초등학교").
async function fetchSchoolsBySearchRpc(
  query: string,
  limit: number
): Promise<Array<Omit<SchoolSearchResult, 'profile_count'>>> {
  if (query.trim().length < 2) return []

  const { data, error } = await supabase.rpc('search_schools_v2', {
    q: query.trim(),
    lim: limit,
  })

  if (error || !data) return []

  return data as Array<Omit<SchoolSearchResult, 'profile_count'>>
}

export async function searchSchools(query: string): Promise<SchoolSearchResult[]> {
  const schools = await fetchSchoolsBySearchRpc(query, 20)
  // PHASE 10A: 학교 검색 결과는 학교 기본 정보만 사용한다. profile_count는 기존
  // 타입 호환을 위해 0으로 유지하지만 profiles 테이블을 조회하거나 노출 근거로 쓰지 않는다.
  return schools.map((school) => ({ ...school, profile_count: 0 } as SchoolSearchResult))
}

// ─── 자동완성 전용 (Phase 4C) ─────────────────────────────────────
// docs/decisions/2026-07-17-school-search-autocomplete.md
// 드롭다운에는 profile_count가 필요 없으므로(개인/집계 데이터 미표시) profile_count
// enrichment(N+1 profiles 조회)를 생략한다 — searchSchools와 같은 RPC·정렬을 그대로
// 재사용하되, 자동완성 후보 수만큼만(limit) 가볍게 가져온다.
export interface SchoolAutocompleteResult {
  id: string
  school_name: string
  school_type: SchoolType
  sido: string
  sigungu: string
  slug: string
}

const AUTOCOMPLETE_RESULT_LIMIT = 6

export async function searchSchoolsForAutocomplete(query: string): Promise<SchoolAutocompleteResult[]> {
  const schools = await fetchSchoolsBySearchRpc(query, AUTOCOMPLETE_RESULT_LIMIT)
  return schools.map(({ id, school_name, school_type, sido, sigungu, slug }) => ({
    id,
    school_name,
    school_type,
    sido,
    sigungu,
    slug,
  }))
}

// PHASE 7B — 글로벌 인물 검색(searchProfiles/searchAll/ProfileSearchResult)은 계속 제거된
// 상태로 유지한다. docs/design-package-v1.0/08-search.md §8 "하지 않는 것: 글로벌 사람
// 실명 검색을 P1 핵심으로 확장"을 위반하고 있었다 — 사람 이름 검색은
// components/YearPeopleSearch.tsx를 통해 선택된 학교·졸업연도 내부에서만, 서버 호출 없이
// 클라이언트 state로만 동작한다(lib/policy/yearHub.ts). 학교 검색(searchSchools,
// searchSchoolsForAutocomplete)은 이 파일에서 무변경으로 유지된다.

// PHASE 7B COMPLETION PATCH — SCHOOL SEARCH CONTINUITY
// 학교 검색 로그만 복구한다(사람 검색과는 무관 — Year Hub 이름 검색은 이 함수를 호출하지
// 않는다). docs/decisions/2026-07-17-search-logs-aggregate-rpc.md #4 "logSearch()의 INSERT
// 동작과 search_logs_insert 정책은 그대로 둔다"를 따라 기존 INSERT 계약(컬럼
// query/result_count, RLS search_logs_insert)을 그대로 재사용했다 — School Hub의
// getSchoolSearchCount()(lib/api/searches.ts)가 이 값을 읽는 유일한 소비자다. 이름을
// logSearch → logSchoolSearch로 바꿔 "사람 검색"과 절대 혼동되지 않게 했다. fire-and-forget:
// 실패해도 호출부의 검색 결과 표시를 절대 막지 않는다(호출부에서도 await하지 않고
// void 호출로만 사용).
export async function logSchoolSearch(query: string, resultCount: number): Promise<void> {
  try {
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    if (trimmed.length > 100) return
    await supabase.from('search_logs').insert({
      query: trimmed,
      result_count: resultCount,
    })
  } catch {
    // 로그 실패는 조용히 무시
  }
}
