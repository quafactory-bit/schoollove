import { supabase, supabaseServer } from '@/lib/supabase'
import type { Profile, ProfileInsert } from '@/types/profile'

const PAGE_SIZE = 20

// ─── 학교별 프로필 목록 ───────────────────────────────────────────
export async function getProfilesBySchool(
  schoolId: string,
  page = 1,
  year?: number
): Promise<{ data: Profile[]; count: number }> {
  let query = supabaseServer
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })

  if (year) query = query.eq('graduation_year', year)

  const from = (page - 1) * PAGE_SIZE
  query = query.range(from, from + PAGE_SIZE - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('getProfilesBySchool error:', error)
    return { data: [], count: 0 }
  }
  return { data: data || [], count: count || 0 }
}

// ─── 반별 프로필 목록 ─────────────────────────────────────────────
export async function getProfilesByClass(
  schoolId: string,
  year: number,
  grade: number,
  classNum: number,
  page = 1
): Promise<{ data: Profile[]; count: number }> {
  const from = (page - 1) * PAGE_SIZE

  const { data, error, count } = await supabaseServer
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('graduation_year', year)
    .eq('grade', grade)
    .eq('class_number', classNum)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  if (error) {
    console.error('getProfilesByClass error:', error)
    return { data: [], count: 0 }
  }
  return { data: data || [], count: count || 0 }
}

// ─── 최근 등록 프로필 (메인 페이지) ──────────────────────────────
export async function getRecentProfiles(limit = 10): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      school:schools(id, school_name, slug, sido, sigungu, school_type)
    `)
    .eq('is_hidden', false)
    .not('instagram_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('getRecentProfiles error:', error)
    return []
  }
  return data || []
}

// ─── 이름 검색 ────────────────────────────────────────────────────
export async function searchProfiles(query: string, limit = 10): Promise<Profile[]> {
  if (!query || query.trim().length < 1) return []

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      school:schools(id, school_name, slug, sido, sigungu, school_type)
    `)
    .ilike('nickname', `%${query.trim()}%`)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('searchProfiles error:', error)
    return []
  }
  return data || []
}

// ─── 중복 체크 ────────────────────────────────────────────────────
export async function checkDuplicate(
  schoolId: string,
  graduationYear: number,
  grade: number | null,
  classNumber: number | null,
  nickname: string
): Promise<boolean> {
  let query = supabase
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .eq('graduation_year', graduationYear)
    .ilike('nickname', nickname.trim())

  if (grade !== null) query = query.eq('grade', grade)
  else query = query.is('grade', null)

  if (classNumber !== null) query = query.eq('class_number', classNumber)
  else query = query.is('class_number', null)

  const { data, error } = await query

  if (error) return false
  return (data?.length || 0) > 0
}

// ─── 프로필 등록 ─────────────────────────────────────────────────
export async function insertProfile(profile: ProfileInsert): Promise<{ data: Profile | null; error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      ...profile,
      report_count: 0,
      is_hidden: false,
    })
    .select()
    .single()

  if (error) {
    console.error('insertProfile error:', error)
    if (error.code === '23505') return { data: null, error: '이미 등록된 정보입니다.' }
    return { data: null, error: '등록 중 오류가 발생했습니다.' }
  }
  return { data, error: null }
}

// ─── 졸업년도 목록 (학교별) ───────────────────────────────────────
export async function getGraduationYearsBySchool(schoolId: string): Promise<number[]> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('graduation_year')
    .eq('school_id', schoolId)
    .eq('is_hidden', false)
    .order('graduation_year', { ascending: false })

  if (error) return []

  const years = [...new Set((data || []).map((p: { graduation_year: number }) => p.graduation_year))]
  return years
}

// ─── 반 목록 (학교+년도별) ───────────────────────────────────────
export async function getClassesBySchoolYear(
  schoolId: string,
  year: number
): Promise<{ grade: number; class_number: number }[]> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('grade, class_number')
    .eq('school_id', schoolId)
    .eq('graduation_year', year)
    .eq('is_hidden', false)
    .not('grade', 'is', null)
    .not('class_number', 'is', null)
    .order('grade')
    .order('class_number')

  if (error) return []

  // 중복 제거
  const seen = new Set<string>()
  const result: { grade: number; class_number: number }[] = []
  for (const item of data || []) {
    const key = `${item.grade}-${item.class_number}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push({ grade: item.grade, class_number: item.class_number })
    }
  }
  return result
}

export { PAGE_SIZE }
