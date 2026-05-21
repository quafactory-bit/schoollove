import { supabase } from '@/lib/supabase'
import type { Report, ReportInsert } from '@/types/profile'

// ─── 신고/수정/삭제 요청 등록 ─────────────────────────────────────
export async function insertReport(
  report: ReportInsert
): Promise<{ data: Report | null; error: string | null }> {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      ...report,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('insertReport error:', error)
    return { data: null, error: '요청 중 오류가 발생했습니다.' }
  }

  // 신고인 경우 report_count 증가
  if (report.type === 'report') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('report_count')
      .eq('id', report.profile_id)
      .single()

    const newCount = ((profile?.report_count as number) || 0) + 1

    await supabase
      .from('profiles')
      .update({
        report_count: newCount,
        // 3회 이상 신고 시 자동 hidden
        is_hidden: newCount >= 3,
      })
      .eq('id', report.profile_id)
  }

  return { data, error: null }
}

// ─── 관리자: 전체 reports 조회 ───────────────────────────────────
export async function getReports(
  type?: 'report' | 'edit' | 'delete',
  status?: 'pending' | 'done',
  page = 1,
  limit = 20
): Promise<{ data: Report[]; count: number }> {
  let query = supabase
    .from('reports')
    .select(`
      *,
      profile:profiles(
        id, nickname, instagram_id, graduation_year, grade, class_number,
        school:schools(id, school_name, slug)
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (type) query = query.eq('type', type)
  if (status) query = query.eq('status', status)

  const from = (page - 1) * limit
  query = query.range(from, from + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('getReports error:', error)
    return { data: [], count: 0 }
  }
  return { data: data || [], count: count || 0 }
}

// ─── 관리자: report 처리 완료 ─────────────────────────────────────
export async function resolveReport(reportId: string): Promise<boolean> {
  const { error } = await supabase
    .from('reports')
    .update({ status: 'done' })
    .eq('id', reportId)

  return !error
}

// ─── 관리자: 대시보드 통계 ────────────────────────────────────────
export async function getAdminStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [totalProfiles, todayProfiles, pendingReports, pendingDeletes] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString()),
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'report')
      .eq('status', 'pending'),
    supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'delete')
      .eq('status', 'pending'),
  ])

  return {
    totalProfiles: totalProfiles.count || 0,
    todayProfiles: todayProfiles.count || 0,
    pendingReports: pendingReports.count || 0,
    pendingDeletes: pendingDeletes.count || 0,
  }
}
