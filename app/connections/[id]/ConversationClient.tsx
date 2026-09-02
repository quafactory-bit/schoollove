'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type ConnectionDetail = { id: string; status: string; displayName: string }
type Capabilities = { messaging: boolean; instagramPermission: boolean }
type Message = { id: string; mine: boolean; message: string; sentAt: string; read: boolean }
type InstagramState = {
  instagramHandle: string | null
  myInstagramConfigured: boolean
  myInstagramVisible: boolean
}

export default function ConversationClient({ connectionId }: { connectionId: string }) {
  const router = useRouter()
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [detail, setDetail] = useState<ConnectionDetail | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messagesState, setMessagesState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [instagramState, setInstagramState] = useState<InstagramState | null>(null)
  const [instagramLoadState, setInstagramLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')

  const loadMessages = useCallback(async () => {
    setMessagesState('loading')
    try {
      const response = await fetch(`/api/connections/${connectionId}/messages`)
      if (!response.ok) {
        setMessagesState('error')
        return
      }
      const data = await response.json() as { conversation: { messages: Message[] } }
      setMessages(data.conversation.messages)
      setMessagesState('loaded')
      await fetch(`/api/connections/${connectionId}/messages`, { method: 'PATCH' })
    } catch {
      setMessagesState('error')
    }
  }, [connectionId])

  const loadInstagram = useCallback(async () => {
    setInstagramLoadState('loading')
    setInstagramState(null)
    try {
      const response = await fetch(`/api/connections/${connectionId}/instagram`)
      if (!response.ok) {
        setInstagramLoadState('error')
        return
      }
      const data = await response.json() as InstagramState
      setInstagramState(data)
      setInstagramLoadState('loaded')
    } catch {
      setInstagramLoadState('error')
    }
  }, [connectionId])

  const loadDetail = useCallback(async () => {
    setLoadState('loading')
    setDetail(null)
    setCapabilities(null)
    try {
      const response = await fetch(`/api/connections/${connectionId}`)
      if (!response.ok) {
        setLoadState('error')
        return
      }
      const data = await response.json() as { connection: ConnectionDetail; capabilities: Capabilities }
      setDetail(data.connection)
      setCapabilities(data.capabilities)
      setLoadState('loaded')
      if (data.capabilities.messaging) await loadMessages()
      else {
        setMessages([])
        setMessagesState('idle')
      }
      if (data.capabilities.instagramPermission) await loadInstagram()
      else {
        setInstagramState(null)
        setInstagramLoadState('idle')
      }
    } catch {
      setLoadState('error')
    }
  }, [connectionId, loadInstagram, loadMessages])

  useEffect(() => { void loadDetail() }, [loadDetail])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (!capabilities?.messaging) return
    const response = await fetch(`/api/connections/${connectionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    if (response.ok) {
      setMessage('')
      await loadMessages()
    } else setStatus('연결 상태와 메시지 내용을 확인해 주세요.')
  }

  async function act(endpoint: string, method: string, body?: unknown) {
    const response = await fetch(endpoint, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    setStatus(response.ok ? '안전 설정을 반영했습니다.' : '요청을 처리할 수 없습니다.')
    if (!response.ok) return
    if (method === 'DELETE') router.push('/connections')
    else await loadDetail()
  }

  async function changeInstagram(method: 'POST' | 'DELETE') {
    if (!capabilities?.instagramPermission || !instagramState) return
    if (method === 'POST' && !instagramState.myInstagramConfigured) return
    const response = await fetch(`/api/connections/${connectionId}/instagram`, { method })
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null
      setStatus(data?.error === 'INSTAGRAM_HANDLE_REQUIRED'
        ? '내 계정에 Instagram 아이디를 먼저 등록해 주세요.'
        : 'Instagram 공개 상태를 바꿀 수 없습니다.')
      return
    }
    setStatus(method === 'POST' ? '이 연결 상대에게 Instagram을 공개했습니다.' : 'Instagram 공개를 취소했습니다.')
    await loadInstagram()
  }

  if (loadState === 'loading') {
    return <main className="mx-auto max-w-2xl px-5 py-10"><p>연결 정보를 불러오는 중입니다.</p></main>
  }
  if (loadState === 'error' || !detail || !capabilities) {
    return <main className="mx-auto max-w-2xl px-5 py-10"><Link href="/connections" className="text-sm text-gray-600">← 내 연결</Link><p className="mt-5">연결 정보를 불러올 수 없습니다.</p></main>
  }

  return <main className="mx-auto max-w-2xl px-5 py-10">
    <Link href="/connections" className="text-sm text-gray-600">← 내 연결</Link>
    <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{detail.displayName}</h1>
        <p className="mt-1 text-sm text-gray-600">연결 상태 · {detail.status === 'active' ? '연결됨' : '종료됨'}</p>
        {capabilities.instagramPermission && instagramState?.instagramHandle ? <p className="mt-1 text-sm text-gray-600">Instagram · @{instagramState.instagramHandle}</p> : null}
      </div>
    </div>

    {capabilities.instagramPermission ? <section className="mt-5 rounded-xl border border-gray-200 px-4 py-4">
      {instagramLoadState === 'loading' ? <p className="text-sm text-gray-600">Instagram 공개 상태를 확인하고 있습니다.</p> : null}
      {instagramLoadState === 'error' ? <p className="text-sm text-gray-600">Instagram 공개 상태를 불러올 수 없습니다.</p> : null}
      {instagramLoadState === 'loaded' && instagramState ? <div className="space-y-3">
        {!instagramState.myInstagramConfigured ? <div>
          <p className="text-sm text-gray-700">Instagram 아이디를 등록하면 연결된 사람에게 선택적으로 공개할 수 있습니다.</p>
          <Link href="/account" className="mt-2 inline-block text-sm font-semibold text-gray-900 underline underline-offset-4">내 계정에서 Instagram 등록</Link>
        </div> : null}
        {instagramState.myInstagramVisible ? <>
          <p className="text-sm text-gray-700">이 연결 상대에게 내 Instagram이 공개되어 있습니다.</p>
          <button type="button" onClick={() => changeInstagram('DELETE')} className="rounded-lg border px-3 py-2 text-xs">Instagram 공개 취소</button>
        </> : instagramState.myInstagramConfigured ? <>
          <p className="text-sm text-gray-700">이 연결 상대에게만 공개됩니다.</p>
          <button type="button" onClick={() => changeInstagram('POST')} className="rounded-lg border px-3 py-2 text-xs">내 Instagram 공개</button>
        </> : null}
      </div> : null}
    </section> : null}

    {capabilities.messaging ? <>
      {messagesState === 'loading' ? <p className="mt-6">대화를 불러오는 중입니다.</p> : null}
      {messagesState === 'error' ? <p className="mt-6">대화 내용을 불러올 수 없습니다.</p> : null}
      {messagesState === 'loaded' ? <section className="mt-6 space-y-3 rounded-2xl bg-gray-50 p-4">{messages.map((item) => <div key={item.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${item.mine ? 'schoollove-dark-action ml-auto bg-gray-950 text-white' : 'bg-white text-gray-900'}`}><p className="whitespace-pre-wrap">{item.message}</p><p className={`mt-2 text-[11px] ${item.mine ? 'text-gray-300' : 'text-gray-500'}`}>{new Date(item.sentAt).toLocaleString('ko-KR')}{item.mine && item.read ? ' · 읽음' : ''}</p></div>)}</section> : null}
      {detail.status === 'active' && messagesState === 'loaded' ? <form onSubmit={send} className="mt-4"><textarea maxLength={500} required rows={4} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3" placeholder="텍스트 메시지 · 외부 연락처 공유 불가"/><div className="mt-2 flex items-center justify-between"><span className="text-xs text-gray-500">{message.length}/500</span><button className="schoollove-dark-action rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white">보내기</button></div></form> : null}
    </> : <p className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">메시지 기능은 현재 이 베타에서 제공되지 않습니다.</p>}

    <section className="mt-8 flex flex-wrap gap-2 border-t pt-5">
      <button onClick={() => act(`/api/connections/${connectionId}`, 'DELETE')} className="rounded-lg border px-3 py-2 text-sm">연결 해제</button>
      <button onClick={() => act(`/api/connections/${connectionId}`, 'PATCH', { action: 'block' })} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">차단</button>
      <button onClick={() => act(`/api/connections/${connectionId}/report`, 'POST', { reason_code: 'other' })} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">신고</button>
    </section>
    {status ? <p role="status" className="schoollove-dark-action mt-4 rounded-xl bg-gray-950 px-4 py-3 text-sm text-white">{status}</p> : null}
  </main>
}
