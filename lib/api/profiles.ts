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

// PHASE 7B — Year Hub 전용: 학교+졸업연도의 공개 프로필 전체를 한 번에 로드한다.
// FROZEN 06-people-discovery.md §E "P1은 전체 기수 명단을 로드한 뒤 클라이언트 실시간
// 필터"를 그대로 구현 — getProfilesBySchool()처럼 20개씩 페이지네이션하지 않는다(새
// 페이지네이션 도입 금지 원칙과도 일치). limit은 서버 부하를 막는 방어적 상한일 뿐
// 정책적 페이지네이션이 아니다 — 실제 한 학교·한 졸업연도 인원이 이 값을 넘는 경우는
// v1.0 데이터 규모에서 확인되지 않았다.
const YEAR_HUB_PROFILE_LIMIT = 500;

// select('*')(getProfilesBySchool/getProfilesByClass의 기존 관례)를 그대로 따르지 않고
// 공개 화면(ProfileCard/YearPeopleSearch)이 실제로 쓰는 컬럼만 명시적으로 선택한다 —
// report_count/is_hidden/school_id/student_year/description/is_self 같은 비공개·관리자용
// 필드는 이 함수가 Server Component → Client Component 경계를 넘길 때부터 아예 포함하지
// 않는다(그 경계를 넘으면 RSC payload에 실려 브라우저로 전달되므로, 화면이 안 쓴다는
// 이유만으로 넘기지 않는 것이 안전하다).
export type YearHubPersonProfile = {
  id: string;
  nickname: string;
  instagram_id: string | null;
  graduation_year: number;
  grade: number | null;
  class_number: number | null;
  department: string | null;
  message: string | null;
  created_at: string;
};

export async function getAllProfilesBySchoolYear(
  schoolId: string,
  year: number,
  limit = YEAR_HUB_PROFILE_LIMIT
): Promise<YearHubPersonProfile[]> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('id, nickname, instagram_id, graduation_year, grade, class_number, department, message, created_at')
    .eq('school_id', schoolId)
    .eq('graduation_year', year)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getAllProfilesBySchoolYear error:', error);
    return [];
  }
  return (data as YearHubPersonProfile[]) || [];
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
// ──────────────────────────────────────────────
// 사이트 전체 등록 인원 (사회적 증거용)
// 빈 학교 페이지에서 "전국 OOO명 등록" 노출 여부 판단에 사용.
// is_hidden 제외, head:true 로 숫자만 가볍게 셈.
// ──────────────────────────────────────────────
export async function getTotalProfileCount(): Promise<number> {
  const { count, error } = await supabaseServer
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_hidden', false);

  if (error) {
    console.error('getTotalProfileCount error:', error);
    return 0;
  }
  return count || 0;
}
export { PAGE_SIZE };
