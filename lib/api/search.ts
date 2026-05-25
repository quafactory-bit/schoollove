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

export async function searchSchools(query: string): Promise<SchoolSearchResult[]> {
  if (query.length < 2) return []

  const { data, error } = await supabase
    .from('schools')
    .select(`
      id,
      school_name,
      school_type,
      sido,
      sigungu,
      slug,
      address,
      school_code,
      created_at
    `)
    .ilike('school_name', `%${query}%`)
    .order('school_name')
    .limit(20)

  if (error || !data) return []

  const schoolsWithCount = await Promise.all(
    data.map(async (school) => {
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
