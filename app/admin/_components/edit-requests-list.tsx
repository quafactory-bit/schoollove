'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminReport } from '@/lib/api/admin';

type Props = {
  requests: AdminReport[];
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function getProfileLabel(profile: AdminReport['profile']): string {
  if (!profile) return '(삭제된 프로필)';
  return profile.nickname;
}

function getSchoolLabel(profile: AdminReport['profile']): string {
  if (!profile?.school) return '-';
  const parts = [profile.school.school_name];
  parts.push(`${profile.graduation_year}년 졸업`);
  if (profile.grade && profile.class_number) {
    parts.push(`${profile.grade}-${profile.class_number}`);
  }
  return parts.join(' · ');
}

function getCurrentInstagramLabel(profile: AdminReport['profile']): string {
  return profile?.instagram_id ? `@${profile.instagram_id}` : '없음';
}

function getRequestedInstagramLabel(req: AdminReport): string {
  return req.requested_instagram_id ? `@${req.requested_instagram_id}` : '-';
}

export function EditRequestsList({ requests }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleToggle(id: string, currentStatus: 'pending' | 'done') {
    setLoadingId(id);
    const newStatus = currentStatus === 'pending' ? 'done' : 'pending';

    try {
      const res = await fetch('/api/admin/edit-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? '처리 중 오류가 발생했습니다.');
      } else {
        router.refresh();
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setLoadingId(null);
    }
  }

  if (requests.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
        아직 수정 요청이 없습니다.
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
              <th className="text-left px-4 py-3 font-medium text-gray-700">대상</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">학교 정보</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">현재 인스타</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">요청 인스타</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">요청일</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">상태</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">액션</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <tr
                key={req.id}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <td className="px-4 py-3 text-gray-900">{getProfileLabel(req.profile)}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{getSchoolLabel(req.profile)}</td>
                <td className="px-4 py-3 text-gray-500">{getCurrentInstagramLabel(req.profile)}</td>
                <td className="px-4 py-3 text-gray-900 font-medium">{getRequestedInstagramLabel(req)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {formatDate(req.created_at)}
                </td>
                <td className="px-4 py-3">
                  {req.status === 'pending' ? (
                    <span className="inline-flex px-2 py-1 text-xs rounded bg-blue-50 text-blue-700">
                      대기중
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
                      처리됨
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleToggle(req.id, req.status)}
                    disabled={loadingId === req.id || !req.profile}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loadingId === req.id
                      ? '처리중...'
                      : req.status === 'pending'
                        ? '반영'
                        : '되돌리기'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden divide-y divide-gray-100">
        {requests.map((req) => (
          <div key={req.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{getProfileLabel(req.profile)}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{getSchoolLabel(req.profile)}</p>
              </div>
              {req.status === 'pending' ? (
                <span className="flex-shrink-0 inline-flex px-2 py-1 text-xs rounded bg-blue-50 text-blue-700">
                  대기중
                </span>
              ) : (
                <span className="flex-shrink-0 inline-flex px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
                  처리됨
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600">
              {getCurrentInstagramLabel(req.profile)} → {getRequestedInstagramLabel(req)}
            </p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{formatDate(req.created_at)}</span>
              <button
                onClick={() => handleToggle(req.id, req.status)}
                disabled={loadingId === req.id || !req.profile}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingId === req.id ? '...' : req.status === 'pending' ? '반영' : '되돌리기'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
