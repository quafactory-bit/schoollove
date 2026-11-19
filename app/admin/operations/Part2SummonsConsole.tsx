'use client'

import { useCallback, useEffect, useState } from 'react'

type Row = { id: string; share_code: string; school_name: string; graduation_year: number; target_name: string; created_at: string; hidden_at: string | null; hidden_reason: string | null; report_count: number }

const REASONS: Record<string, string> = { self_request: '본인 요청', report: '신고 누적', admin: '관리자', creator: '만든 사람' }

// Part 2 P3: 지명 소환장 관리(만든 사람 정보 없음). 내려 주세요·신고 기록 확인과 관리자 내리기.
export default function Part2SummonsConsole() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/summons', { cache: 'no-store' }).catch(() => null)
    const body = await response?.json().catch(() => ({})) as { summons?: Row[] } | undefined
    if (!response?.ok || !Array.isArray(body?.summons)) { setError('소환장 목록을 불러오지 못했어요.'); return }
    setRows(body.summons); setError('')
  }, [])
  useEffect(() => { void load() }, [load])
  async function hide(id: string) {
    if (!window.confirm('이 소환장을 내릴까요?')) return
    const response = await fetch('/api/admin/summons', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null)
    if (!response?.ok) setError('내리지 못했어요.')
    await load()
  }
  return (
    <section aria-labelledby="summons-admin" className="mt-8 rounded-2xl border border-[#16a34a]/30 bg-[#fcfaf5] p-4">
      <h2 id="summons-admin" className="text-lg font-black text-[#14532d]">지명 소환장 (최근 200장)</h2>
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      {rows === null ? <p className="mt-2 text-sm text-gray-600">불러오는 중…</p> : rows.length === 0 ? <p className="mt-2 text-sm text-gray-600">아직 소환장이 없어요.</p> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b text-xs text-gray-500"><th className="py-2">만든 날</th><th>학교·연도</th><th>찾는 이름</th><th>신고</th><th>상태</th><th /></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0">
                <td className="py-2">{row.created_at.slice(0, 10)}</td>
                <td>{row.school_name} {row.graduation_year}</td>
                <td>{row.target_name}</td>
                <td>{row.report_count}</td>
                <td>{row.hidden_at ? `내림 · ${REASONS[row.hidden_reason ?? ''] ?? row.hidden_reason}` : '공개'}</td>
                <td>{row.hidden_at ? null : <button type="button" onClick={() => void hide(row.id)} className="rounded bg-[#14532d] px-2 py-1 text-xs font-bold text-white">내리기</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
