import { supabaseServer } from '@/lib/supabase';

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
