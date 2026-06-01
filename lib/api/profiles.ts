import { supabase, supabaseServer } from '@/lib/supabase';
import type { Profile, ProfileInsert } from '@/types/profile';

const PAGE_SIZE = 20;

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
    .order('created_at', { ascending: false });

  if (year) query = query.eq('graduation_year', year);

  const from = (page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('getProfilesBySchool error:', error);
    return { data: [], count: 0 };
  }
  return { data: data || [], count: count || 0 };
}

export async function getProfilesByClass(
  schoolId: string,
  year: number,
  grade: number,
  classNum: number,
  page = 1
): Promise<{ data: Profile[]; count: number }> {
  const from = (page - 1) * PAGE_SIZE;

  const { data, error, count } = await supabaseServer
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('graduation_year', year)
    .eq('grade', grade)
    .eq('class_number', classNum)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error('getProfilesByClass error:', error);
    return { data: [], count: 0 };
  }
  return { data: data || [], count: count || 0 };
}

export async function getRecentProfiles(limit = 10): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, school:schools(id, school_name, slug, sido, sigungu, school_type)')
    .eq('is_hidden', false)
    .not('instagram_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getRecentProfiles error:', error);
    return [];
  }
  return data || [];
}

export async function searchProfiles(query: string, limit = 10): Promise<Profile[]> {
  if (!query || query.trim().length < 1) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*, school:schools(id, school_name, slug, sido, sigungu, school_type)')
    .ilike('nickname', `%${query.trim()}%`)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('searchProfiles error:', error);
    return [];
  }
  return data || [];
}

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
    .ilike('nickname', nickname.trim());

  if (grade !== null) query = query.eq('grade', grade);
  else query = query.is('grade', null);

  if (classNumber !== null) query = query.eq('class_number', classNumber);
  else query = query.is('class_number', null);

  const { data, error } = await query;
  if (error) return false;
  return (data?.length || 0) > 0;
}

// insertProfile: Supabase 직접 호출 대신 API Route를 통해 Rate Limit 적용
export async function insertProfile(
  profile: ProfileInsert
): Promise<{ data: Profile | null; error: string | null }> {
  try {
    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });

    const result = await res.json();

    if (!res.ok) {
      return { data: null, error: result.error ?? '등록 중 오류가 발생했습니다.' };
    }

    return { data: result.data, error: null };
  } catch {
    return { data: null, error: '네트워크 오류가 발생했습니다.' };
  }
}

export async function getGraduationYearsBySchool(schoolId: string): Promise<number[]> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('graduation_year')
    .eq('school_id', schoolId)
    .eq('is_hidden', false)
    .order('graduation_year', { ascending: false });

  if (error) return [];

  const years = [...new Set((data || []).map((p: { graduation_year: number }) => p.graduation_year))];
  return years;
}

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
    .order('class_number');

  if (error) return [];

  const seen = new Set<string>();
  const result: { grade: number; class_number: number }[] = [];
  for (const item of data || []) {
    const key = `${item.grade}-${item.class_number}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ grade: item.grade, class_number: item.class_number });
    }
  }
  return result;
}

// ──────────────────────────────────────────────
// SEO 인덱싱용 count 전용 함수
// head:true 로 데이터는 안 가져오고 숫자만 셈 (가벼움)
// generateMetadata 에서 noindex 분기에 사용
// ──────────────────────────────────────────────

export async function getSchoolProfileCount(schoolId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('is_hidden', false);

  if (error) {
    console.error('getSchoolProfileCount error:', error);
    return 0;
  }
  return count || 0;
}

export async function getYearProfileCount(
  schoolId: string,
  year: number
): Promise<number> {
  const { count, error } = await supabaseServer
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('graduation_year', year)
    .eq('is_hidden', false);

  if (error) {
    console.error('getYearProfileCount error:', error);
    return 0;
  }
  return count || 0;
}

export async function getClassProfileCount(
  schoolId: string,
  year: number,
  grade: number,
  classNum: number
): Promise<number> {
  const { count, error } = await supabaseServer
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('graduation_year', year)
    .eq('grade', grade)
    .eq('class_number', classNum)
    .eq('is_hidden', false);

  if (error) {
    console.error('getClassProfileCount error:', error);
    return 0;
  }
  return count || 0;
}

export { PAGE_SIZE };
