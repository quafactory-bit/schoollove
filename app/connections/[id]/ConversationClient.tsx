'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Conversation = { id: string; status: string; displayName: string; instagramHandle: string | null; messages: Array<{ id: string; mine: boolean; message: string; sentAt: string; read: boolean }> }

export default function ConversationClient({ connectionId }: { connectionId: string }) {
  const router = useRouter()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const load = useCallback(async () => {
    const response = await fetch(`/api/connections/${connectionId}/messages`)
    if (response.ok) { const data = await response.json(); setConversation(data.conversation); await fetch(`/api/connections/${connectionId}/messages`, { method: 'PATCH' }) }
  }, [connectionId])
  useEffect(() => { void load() }, [load])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const response = await fetch(`/api/connections/${connectionId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
    if (response.ok) { setMessage(''); await load() } else setStatus('연결 상태와 메시지 내용을 확인해 주세요.')
  }
  async function act(endpoint: string, method: string, body?: unknown) {
    const response = await fetch(endpoint, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
    setStatus(response.ok ? '안전 설정을 반영했습니다.' : '요청을 처리할 수 없습니다.')
    if (method === 'DELETE' && !endpoint.endsWith('/instagram')) router.push('/connections')
    else await load()
  }

  if (!conversation) return <main className="mx-auto max-w-2xl px-5 py-10"><p>대화를 불러오는 중입니다.</p></main>
  return <main className="mx-auto max-w-2xl px-5 py-10"><Link href="/connections" className="text-sm text-gray-600">← 내 연결</Link><div className="mt-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{conversation.displayName}</h1><p className="mt-1 text-sm text-gray-600">{conversation.instagramHandle ? `Instagram · @${conversation.instagramHandle}` : 'Instagram은 상대가 별도로 공개해야 보입니다.'}</p></div><div className="flex gap-2"><button onClick={() => act(`/api/connections/${connectionId}/instagram`,'POST')} className="rounded-lg border px-3 py-2 text-xs">내 Instagram 공개</button><button onClick={() => act(`/api/connections/${connectionId}/instagram`,'DELETE')} className="rounded-lg border px-3 py-2 text-xs">공개 취소</button></div></div>
    <section className="mt-6 space-y-3 rounded-2xl bg-gray-50 p-4">{conversation.messages.map((item) => <div key={item.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${item.mine ? 'ml-auto bg-gray-950 text-white' : 'bg-white text-gray-900'}`}><p className="whitespace-pre-wrap">{item.message}</p><p className={`mt-2 text-[11px] ${item.mine ? 'text-gray-300' : 'text-gray-500'}`}>{new Date(item.sentAt).toLocaleString('ko-KR')}{item.mine && item.read ? ' · 읽음' : ''}</p></div>)}</section>
    {conversation.status === 'active' && <form onSubmit={send} className="mt-4"><textarea maxLength={500} required rows={4} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3" placeholder="텍스트 메시지 · 외부 연락처 공유 불가"/><div className="mt-2 flex items-center justify-between"><span className="text-xs text-gray-500">{message.length}/500</span><button className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white">보내기</button></div></form>}
    <section className="mt-8 flex flex-wrap gap-2 border-t pt-5"><button onClick={() => act(`/api/connections/${connectionId}`,'DELETE')} className="rounded-lg border px-3 py-2 text-sm">연결 해제</button><button onClick={() => act(`/api/connections/${connectionId}`,'PATCH',{ action:'block' })} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">차단</button><button onClick={() => act(`/api/connections/${connectionId}/report`,'POST',{ reason_code:'other' })} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">신고</button></section>
    {status && <p role="status" className="mt-4 rounded-xl bg-gray-950 px-4 py-3 text-sm text-white">{status}</p>}
  </main>
}
