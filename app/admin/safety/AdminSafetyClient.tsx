'use client'

import { useCallback, useEffect, useState } from 'react'

type SafetyReport = { id: string; reason_code: string; status: string; request_id: string | null; connection_id: string | null; message_id: string | null; created_at: string; reviewed_at: string | null }
const actions = [
  ['report_close','검토 종료'], ['request_force_close','요청 강제 종료'], ['message_hide','메시지 숨김'],
  ['account_suspend','계정 일시 정지'], ['account_restore','계정 정지 해제'],
] as const

export default function AdminSafetyClient() {
  const [reports, setReports] = useState<SafetyReport[]>([])
  const [status, setStatus] = useState('')
  const load = useCallback(async () => { const response = await fetch('/api/admin/safety'); if (response.ok) setReports((await response.json()).reports ?? []) }, [])
  useEffect(() => { void load() }, [load])
  async function apply(reportId: string, action: string) {
    const response = await fetch('/api/admin/safety', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({report_id:reportId,action}) })
    setStatus(response.ok ? '안전 조치와 감사 기록을 함께 저장했습니다.' : '조치를 적용할 수 없습니다.')
    await load()
  }
  return <main className="mx-auto max-w-5xl px-5 py-10"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Admin safety center</p><h1 className="mt-2 text-3xl font-bold">연결 안전센터</h1><p className="mt-3 text-sm text-gray-600">일반 목록은 메시지·이름·학교·Instagram 원문을 표시하지 않습니다. 식별자와 상태만으로 최소 조치를 수행합니다.</p><div className="mt-7 space-y-3">{reports.map((report) => <article key={report.id} className="rounded-2xl border border-gray-200 bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">신고 {report.id.slice(0,8)}</p><p className="mt-1 text-sm text-gray-600">{report.reason_code} · {report.status} · {new Date(report.created_at).toLocaleString('ko-KR')}</p></div><div className="flex flex-wrap gap-2">{actions.map(([value,label]) => <button key={value} onClick={() => apply(report.id,value)} className="rounded-lg border px-3 py-2 text-xs">{label}</button>)}</div></div></article>)}</div>{status && <p role="status" className="mt-5 rounded-xl bg-gray-950 px-4 py-3 text-sm text-white">{status}</p>}</main>
}
