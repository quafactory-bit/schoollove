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

export interface ProfileSearchResult {
  id: string
  nickname: string
  instagram_id: string | null
  graduation_year: number
  grade: number | null
  class_number: number | null
  school_id: string
  school_name: string
  school_slug: string
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

  const schoolsWithCount = await Promise.all(
    schools.map(async (school) => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', school.id)
        .eq('is_hidden', false)
      return { ...school, profile_count: count || 0 } as SchoolSearchResult
    })
  )

  return schoolsWithCount
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

export async function searchProfiles(query: string): Promise<ProfileSearchResult[]> {
  if (query.length < 2) return []
  const { data: byNickname } = await supabase
    .from('profiles')
    .select(`
      id,
      nickname,
      instagram_id,
      graduation_year,
      grade,
      class_number,
      school_id,
      schools (school_name, slug)
    `)
    .ilike('nickname', `%${query}%`)
    .eq('is_hidden', false)
    .limit(5)
  const { data: byInstagram } = await supabase
    .from('profiles')
    .select(`
      id,
      nickname,
      instagram_id,
      graduation_year,
      grade,
      class_number,
      school_id,
      schools (school_name, slug)
    `)
    .ilike('instagram_id', `%${query}%`)
    .eq('is_hidden', false)
    .not('instagram_id', 'is', null)
    .limit(5)
  const combined = [...(byNickname || []), ...(byInstagram || [])]
  const unique = combined.filter(
    (item, index, self) => index === self.findIndex((t) => t.id === item.id)
  )
  return unique.slice(0, 8).map((p: any) => ({
    id: p.id,
    nickname: p.nickname,
    instagram_id: p.instagram_id,
    graduation_year: p.graduation_year,
    grade: p.grade,
    class_number: p.class_number,
    school_id: p.school_id,
    school_name: p.schools?.school_name || '',
    school_slug: p.schools?.slug || '',
  }))
}

export async function searchAll(query: string) {
  const [schools, profiles] = await Promise.all([
    searchSchools(query),
    searchProfiles(query),
  ])
  return { schools, profiles }
}

// 검색 로그 기록 - fire and forget
// 실패해도 사용자 검색 흐름에 영향 없도록 에러 무시
export async function logSearch(query: string, resultCount: number): Promise<void> {
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
