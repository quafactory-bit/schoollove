'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminProfile } from '@/lib/api/admin';

type Props = {
  profiles: AdminProfile[];
};

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  elementary: '초등',
  middle: '중',
  high: '고',
  university: '대학교',
  college: '전문대',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function ProfilesTable({ profiles }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleToggleHidden(id: string, currentHidden: boolean) {
    setLoadingId(id);
    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_hidden: !currentHidden }),
      });

      if (!res.ok) {
        alert('처리 중 오류가 발생했습니다.');
      } else {
        router.refresh();
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setLoadingId(null);
    }
  }

  if (profiles.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
        검색 결과가 없습니다.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* 데스크탑 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-700">이름/별명</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">학교</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">정보</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">인스타</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">신고</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">등록일</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">상태</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">액션</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr
                key={profile.id}
                className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
                  profile.is_hidden ? 'opacity-50' : ''
                }`}
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {profile.nickname}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <span className="text-xs text-gray-400 mr-1">
                    {SCHOOL_TYPE_LABELS[profile.school?.school_type ?? ''] ?? ''}
                  </span>
                  {profile.school?.school_name ?? '-'}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {profile.graduation_year}년
                  {profile.grade && profile.class_number
                    ? ` · ${profile.grade}-${profile.class_number}`
                    : ''}
                  {profile.department ? ` · ${profile.department}` : ''}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {profile.instagram_id ? (
                    
                      href={`https://instagram.com/${profile.instagram_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      @{profile.instagram_id}
                    </a>
                  ) : (
                    <span className="text-gray-400">미등록</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {profile.report_count > 0 ? (
                    <span className="text-orange-600 font-medium">
                      {profile.report_count}건
                    </span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {formatDate(profile.created_at)}
                </td>
                <td className="px-4 py-3">
                  {profile.is_hidden ? (
                    <span className="inline-flex px-2 py-1 text-xs rounded bg-gray-100 text-gray-500">
                      숨김
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-1 text-xs rounded bg-green-50 text-green-700">
                      공개
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() =>
                      handleToggleHidden(profile.id, profile.is_hidden)
                    }
                    disabled={loadingId === profile.id}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loadingId === profile.id
                      ? '처리중...'
                      : profile.is_hidden
                        ? '복원'
                        : '숨김'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden divide-y divide-gray-100">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className={`p-4 space-y-2 ${profile.is_hidden ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{profile.nickname}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {profile.school?.school_name} · {profile.graduation_year}년
                  {profile.grade && profile.class_number
                    ? ` · ${profile.grade}-${profile.class_number}`
                    : ''}
                </p>
              </div>
              {profile.is_hidden ? (
                <span className="flex-shrink-0 inline-flex px-2 py-1 text-xs rounded bg-gray-100 text-gray-500">
                  숨김
                </span>
              ) : (
                <span className="flex-shrink-0 inline-flex px-2 py-1 text-xs rounded bg-green-50 text-green-700">
                  공개
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">
                {profile.instagram_id
                  ? `@${profile.instagram_id}`
                  : '인스타 미등록'}{' '}
                · 신고 {profile.report_count}건
              </span>
              <button
                onClick={() =>
                  handleToggleHidden(profile.id, profile.is_hidden)
                }
                disabled={loadingId === profile.id}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {loadingId === profile.id
                  ? '...'
                  : profile.is_hidden
                    ? '복원'
                    : '숨김'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
