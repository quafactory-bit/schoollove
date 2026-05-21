import type { Metadata } from 'next'
import { getAdminStats, getReports } from '@/lib/api/reports'
import { Users, AlertTriangle, Trash2, UserCheck } from 'lucide-react'

export const metadata: Metadata = {
  title: '관리자',
  robots: { index: false, follow: false },
}

// TODO: 실제 배포 시 미들웨어로 비밀번호 보호 추가
export default async function AdminPage() {
  const [stats, { data: pendingReports }] = await Promise.all([
    getAdminStats(),
    getReports(undefined, 'pending', 1, 20),
  ])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-gray-900">관리자 대시보드</h1>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">스쿨러브아이</span>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Users size={20} className="text-brand-blue" />}
          label="총 등록 수"
          value={stats.totalProfiles.toLocaleString()}
          suffix="명"
          bg="bg-blue-50"
        />
        <StatCard
          icon={<UserCheck size={20} className="text-green-600" />}
          label="오늘 등록"
          value={stats.todayProfiles.toLocaleString()}
          suffix="명"
          bg="bg-green-50"
        />
        <StatCard
          icon={<AlertTriangle size={20} className="text-amber-500" />}
          label="신고 수"
          value={stats.pendingReports.toLocaleString()}
          suffix="건"
          bg="bg-amber-50"
        />
        <StatCard
          icon={<Trash2 size={20} className="text-red-500" />}
          label="삭제 요청"
          value={stats.pendingDeletes.toLocaleString()}
          suffix="건"
          bg="bg-red-50"
        />
      </div>

      {/* 최근 신고/요청 */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">처리 대기 중 ({pendingReports.length}건)</h2>
        </div>
        {pendingReports.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">처리할 항목이 없습니다</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingReports.map((report) => (
              <div key={report.id} className="px-5 py-3 flex items-center gap-3">
                <TypeBadge type={report.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {report.profile?.nickname}
                    {report.profile?.instagram_id && (
                      <span className="text-gray-400 font-normal ml-1.5">@{report.profile.instagram_id}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{report.reason}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(report.created_at).toLocaleDateString('ko-KR')}
                </span>
                <ResolveButton reportId={report.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  suffix,
  bg,
}: {
  icon: React.ReactNode
  label: string
  value: string
  suffix: string
  bg: string
}) {
  return (
    <div className="card p-4 space-y-2">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-black text-gray-900">
          {value}<span className="text-sm font-normal text-gray-500 ml-0.5">{suffix}</span>
        </p>
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const styles = {
    report: 'bg-amber-100 text-amber-700',
    edit: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
  }
  const labels = { report: '신고', edit: '수정', delete: '삭제' }
  const t = type as 'report' | 'edit' | 'delete'

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${styles[t]}`}>
      {labels[t]}
    </span>
  )
}

// 클라이언트 컴포넌트로 분리하면 좋지만 MVP에서는 링크로 처리
function ResolveButton({ reportId }: { reportId: string }) {
  return (
    <form action={`/api/admin/resolve`} method="POST">
      <input type="hidden" name="reportId" value={reportId} />
      <button
        type="submit"
        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-lg transition-colors"
      >
        처리
      </button>
    </form>
  )
}
