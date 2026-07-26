import { LogoutButton } from './_components/logout-button';
import { StatCard } from './_components/stat-card';
import {
  UsersIcon,
  CalendarIcon,
  AlertIcon,
  TrashIcon,
} from './_components/stat-icons';
import { ReportsList } from './_components/reports-list';
import { DeleteRequestsList } from './_components/delete-requests-list';
import { EditRequestsList } from './_components/edit-requests-list';
import { getDashboardStats, getRecentRequests } from '@/lib/api/admin';

export const metadata = {
  title: 'Admin - SchoolLovei',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [stats, reports, editRequests, deleteRequests] = await Promise.all([
    getDashboardStats(),
    getRecentRequests('report', 20),
    getRecentRequests('edit', 20),
    getRecentRequests('delete', 20),
  ]);

  return (
    <div className="admin-ui min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-black">관리자 대시보드</h1>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-black mb-4">대시보드</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="총 등록자 수"
              value={stats.totalProfiles}
              unit="명"
              icon={<UsersIcon />}
              iconBgClass="bg-blue-50"
              iconColorClass="text-blue-600"
            />
            <StatCard
              label="오늘 등록 수"
              value={stats.todayProfiles}
              unit="명"
              icon={<CalendarIcon />}
              iconBgClass="bg-green-50"
              iconColorClass="text-green-600"
            />
            <StatCard
              label="신고 수"
              value={stats.pendingReports}
              unit="건"
              icon={<AlertIcon />}
              iconBgClass="bg-orange-50"
              iconColorClass="text-orange-600"
            />
            <StatCard
              label="삭제 요청 수"
              value={stats.pendingDeleteRequests}
              unit="건"
              icon={<TrashIcon />}
              iconBgClass="bg-red-50"
              iconColorClass="text-red-600"
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black mb-4">최근 신고 목록</h2>
          <ReportsList reports={reports} emptyMessage="아직 신고가 없습니다." />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black mb-4">수정 요청 목록</h2>
          <EditRequestsList requests={editRequests} />
        </section>

        <section>
          <h2 className="text-lg font-semibold text-black mb-4">삭제 요청 목록</h2>
          <DeleteRequestsList requests={deleteRequests} />
        </section>

        <section>
          <p className="text-sm text-gray-500">
  ※ 등록 데이터 전체 관리는{' '}
  <a href="/admin/profiles" className="text-blue-600 underline hover:text-blue-800">
    등록 데이터 관리 페이지
  </a>
  에서 확인하세요.
</p>
        </section>
      </main>
    </div>
  );
}
