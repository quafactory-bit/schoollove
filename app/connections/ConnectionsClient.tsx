'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type MouseEvent } from 'react'

import { loadConnectionFeed, type RequestItem, type ConnectionItem, type NotificationItem } from './connectionFeed'

const notificationCopy: Record<NotificationItem['type'], string> = {
  request_received: '새 안부가 도착했어요.',
  request_reminded: '받은 안부가 다시 알려졌어요.',
  request_accepted: '안부가 수락되어 연결됐어요.',
}

function notificationTarget(type: NotificationItem['type']) {
  return type === 'request_accepted' ? 'connected' : 'received'
}

export default function ConnectionsClient({ peopleSearchEnabled = false }: { peopleSearchEnabled?: boolean }) {
  const [received, setReceived] = useState<RequestItem[]>([])
  const [sent, setSent] = useState<RequestItem[]>([])
  const [connections, setConnections] = useState<ConnectionItem[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [status, setStatus] = useState('')
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const data = await loadConnectionFeed()
      setReceived(data.received); setSent(data.sent)
      setConnections(data.connections); setNotifications(data.notifications)
      setLoadState('loaded')
    } catch {
      setLoadState('error')
    }
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

  async function openNotification(event: MouseEvent<HTMLAnchorElement>, item: NotificationItem) {
    event.preventDefault()
    const target = notificationTarget(item.type)
    const response = item.read
      ? null
      : await fetch(`/api/connections/notifications/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read' }) })
    if (response && !response.ok) setStatus('알림을 처리할 수 없습니다.')
    if (!response || response.ok) {
      setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, read: true } : notification))
      window.dispatchEvent(new Event('connection-notifications-changed'))
    }
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState(null, '', `#${target}`)
  }

  return <main className="mx-auto max-w-3xl px-5 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Private connections</p><h1 className="mt-2 text-3xl font-bold">내 연결과 안부</h1></div>{peopleSearchEnabled ? <Link href="/people/search" className="schoollove-dark-action rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white">정확한 사람 찾기</Link> : <p className="text-sm text-gray-600">사람 찾기는 별도 초대와 승인을 받은 제한 베타에서 제공합니다. <Link href="/account" className="underline">내 계정 관리</Link></p>}</div>
    {loadState === 'loading' ? <p role="status" className="mt-8">연결과 안부를 불러오는 중입니다.</p> : null}
    {loadState === 'error' ? <div role="alert" className="mt-8 rounded-xl bg-amber-50 p-4"><p>연결 정보를 불러오지 못했습니다. 로그인 상태와 네트워크를 확인해 주세요.</p><button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-lg border px-4">다시 불러오기</button></div> : null}
    {loadState === 'loaded' ? <>
    <section className="mt-8" aria-labelledby="connection-notifications"><h2 id="connection-notifications" className="text-xl font-bold">새 소식</h2><div className="mt-3 space-y-3">{notifications.length === 0 ? <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">새 소식이 없습니다.</p> : notifications.map((item) => <a key={item.id} href={`#${notificationTarget(item.type)}`} onClick={(event) => void openNotification(event, item)} className={`block rounded-2xl border bg-white p-5 ${item.read ? 'border-gray-200' : 'border-red-200'}`}><p className="font-semibold">{notificationCopy[item.type]}</p><p className="mt-2 text-xs text-gray-500">{new Date(item.createdAt).toLocaleString('ko-KR')}</p></a>)}</div></section>
    <section id="received" className="mt-8"><h2 className="text-xl font-bold">받은 안부</h2><div className="mt-3 space-y-3">{received.length === 0 && <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">받은 안부가 없습니다.</p>}{received.map((item) => <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-5"><div className="flex justify-between gap-3"><p className="font-bold">{item.senderName}</p><span className="text-xs text-gray-500">{item.status}</span></div>{item.school && <p className="mt-1 text-sm text-gray-600">{item.school.schoolName} · {item.school.graduationYear}년 · {item.relationshipType}</p>}<p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm">{item.message}</p>{item.reminder && <p className="mt-2 text-xs font-semibold text-red-700">기존 안부가 한 번 더 알려졌습니다. 새 메시지가 아닙니다.</p>}{item.status === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => requestAction(item.id,'accept')} className="schoollove-dark-action rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">안부 수락</button><button onClick={() => requestAction(item.id,'not_the_person')} className="rounded-lg border px-3 py-2 text-sm">아닌 것 같아요</button><button onClick={() => requestAction(item.id,'decline')} className="rounded-lg border px-3 py-2 text-sm">거절</button><button onClick={() => requestAction(item.id,'block')} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">차단</button><button onClick={() => requestAction(item.id,'report','other')} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">신고</button></div>}</article>)}</div></section>
    <section className="mt-8"><h2 className="text-xl font-bold">보낸 안부</h2><div className="mt-3 space-y-3">{sent.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"><div><p className="text-sm font-semibold">상태 · {item.status}</p><p className="mt-1 text-xs text-gray-500">{new Date(item.sentAt).toLocaleString('ko-KR')}</p></div>{item.status === 'pending' && <div className="flex gap-2"><button onClick={() => remind(item.id)} disabled={item.reminderCount === 1} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-40">안부 한 번 더 알리기</button><button onClick={() => cancel(item.id)} className="rounded-lg border border-red-300 px-3 py-2 text-xs text-red-700">취소</button></div>}</article>)}</div></section>
    <section id="connected" className="mt-8"><h2 className="text-xl font-bold">연결된 사람</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{connections.map((item) => <Link key={item.id} href={`/connections/${item.id}`} className="rounded-2xl border border-gray-200 bg-white p-5"><p className="font-bold">{item.displayName}</p><p className="mt-2 text-sm text-gray-600">{item.status === 'active' ? '연결 확인' : '종료된 연결'}</p></Link>)}</div></section>
    </> : null}
    {status && <p role="status" className="schoollove-dark-action sticky bottom-20 mt-5 rounded-xl bg-gray-950 px-4 py-3 text-sm text-white">{status}</p>}
  </main>
}
