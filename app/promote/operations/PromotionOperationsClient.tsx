'use client'

import { useState } from 'react'

type Item = Record<string, unknown>
type State = { products: Item[]; quotes: Item[]; orders: Item[]; reports: Item[]; notifications: Item[] }
const money = (value: unknown) => `${Number(value ?? 0).toLocaleString('ko-KR')}원`
const operationKey = () => `web-${crypto.randomUUID()}`
const sandboxPaymentEnabled = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER_MODE === 'portone_sandbox'

export default function PromotionOperationsClient({ initialState }: { initialState: State }) {
  const [state, setState] = useState(initialState)
  const [message, setMessage] = useState('')

  async function refresh() {
    const response = await fetch('/api/promotion-operations', { cache: 'no-store' })
    if (response.ok) setState(await response.json())
  }

  async function apply(body: Item) {
    const response = await fetch('/api/promotion-operations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, idempotency_key: operationKey() }) })
    const result = await response.json()
    setMessage(response.ok ? '요청을 안전하게 처리했습니다.' : result.error)
    if (response.ok) await refresh()
  }

  function paymentNotice(order: Item) {
    const amount = window.prompt(`입금 완료로 표시할 금액을 입력하세요. 주문 금액 ${money(order.total_krw)}`)
    if (!amount || !/^\d+$/.test(amount)) return
    void apply({ action: 'payment_notice', order_id: order.id, declared_amount_krw: Number(amount) })
  }

  async function startSandboxPayment(order: Item) {
    const response = await fetch('/api/payments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: order.id, provider: 'portone_sandbox', idempotency_key: `checkout-${crypto.randomUUID()}` }) })
    const result = await response.json()
    if (!response.ok || !result.checkoutUrl) return setMessage('Sandbox 결제 설정이 아직 준비되지 않았습니다.')
    window.location.assign(result.checkoutUrl)
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-xs font-bold tracking-[0.14em] text-gray-500">PROMOTION OPERATIONS · MANUAL PAYMENT</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">내 프로모션 운영</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">견적, 주문, 수동 입금 확인, 일정과 집계 성과를 한곳에서 확인합니다. 카드 결제와 자동 환불은 제공하지 않습니다.</p></div><a className="min-h-11 border px-4 py-3 text-sm font-semibold" href="/promote">새 신청</a></div>
      {message ? <p role="status" className="mt-5 border bg-gray-50 p-4 text-sm">{message}</p> : null}

      <section className="mt-9"><h2 className="text-xl font-bold">판매 중 상품</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{state.products.map((product) => <article key={String(product.id)} className="border p-4 text-sm"><p className="font-bold">{String(product.name)}</p><p className="mt-2 leading-6 text-gray-600">{String(product.description)}</p><p className="mt-3">{money(product.base_price_krw)} · {String(product.duration_days)}일 · {String(product.placement_type)}</p><p className="mt-1 text-xs text-gray-500">VAT {String(product.vat_display_mode)} · 정책 {String(product.price_policy_version)}</p></article>)}</div>{!state.products.length ? <p className="mt-3 text-sm text-gray-500">관리자가 판매 상품을 설정하면 여기에 표시됩니다.</p> : null}</section>

      <section className="mt-9"><h2 className="text-xl font-bold">견적</h2><div className="mt-3 grid gap-3">{state.quotes.map((quote) => <article key={String(quote.id)} className="border p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold">{String(quote.quote_number)} · {String(quote.status)}</p><p>{money(quote.total_krw)}</p></div><p className="mt-2 text-gray-600">만료 {String(quote.expires_at)} · 가격 정책 {String(quote.price_policy_version)}</p>{quote.status === 'issued' ? <div className="mt-4 flex gap-2"><button onClick={() => apply({ action: 'quote_response', quote_id: quote.id, response: 'accept' })} className="min-h-10 bg-gray-950 px-4 text-white">견적 수락</button><button onClick={() => apply({ action: 'quote_response', quote_id: quote.id, response: 'reject' })} className="min-h-10 border px-4">거절</button></div> : null}</article>)}</div>{!state.quotes.length ? <p className="mt-3 text-sm text-gray-500">발행된 견적이 없습니다.</p> : null}</section>

      <section className="mt-9"><h2 className="text-xl font-bold">주문·결제·일정</h2><div className="mt-3 grid gap-4">{state.orders.map((order) => { const cancellations = order.promotion_cancellation_requests as Item[] | undefined; const refunds = order.promotion_refunds as Item[] | undefined; const requestValue = Array.isArray(order.promotion_requests) ? order.promotion_requests[0] : order.promotion_requests; const request = requestValue as Item | undefined; const placements = request?.promotion_placements as Item[] | undefined; return <article key={String(order.id)} className="border p-5 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold">{String(order.order_number)} · {String(order.status)}</p><p>{money(order.total_krw)}</p></div><p className="mt-2 text-gray-600">확인 금액 {money(order.received_amount_krw)} · 환불 확인 {money(order.refunded_amount_krw)} · 결제 기한 {String(order.payment_due_at)}</p>{request ? <div className="mt-3 border p-3"><p className="text-xs font-bold text-gray-500">광고 미리보기 · 스폰서드</p><p className="mt-2 font-bold">{String(request.title)}</p><p className="mt-1 whitespace-pre-wrap text-gray-600">{String(request.body)}</p><p className="mt-2 text-xs">{String(request.requested_placement)} · 요청일 {String(request.requested_date)}</p>{placements?.map((slot) => <p key={String(slot.starts_at)} className="mt-1 text-xs">일정 {String(slot.starts_at)}~{String(slot.ends_at)} · {String(slot.status)}</p>)}</div> : null}<div className="mt-3 border bg-gray-50 p-3 text-xs leading-5 text-gray-600"><strong>수동 결제 안내</strong><br />실제 계좌·결제 정보는 이 화면이나 코드에 저장하지 않습니다. 운영자가 별도 안전 채널로 제공한 주문번호 기준 안내를 확인한 뒤 입금 완료만 표시하세요.</div>{['awaiting_payment', 'payment_review'].includes(String(order.status)) ? <>{sandboxPaymentEnabled ? <button onClick={() => void startSandboxPayment(order)} className="mt-3 min-h-10 bg-gray-950 px-4 text-white">Sandbox 자동결제</button> : null}<button onClick={() => paymentNotice(order)} className={`${sandboxPaymentEnabled ? 'ml-2 ' : ''}mt-3 min-h-10 border px-4`}>수동 입금 표시</button></> : null}{!['completed', 'cancelled', 'refund_pending', 'partial_refund', 'refunded', 'refund_unavailable', 'cancel_requested'].includes(String(order.status)) ? <button onClick={() => apply({ action: 'cancellation_request', order_id: order.id, reason_code: 'changed_mind' })} className="ml-2 mt-3 min-h-10 border px-4">취소 요청</button> : null}{cancellations?.map((item) => <p key={String(item.id)} className="mt-3 text-xs">취소 요청 · {String(item.status)} · {String(item.decision_reason_code ?? '')}</p>)}{refunds?.map((item) => <p key={String(item.id)} className="mt-1 text-xs">환불 · {String(item.status)} · 승인 {money(item.approved_amount_krw)} · 완료 {money(item.completed_amount_krw)}</p>)}</article> })}</div></section>

      <section className="mt-9"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">집계 성과</h2><a className="min-h-10 border px-3 py-2 text-sm" href="/api/promotion-operations/reports.csv">CSV 다운로드</a></div><div className="mt-3 grid gap-3">{state.reports.map((report) => { const impressions = Number(report.impressions ?? 0); const clicks = Number(report.clicks ?? 0); return <article key={String(report.id)} className="border p-4 text-sm"><p className="font-bold">{String(report.period_start)}~{String(report.period_end)} · {String(report.placement_type)}</p><p className="mt-2">노출 {impressions.toLocaleString()} · 클릭 {clicks.toLocaleString()} · CTR {impressions ? ((clicks / impressions) * 100).toFixed(2) : '0.00'}%</p><p className="mt-1 text-xs text-gray-500">개인별 방문 목록과 사용자 식별정보는 포함하지 않습니다.</p></article> })}</div></section>

      <section className="mt-9"><h2 className="text-xl font-bold">운영 알림</h2><div className="mt-3 grid gap-2">{state.notifications.map((notice) => <p key={String(notice.id)} className="border p-3 text-sm">{String(notice.event_type)} · {String(notice.status)} · {String(notice.created_at)}</p>)}</div></section>
    </main>
  )
}
