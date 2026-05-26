import { getAdminProfiles } from '@/lib/api/admin';
import { ProfilesTable } from './_components/profiles-table';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '등록 데이터 관리 - 스쿨러브아이',
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function AdminProfilesPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = params.q ?? '';
  const page = parseInt(params.page ?? '1', 10);

  const { profiles, total } = await getAdminProfiles(page, query, 20);
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-sm text-gray-500 hover:text-black transition-colors"
            >
              ← 대시보드
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-xl font-bold text-black">등록 데이터 관리</h1>
          </div>
          <span className="text-sm text-gray-500">총 {total.toLocaleString('ko-KR')}명</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* 검색 */}
        <form method="GET" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="이름 또는 학교명 검색"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white text-sm rounded-md hover:bg-gray-800 transition-colors"
          >
            검색
          </button>
          {query && (
            <Link
              href="/admin/profiles"
              className="px-4 py-2 border border-gray-300 text-sm rounded-md hover:bg-gray-50 transition-colors"
            >
              초기화
            </Link>
          )}
        </form>

        {/* 테이블 */}
        <ProfilesTable profiles={profiles} />

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/admin/profiles?q=${query}&page=${page - 1}`}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                이전
              </Link>
            )}
            <span className="text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/admin/profiles?q=${query}&page=${page + 1}`}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                다음
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
