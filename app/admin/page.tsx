import { LogoutButton } from './_components/logout-button';

export const metadata = {
  title: '관리자 - 스쿨러브아이',
  robots: { index: false, follow: false },
};

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">관리자 대시보드</h1>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-gray-600">
          로그인 성공. 대시보드 본 구현은 다음 단계에서 진행합니다.
        </p>
      </main>
    </div>
  );
}
