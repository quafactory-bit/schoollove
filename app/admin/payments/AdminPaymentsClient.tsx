'use client'

import { useEffect, useState } from 'react'

type Item = Record<string, unknown>
type State = { payments: Item[]; events: Item[]; refunds: Item[]; documents: Item[]; sandboxConfigured: boolean }
const empty: State = { payments: [], events: [], refunds: [], documents: [], sandboxConfigured: false }
const money = (value: unknown) => `${Number(value ?? 0).toLocaleString('ko-KR')}원`

export default function AdminPaymentsClient() {
  const [state, setState] = useState<State>(empty)
  const [message, setMessage] = useState('')
  async function load() {
    const response = await fetch('/api/admin/payments', { cache: 'no-store' })
    if (response.ok) setState(await response.json())
    else setMessage('관리자 인증 또는 PHASE 10G 데이터베이스가 필요합니다.')
  }
  useEffect(() => { void load() }, [])
  async function apply(body: Item) {
    const response = await fetch('/api/admin/payments', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setMessage(response.ok ? '결제 운영 작업과 감사 기록이 반영되었습니다.' : '현재 상태에서는 처리할 수 없습니다.')
    if (response.ok) await load()
  }
  return <main className="admin-ui mx-auto max-w-7xl px-5 py-10">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">결제 운영</h1><p className="mt-2 text-sm text-gray-600">민감 결제정보 없이 주문 연결, 상태, 금액, 웹훅 처리 결과만 표시합니다.</p></div><span className="border px-3 py-2 text-sm">PortOne sandbox {state.sandboxConfigured ? 'configured' : 'not_configured'}</span></div>
    {message ? <p role="status" className="mt-4 border p-3 text-sm">{message}</p> : null}
    <section className="mt-8"><h2 className="text-xl font-bold">결제</h2><div className="mt-3 grid gap-3">{state.payments.map((item) => <article key={String(item.id)} className="border p-4 text-sm"><p className="font-bold">{String(item.order_number)} · {String(item.status)}</p><p className="mt-1 text-gray-600">{String(item.provider)} · {money(item.amount_krw)} · {String(item.currency)}</p>{['paid','partially_refunded'].includes(String(item.status)) ? <button className="mt-3 min-h-10 border px-3" onClick={() => { const amount=window.prompt('환불 금액'); const reason=window.prompt('환불 사유'); if(amount && /^\d+$/.test(amount) && reason) void apply({ action:'refund',payment_id:item.provider_payment_id,amount_krw:Number(amount),reason,idempotency_key:`admin-refund-${crypto.randomUUID()}` }) }}>Sandbox 환불</button> : null}</article>)}</div></section>
    <section className="mt-8"><h2 className="text-xl font-bold">웹훅</h2><div className="mt-3 grid gap-3">{state.events.map((item) => <article key={String(item.id)} className="flex flex-wrap items-center justify-between gap-3 border p-4 text-sm"><span>{String(item.event_type)} · {String(item.status)} · 시도 {String(item.attempts)}</span>{item.status === 'failed' ? <button className="min-h-10 border px-3" onClick={() => void apply({ action:'retry_webhook',event_id:item.id })}>재처리 대기</button> : null}</article>)}</div></section>
    <section className="mt-8"><h2 className="text-xl font-bold">환불·증빙</h2><p className="mt-3 text-sm text-gray-600">환불 {state.refunds.length}건 · 현금영수증/세금계산서 요청 {state.documents.length}건. 실제 발행 연동은 아직 비활성입니다.</p></section>
  </main>
}
