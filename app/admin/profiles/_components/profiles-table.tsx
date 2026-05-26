'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminProfile } from '@/lib/api/admin';

type Props = { profiles: AdminProfile[] };

const SCHOOL_LABELS: Record<string, string> = {
  elementary: '초등', middle: '중', high: '고', university: '대학교', college: '전문대',
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
}

export function ProfilesTable({ profiles }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function toggle(id: string, hidden: boolean) {
    setLoadingId(id);
    try {
      const res = await fetch('/api/admin/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_hidden: !hidden }),
      });
      if (!res.ok) alert('오류가 발생했습니다.');
      else router.refresh();
    } catch { alert('네트워크 오류'); } finally { setLoadingId(null); }
  }

  if (!profiles.length) return (
    <div className='bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm'>검색 결과가 없습니다.</div>
  );

  return (
    <div className='bg-white border border-gray-200 rounded-lg overflow-hidden'>
      <div className='overflow-x-auto'>
        <table className='w-full text-sm'>
          <thead className='bg-gray-50 border-b border-gray-200'>
            <tr>
              {['이름/별명','학교','정보','인스타','신고','등록일','상태','액션'].map((h,i) => (
                <th key={i} className={'px-4 py-3 font-medium text-gray-700 ' + (i===7 ? 'text-right' : 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className={'border-b border-gray-100 last:border-0 hover:bg-gray-50' + (p.is_hidden ? ' opacity-50' : '')}>
                <td className='px-4 py-3 font-medium text-gray-900'>{p.nickname}</td>
                <td className='px-4 py-3 text-gray-700'>
                  <span className='text-xs text-gray-400 mr-1'>{SCHOOL_LABELS[p.school?.school_type ?? ''] ?? ''}</span>
                  {p.school?.school_name ?? '-'}
                </td>
                <td className='px-4 py-3 text-gray-600 text-xs'>
                  {p.graduation_year}년{p.grade && p.class_number ? ' · ' + p.grade + '-' + p.class_number : ''}
                </td>
                <td className='px-4 py-3'>
                  {p.instagram_id
                    ? <a href={'https://instagram.com/' + p.instagram_id} target='_blank' rel='noopener noreferrer' className='text-blue-600 hover:underline'>@{p.instagram_id}</a>
                    : <span className='text-gray-400'>미등록</span>}
                </td>
                <td className='px-4 py-3'>
                  {p.report_count > 0
                    ? <span className='text-orange-600 font-medium'>{p.report_count}건</span>
                    : <span className='text-gray-400'>0</span>}
                </td>
                <td className='px-4 py-3 text-gray-600 whitespace-nowrap'>{fmt(p.created_at)}</td>
                <td className='px-4 py-3'>
                  {p.is_hidden
                    ? <span className='inline-flex px-2 py-1 text-xs rounded bg-gray-100 text-gray-500'>숨김</span>
                    : <span className='inline-flex px-2 py-1 text-xs rounded bg-green-50 text-green-700'>공개</span>}
                </td>
                <td className='px-4 py-3 text-right'>
                  <button onClick={() => toggle(p.id, p.is_hidden)} disabled={loadingId === p.id}
                    className='px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'>
                    {loadingId === p.id ? '처리중...' : p.is_hidden ? '복원' : '숨김'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}