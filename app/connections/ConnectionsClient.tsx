'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type RequestItem = { id: string; senderName?: string; relationshipType: string; message?: string; status: string; sentAt: string; reminder?: boolean; reminderCount?: number; school?: { schoolName: string; graduationYear: number } | null }
type ConnectionItem = { id: string; displayName: string; status: string; connectedAt: string }

export default function ConnectionsClient() {
  const [received, setReceived] = useState<RequestItem[]>([])
  const [sent, setSent] = useState<RequestItem[]>([])
  const [connections, setConnections] = useState<ConnectionItem[]>([])
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    const [requestsResponse, connectionsResponse] = await Promise.all([fetch('/api/connections/requests'), fetch('/api/connections')])
    if (requestsResponse.ok) { const data = await requestsResponse.json(); setReceived(data.received ?? []); setSent(data.sent ?? []) }
    if (connectionsResponse.ok) { const data = await connectionsResponse.json(); setConnections(data.connections ?? []) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function requestAction(id: string, action: string, reason_code?: string) {
    const response = await fetch(`/api/connections/requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(reason_code ? { reason_code } : {}) }) })
    setStatus(response.ok ? '안부를 처리했습니다.' : '안부를 처리할 수 없습니다.')
    await load()
  }
  async function remind(id: string) {
    const response = await fetch(`/api/connections/requests/${id}/reminder`, { method: 'POST' })
    setStatus(response.ok ? '기존 안부를 한 번 더 알렸습니다. 새 메시지는 전송되지 않았습니다.' : '7일 후 pending 안부에 한 번만 사용할 수 있습니다.')
    await load()
  }
  async function cancel(id: string) {
    const response = await fetch(`/api/connections/requests/${id}`, { method: 'DELETE' })
    setStatus(response.ok ? '안부를 취소했습니다. 다시 요청할 수 없습니다.' : '취소할 수 없습니다.')
    await load()
  }

  return <main className="mx-auto max-w-3xl px-5 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Private connections</p><h1 className="mt-2 text-3xl font-bold">내 연결과 안부</h1></div><Link href="/people/search" className="schoollove-dark-action rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white">정확한 사람 찾기</Link></div>
    <section id="received" className="mt-8"><h2 className="text-xl font-bold">받은 안부</h2><div className="mt-3 space-y-3">{received.length === 0 && <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">받은 안부가 없습니다.</p>}{received.map((item) => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-5"><div className="flex justify-between gap-3"><p className="font-bold">{item.senderName}</p><span className="text-xs text-gray-500">{item.status}</span></div>{item.school && <p className="mt-1 text-sm text-gray-600">{item.school.schoolName} · {item.school.graduationYear}년 · {item.relationshipType}</p>}<p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm">{item.message}</p>{item.reminder && <p className="mt-2 text-xs font-semibold text-red-700">기존 안부가 한 번 더 알려졌습니다. 새 메시지가 아닙니다.</p>}{item.status === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => requestAction(item.id,'accept')} className="schoollove-dark-action rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">수락하고 답장</button><button onClick={() => requestAction(item.id,'not_the_person')} className="rounded-lg border px-3 py-2 text-sm">아닌 것 같아요</button><button onClick={() => requestAction(item.id,'decline')} className="rounded-lg border px-3 py-2 text-sm">거절</button><button onClick={() => requestAction(item.id,'block')} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">차단</button><button onClick={() => requestAction(item.id,'report','other')} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">신고</button></div>}</article>)}</div></section>
    <section className="mt-8"><h2 className="text-xl font-bold">보낸 안부</h2><div className="mt-3 space-y-3">{sent.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"><div><p className="text-sm font-semibold">상태 · {item.status}</p><p className="mt-1 text-xs text-gray-500">{new Date(item.sentAt).toLocaleString('ko-KR')}</p></div>{item.status === 'pending' && <div className="flex gap-2"><button onClick={() => remind(item.id)} disabled={item.reminderCount === 1} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">안부 한 번 더 알리기</button><button onClick={() => cancel(item.id)} className="rounded-lg border border-red-300 px-3 py-2 text-xs text-red-700">취소</button></div>}</article>)}</div></section>
    <section className="mt-8"><h2 className="text-xl font-bold">연결된 사람</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{connections.map((item) => <Link key={item.id} href={`/connections/${item.id}`} className="rounded-2xl border border-gray-200 bg-white p-5"><p className="font-bold">{item.displayName}</p><p className="mt-2 text-sm text-gray-600">{item.status === 'active' ? '대화 열기' : '종료된 연결'}</p></Link>)}</div></section>
    {status && <p role="status" className="schoollove-dark-action sticky bottom-20 mt-5 rounded-xl bg-gray-950 px-4 py-3 text-sm text-white">{status}</p>}
  </main>
}
