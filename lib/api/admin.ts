import { supabaseServer, getSupabaseAdmin } from '@/lib/supabase';

export type DashboardStats = {
  totalProfiles: number;
  todayProfiles: number;
  pendingReports: number;
  pendingDeleteRequests: number;
};

export type AdminReport = {
  id: string;
  type: 'report' | 'edit' | 'delete';
  reason: string | null;
  status: 'pending' | 'done';
  created_at: string;
  requested_instagram_id: string | null;
  is_self_claimed: boolean;
  profile: {
    id: string;
    nickname: string;
    instagram_id: string | null;
    graduation_year: number;
    grade: number | null;
    class_number: number | null;
    school: {
      id: string;
      school_name: string;
      slug: string;
    } | null;
  } | null;
};

/**
 * 관리자 대시보드용 통계 4종 집계.
 * RLS 정책으로 anon 키도 모든 reports/profiles 조회 가능.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const kstMidnight = new Date(
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate(),
      0,
      0,
      0
    )
  );
  const todayStartUtc = new Date(
    kstMidnight.getTime() - kstOffset
  ).toISOString();

  const [totalResult, todayResult, reportsResult, deleteRequestsResult] =
    await Promise.all([
      supabaseServer
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_hidden', false),
      supabaseServer
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_hidden', false)
        .gte('created_at', todayStartUtc),
      supabaseServer
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'report')
        .eq('status', 'pending'),
      supabaseServer
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'delete')
        .eq('status', 'pending'),
    ]);

  return {
    totalProfiles: totalResult.count ?? 0,
    todayProfiles: todayResult.count ?? 0,
    pendingReports: reportsResult.count ?? 0,
    pendingDeleteRequests: deleteRequestsResult.count ?? 0,
  };
}

/**
 * 신고/수정/삭제 요청 목록 조회.
 */
export async function getRecentRequests(
  type: 'report' | 'edit' | 'delete',
  limit = 20
): Promise<AdminReport[]> {
  const { data, error } = await supabaseServer
    .from('reports')
    .select(
      `
      id,
      type,
      reason,
      status,
      created_at,
      requested_instagram_id,
      is_self_claimed,
      profile:profiles (
        id,
        nickname,
        instagram_id,
        graduation_year,
        grade,
        class_number,
        school:schools (
          id,
          school_name,
          slug
        )
      )
    `
    )
    .eq('type', type)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getRecentRequests error:', error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    type: row.type,
    reason: row.reason,
    status: row.status,
    created_at: row.created_at,
    requested_instagram_id: row.requested_instagram_id,
    is_self_claimed: row.is_self_claimed,
    profile: row.profile
      ? {
          id: row.profile.id,
          nickname: row.profile.nickname,
          instagram_id: row.profile.instagram_id,
          graduation_year: row.profile.graduation_year,
          grade: row.profile.grade,
          class_number: row.profile.class_number,
          school: row.profile.school
            ? {
                id: row.profile.school.id,
                school_name: row.profile.school.school_name,
                slug: row.profile.school.slug,
              }
            : null,
        }
      : null,
  })) as AdminReport[];
}

/**
 * 신고/요청 상태를 'done'으로 변경.
 */
export async function markRequestAsDone(id: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('reports')
    .update({ status: 'done' })
    .eq('id', id);

  if (error) {
    console.error('markRequestAsDone error:', error);
    return false;
  }
  return true;
}

/**
 * 신고/요청 상태를 'pending'으로 되돌림.
 */
export async function markRequestAsPending(id: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('reports')
    .update({ status: 'pending' })
    .eq('id', id);

  if (error) {
    console.error('markRequestAsPending error:', error);
    return false;
  }
  return true;
}

/**
 * 프로필 숨김 처리 (삭제 요청 처리 시 호출).
 */
export async function hideProfile(profileId: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('profiles')
    .update({ is_hidden: true })
    .eq('id', profileId);

  if (error) {
    console.error('hideProfile error:', error);
    return false;
  }
  return true;
}

/**
 * 프로필 숨김 해제 (되돌리기).
 */
export async function unhideProfile(profileId: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('profiles')
    .update({ is_hidden: false })
    .eq('id', profileId);

  if (error) {
    console.error('unhideProfile error:', error);
    return false;
  }
  return true;
}

export type AdminProfile = {
  id: string;
  nickname: string;
  instagram_id: string | null;
  graduation_year: number;
  grade: number | null;
  class_number: number | null;
  department: string | null;
  report_count: number;
  is_hidden: boolean;
  created_at: string;
  school: {
    id: string;
    school_name: string;
    slug: string;
    school_type: string;
  } | null;
};

export type ProfilesResult = {
  profiles: AdminProfile[];
  total: number;
};

/**
 * 관리자용 전체 프로필 목록 조회 (검색, 페이지네이션).
 */
export async function getAdminProfiles(
  page = 1,
  query = '',
  perPage = 20
): Promise<ProfilesResult> {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let q = supabaseServer
    .from('profiles')
    .select(
      `
      id,
      nickname,
      instagram_id,
      graduation_year,
      grade,
      class_number,
      department,
      report_count,
      is_hidden,
      created_at,
      school:schools (
        id,
        school_name,
        slug,
        school_type
      )
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.trim()) {
    q = q.or(
      `nickname.ilike.%${query}%,schools.school_name.ilike.%${query}%`
    );
  }

  const { data, error, count } = await q;

  if (error) {
    console.error('getAdminProfiles error:', error);
    return { profiles: [], total: 0 };
  }

  return {
    profiles: (data ?? []).map((row: any) => ({
      id: row.id,
      nickname: row.nickname,
      instagram_id: row.instagram_id,
      graduation_year: row.graduation_year,
      grade: row.grade,
      class_number: row.class_number,
      department: row.department,
      report_count: row.report_count,
      is_hidden: row.is_hidden,
      created_at: row.created_at,
      school: row.school
        ? {
            id: row.school.id,
            school_name: row.school.school_name,
            slug: row.school.slug,
            school_type: row.school.school_type,
          }
        : null,
    })) as AdminProfile[],
    total: count ?? 0,
  };
}

/**
 * 프로필 영구 삭제 (삭제 요청 처리 시 사용).
 * 외래키 제약 때문에 reports → profiles 순서로 삭제.
 * service_role 키를 사용해 RLS를 우회한다.
 * 절대 클라이언트에서 호출하지 말 것. API route를 통해서만 호출.
 */
export async function deleteProfileCompletely(profileId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();

  // 1. 이 프로필을 참조하는 모든 reports 먼저 삭제 (외래키 제약)
  const { error: reportsError } = await admin
    .from('reports')
    .delete()
    .eq('profile_id', profileId);

  if (reportsError) {
    console.error('deleteProfileCompletely (reports) error:', reportsError);
    return false;
  }

  // 2. profile 삭제
  const { error: profileError } = await admin
    .from('profiles')
    .delete()
    .eq('id', profileId);

  if (profileError) {
    console.error('deleteProfileCompletely (profile) error:', profileError);
    return false;
  }

  return true;
}
