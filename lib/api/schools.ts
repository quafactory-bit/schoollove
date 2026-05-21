import { supabase, supabaseServer } from '@/lib/supabase'
import type { School } from '@/types/school'

// ─── 학교 검색 (자동완성) ─────────────────────────────────────────
export async function searchSchools(query: string, limit = 10): Promise<School[]> {
  if (!query || query.trim().length < 1) return []

  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .ilike('school_name', `%${query.trim()}%`)
    .order('school_name')
    .limit(limit)

  if (error) {
    console.error('searchSchools error:', error)
    return []
  }
  return data || []
}

// ─── slug로 학교 단건 조회 (SSR) ──────────────────────────────────
export async function getSchoolBySlug(slug: string): Promise<School | null> {
  const { data, error } = await supabaseServer
    .from('schools')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error) {
    console.error('getSchoolBySlug error:', error)
    return null
  }
  return data
}

// ─── 인기 학교 (프로필 수 기준) ───────────────────────────────────
export async function getPopularSchools(limit = 8): Promise<School[]> {
  // profiles 테이블과 JOIN하여 count 기준 정렬
  const { data, error } = await supabase
    .from('schools')
    .select(`
      *,
      profile_count:profiles(count)
    `)
    .limit(limit)

  if (error) {
    console.error('getPopularSchools error:', error)
    // fallback: 최근 학교 반환
    const { data: fallback } = await supabase
      .from('schools')
      .select('*')
      .limit(limit)
    return fallback || []
  }

  // count 정렬
  const sorted = (data || [])
    .map((s: School & { profile_count: { count: number }[] }) => ({
      ...s,
      profile_count: s.profile_count?.[0]?.count || 0,
    }))
    .sort((a, b) => (b.profile_count as number) - (a.profile_count as number))

  return sorted
}

// ─── 전체 학교 slug 목록 (sitemap용) ──────────────────────────────
export async function getAllSchoolSlugs(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from('schools')
    .select('slug')

  if (error) return []
  return (data || []).map((s: { slug: string }) => s.slug)
}

// ─── 학교 ID로 단건 조회 ──────────────────────────────────────────
export async function getSchoolById(id: string): Promise<School | null> {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}
