'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Notice = { id: string; kind: string; request_id: string | null; connection_id: string | null; read_at: string | null; created_at: string }
const copy: Record<string,string> = {
  connection_request: '새로운 안부가 도착했습니다. 로그인하여 확인해 주세요.',
  connection_reminder: '확인하지 않은 안부가 한 번 더 도착했습니다.',
  request_accepted: '보낸 안부가 수락됐습니다.', request_declined: '보낸 안부가 처리됐습니다.',
  new_message: '연결된 사람에게 새 메시지가 도착했습니다.', connection_ended: '연결 상태가 변경됐습니다.',
  instagram_shared: '연결된 사람이 Instagram을 공개했습니다.', instagram_revoked: 'Instagram 공개가 취소됐습니다.',
}
export default function NotificationsClient() {
  const [items,setItems] = useState<Notice[]>([])
  useEffect(() => { void (async () => { const response=await fetch('/api/notifications'); if(response.ok) setItems((await response.json()).notifications ?? []); await fetch('/api/notifications',{method:'PATCH'}) })() },[])
  return <main className="mx-auto max-w-2xl px-5 py-10"><h1 className="text-3xl font-bold">내 알림</h1><p className="mt-2 text-sm text-gray-600">알림에는 메시지 원문, 이름, 학교와 Instagram을 넣지 않습니다.</p><div className="mt-6 space-y-3">{items.map((item) => <Link key={item.id} href={item.connection_id ? `/connections/${item.connection_id}` : '/connections'} className="block rounded-xl border border-gray-200 bg-white p-4"><p className="text-sm font-semibold">{copy[item.kind] ?? '연결 상태가 변경됐습니다.'}</p><p className="mt-2 text-xs text-gray-500">{new Date(item.created_at).toLocaleString('ko-KR')}</p></Link>)}</div></main>
}
