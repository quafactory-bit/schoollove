import { supabaseServer } from '@/lib/supabase';

export type DashboardStats = {
  totalProfiles: number;
  todayProfiles: number;
  pendingReports: number;
  pendingDeleteRequests: number;
};

/**
 * 관리자 대시보드용 통계 4종 집계.
 * 모든 쿼리를 병렬로 실행해 응답 속도 최적화.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  // KST 기준 오늘 00:00 ISO 문자열 계산
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
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

  const [
    totalResult,
    todayResult,
    reportsResult,
    deleteRequestsResult,
  ] = await Promise.all([
    // 총 등록 수 (숨김 제외)
    supabaseServer
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_hidden', false),

    // 오늘 등록 수 (KST 기준)
    supabaseServer
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_hidden', false)
      .gte('created_at', todayStartUtc),

    // 처리 대기 중인 신고 수
    supabaseServer
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'report')
      .eq('status', 'pending'),

    // 처리 대기 중인 삭제 요청 수
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
