'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminReport } from '@/lib/api/admin';

type Props = {
  reports: AdminReport[];
  emptyMessage?: string;
};

const REASON_LABELS: Record<string, string> = {
  wrong_info: '잘못된 정보',
  impersonation: '사칭',
  inappropriate: '부적절',
  other: '기타',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function getReasonLabel(reason: string | null): string {
  if (!reason) return '-';
  return REASON_LABELS[reason] ?? reason;
}

function getProfileLabel(profile: AdminReport['profile']): string {
  if (!profile) return '(삭제된 프로필)';
  const insta = profile.instagram_id ? ` @${profile.instagram_id}` : '';
  return `${profile.nickname}${insta}`;
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

export function ReportsList({ reports, emptyMessage = '아직 신고가 없습니다.' }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleToggleStatus(id: string, currentStatus: 'pending' | 'done') {
    setLoadingId(id);
    const newStatus = currentStatus === 'pending' ? 'done' : 'pending';

    try {
      const res = await fetch('/api/admin/reports', {
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

  if (reports.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
        {emptyMessage}
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
              <th className="text-left px-4 py-3 font-medium text-gray-700">신고 내용</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">신고 대상</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">학교 정보</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">신고 사유</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">신고일</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">상태</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">액션</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr
                key={report.id}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <td className="px-4 py-3 text-gray-900 max-w-xs truncate">
                  {report.reason ? '신고 접수' : '-'}
                </td>
                <td className="px-4 py-3 text-gray-900">
                  {getProfileLabel(report.profile)}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {getSchoolLabel(report.profile)}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {getReasonLabel(report.reason)}
                </td>
                <td className="px-4 py-3 text-schoollove-date whitespace-nowrap">
                  {formatDate(report.created_at)}
                </td>
                <td className="px-4 py-3">
                  {report.status === 'pending' ? (
                    <span className="inline-flex px-2 py-1 text-xs rounded bg-orange-50 text-orange-700">
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
                    onClick={() => handleToggleStatus(report.id, report.status)}
                    disabled={loadingId === report.id}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loadingId === report.id
                      ? '처리중...'
                      : report.status === 'pending'
                        ? '처리'
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
        {reports.map((report) => (
          <div key={report.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {getProfileLabel(report.profile)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {getSchoolLabel(report.profile)}
                </p>
              </div>
              {report.status === 'pending' ? (
                <span className="flex-shrink-0 inline-flex px-2 py-1 text-xs rounded bg-orange-50 text-orange-700">
                  대기중
                </span>
              ) : (
                <span className="flex-shrink-0 inline-flex px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
                  처리됨
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-schoollove-date">
                사유: {getReasonLabel(report.reason)} · {formatDate(report.created_at)}
              </span>
              <button
                onClick={() => handleToggleStatus(report.id, report.status)}
                disabled={loadingId === report.id}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingId === report.id
                  ? '...'
                  : report.status === 'pending'
                    ? '처리'
                    : '되돌리기'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
