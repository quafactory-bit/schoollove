'use client'

import { FormEvent, useEffect, useState } from 'react'

type Item = Record<string, unknown>
type State = { products: Item[]; requests: Item[]; quotes: Item[]; orders: Item[]; paymentQueue: Item[]; cancellations: Item[]; refunds: Item[]; outbox: Item[]; reports: Item[]; calendar: Item[] }
const empty: State = { products: [], requests: [], quotes: [], orders: [], paymentQueue: [], cancellations: [], refunds: [], outbox: [], reports: [], calendar: [] }
const money = (value: unknown) => `${Number(value ?? 0).toLocaleString('ko-KR')}원`
const operationKey = () => `admin-${crypto.randomUUID()}`

export default function AdminPromotionOperationsClient() {
  const [state, setState] = useState<State>(empty)
  const [message, setMessage] = useState('')

  async function load() {
    const response = await fetch('/api/admin/promotion-operations', { cache: 'no-store' })
    if (response.ok) setState(await response.json())
    else setMessage('관리자 인증 또는 PHASE 10E 데이터베이스가 필요합니다.')
  }
  useEffect(() => { void load() }, [])

  async function apply(body: Item) {
    const response = await fetch('/api/admin/promotion-operations', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    setMessage(response.ok ? '원자적 상태 변경과 감사 기록을 완료했습니다.' : result.error)
    if (response.ok) await load()
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const placement = String(form.get('placement_type'))
    void apply({ action: 'upsert_product', product: {
      product_code: String(form.get('product_code')), name: String(form.get('name')), description: String(form.get('description')),
      placement_type: placement, duration_days: Number(form.get('duration_days')), image_width: Number(form.get('image_width')),
      image_height: Number(form.get('image_height')), title_limit: Number(form.get('title_limit')), body_limit: Number(form.get('body_limit')),
      base_price_krw: Number(form.get('base_price_krw')), vat_display_mode: String(form.get('vat_display_mode')),
      allows_school_targeting: placement === 'school_page', allows_region_targeting: placement === 'region_page',
      sale_status: String(form.get('sale_status')), price_policy_version: String(form.get('price_policy_version')),
    } })
  }

  function issueQuote(request: Item, productId: string) {
    const expiresAt = window.prompt('견적 만료 시각을 ISO 8601로 입력하세요.', new Date(Date.now() + 7 * 86400000).toISOString())
    if (expiresAt) void apply({ action: 'issue_quote', request_id: request.id, product_id: productId, expires_at: expiresAt })
  }

  function editProduct(product: Item) {
    const price = window.prompt('새 기본 가격(KRW)', String(product.base_price_krw))
    const version = window.prompt('새 가격 정책 version', String(product.price_policy_version))
    const saleStatus = window.prompt('판매 상태: draft / active / paused / retired', String(product.sale_status))
    if (!price || !/^\d+$/.test(price) || !version || !['draft', 'active', 'paused', 'retired'].includes(saleStatus ?? '')) return
    void apply({ action: 'upsert_product', product: {
      product_id: product.id, product_code: product.product_code, name: product.name, description: product.description,
      placement_type: product.placement_type, duration_days: Number(product.duration_days), image_width: Number(product.image_width),
      image_height: Number(product.image_height), title_limit: Number(product.title_limit), body_limit: Number(product.body_limit),
      base_price_krw: Number(price), vat_display_mode: product.vat_display_mode,
      allows_school_targeting: Boolean(product.allows_school_targeting), allows_region_targeting: Boolean(product.allows_region_targeting),
      sale_status: saleStatus, price_policy_version: version,
    } })
  }

  function confirmPayment(submission: Item) {
    const amount = window.prompt('실제로 외부에서 확인한 이번 입금 금액만 입력하세요.')
    const status = window.prompt('현재 누적 기준 상태: exact / under / partial / over', 'exact')
    if (amount && /^\d+$/.test(amount) && ['exact', 'under', 'partial', 'over'].includes(status ?? '')) void apply({ action: 'confirm_payment', order_id: submission.order_id, submission_id: submission.id, confirmed_amount_krw: Number(amount), match_status: status, idempotency_key: operationKey() })
  }

  function schedule(order: Item) {
    const startsAt = window.prompt('시작 시각 ISO 8601')
    const endsAt = window.prompt('종료 시각 ISO 8601')
    if (startsAt && endsAt) void apply({ action: 'schedule', order_id: order.id, starts_at: startsAt, ends_at: endsAt })
  }

  return (
    <main className="admin-ui mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">프로모션 반복 운영</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">가격은 상품 카탈로그에서만 정하고 견적 snapshot으로 보존합니다. 결제·환불은 외부 처리 후 여기서 수동 확인하며 금융정보는 입력하지 않습니다.</p></div><a href="/admin/promotions" className="min-h-11 border px-4 py-3 text-sm">검수 화면</a></div>
      {message ? <p role="status" className="mt-4 border p-3 text-sm">{message}</p> : null}

      <section className="mt-8 border p-5"><h2 className="text-xl font-bold">상품·가격 정책</h2><form onSubmit={saveProduct} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input required name="product_code" placeholder="상품 코드" className="min-h-11 border px-3" /><input required name="name" placeholder="상품명" className="min-h-11 border px-3" /><input required name="description" placeholder="설명" className="min-h-11 border px-3 sm:col-span-2" /><select name="placement_type" className="min-h-11 border px-3"><option value="homepage_today">홈</option><option value="school_page">학교</option><option value="region_page">지역</option><option value="content_feed">콘텐츠 피드</option></select><input required name="duration_days" type="number" min="1" max="31" placeholder="기간(일)" className="min-h-11 border px-3" /><input required name="image_width" type="number" min="320" defaultValue="1080" aria-label="이미지 너비" className="min-h-11 border px-3" /><input required name="image_height" type="number" min="320" defaultValue="1080" aria-label="이미지 높이" className="min-h-11 border px-3" /><input required name="title_limit" type="number" min="20" max="80" defaultValue="80" aria-label="제목 제한" className="min-h-11 border px-3" /><input required name="body_limit" type="number" min="50" max="300" defaultValue="300" aria-label="본문 제한" className="min-h-11 border px-3" /><input required name="base_price_krw" type="number" min="1000" placeholder="기본 가격" className="min-h-11 border px-3" /><select name="vat_display_mode" className="min-h-11 border px-3"><option value="included">VAT 포함</option><option value="excluded">VAT 별도</option><option value="not_applicable">VAT 해당 없음</option></select><select name="sale_status" className="min-h-11 border px-3"><option value="draft">초안</option><option value="active">판매 중</option><option value="paused">일시 중단</option><option value="retired">종료</option></select><input required name="price_policy_version" placeholder="가격 정책 version" className="min-h-11 border px-3" /><button className="min-h-11 bg-gray-950 px-4 font-semibold text-white">상품 저장</button></form><div className="mt-4 grid gap-2">{state.products.map((product) => <div key={String(product.id)} className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"><span><strong>{String(product.name)}</strong> · {String(product.placement_type)} · {money(product.base_price_krw)} · {String(product.sale_status)} · v{String(product.catalog_version)}</span><button onClick={() => editProduct(product)} className="min-h-9 border px-3">가격·상태 수정</button></div>)}</div></section>

      <section className="mt-8"><h2 className="text-xl font-bold">검수 승인·견적 발행</h2><div className="mt-3 grid gap-3">{state.requests.map((request) => { const compatible = state.products.filter((product) => product.sale_status === 'active' && product.placement_type === request.requested_placement); return <article key={String(request.id)} className="border p-4 text-sm"><p className="font-bold">{String(request.title)} · {String(request.requested_placement)} · {String(request.status)}</p><div className="mt-3 flex flex-wrap gap-2">{compatible.map((product) => <button key={String(product.id)} onClick={() => issueQuote(request, String(product.id))} className="min-h-10 bg-gray-950 px-3 text-white">{String(product.name)} · {money(product.base_price_krw)}</button>)}</div>{!compatible.length ? <p className="mt-2 text-gray-500">같은 placement의 판매 중 상품을 먼저 만드세요.</p> : null}</article> })}</div></section>

      <section className="mt-8"><h2 className="text-xl font-bold">입금 확인 queue</h2><div className="mt-3 grid gap-3">{state.paymentQueue.map((submission) => <article key={String(submission.id)} className="border p-4 text-sm"><p>주문 {String(submission.order_id)} · 신고 금액 {money(submission.declared_amount_krw)} · {String(submission.submitted_at)}</p><button onClick={() => confirmPayment(submission)} className="mt-3 min-h-10 bg-gray-950 px-3 text-white">외부 입금 수동 확인</button></article>)}</div></section>

      <section className="mt-8"><h2 className="text-xl font-bold">취소·환불</h2><div className="mt-3 grid gap-3">{state.cancellations.map((item) => <article key={String(item.id)} className="border p-4 text-sm"><p>{String(item.reason_code)} · 주문 {String(item.order_id)}</p><div className="mt-3 flex gap-2"><button onClick={() => apply({ action: 'decide_cancellation', cancellation_id: item.id, decision: 'approve', refund_amount_krw: 0, reason_code: 'approved' })} className="min-h-10 bg-gray-950 px-3 text-white">환불 없음 승인</button><button onClick={() => { const amount = window.prompt('승인할 환불 예정 금액'); if (amount && /^\d+$/.test(amount)) void apply({ action: 'decide_cancellation', cancellation_id: item.id, decision: 'approve', refund_amount_krw: Number(amount), reason_code: 'approved' }) }} className="min-h-10 border px-3">환불 예정 승인</button><button onClick={() => apply({ action: 'decide_cancellation', cancellation_id: item.id, decision: 'reject', refund_amount_krw: 0, reason_code: 'policy' })} className="min-h-10 border px-3">거절</button></div></article>)}{state.refunds.filter((item) => ['pending', 'partial'].includes(String(item.status))).map((item) => <article key={String(item.id)} className="border p-4 text-sm"><p>환불 {String(item.status)} · 승인 {money(item.approved_amount_krw)} · 외부 완료 {money(item.completed_amount_krw)}</p><div className="mt-3 flex gap-2"><button onClick={() => apply({ action: 'confirm_refund', refund_id: item.id, status: 'completed', completed_amount_krw: Number(item.approved_amount_krw), reason_code: 'external_refund_confirmed' })} className="min-h-10 bg-gray-950 px-3 text-white">외부 환불 완료 확인</button><button onClick={() => apply({ action: 'confirm_refund', refund_id: item.id, status: 'unavailable', completed_amount_krw: Number(item.completed_amount_krw), reason_code: 'external_refund_unavailable' })} className="min-h-10 border px-3">환불 불가</button></div></article>)}</div></section>

      <section className="mt-8"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">KST 운영 캘린더</h2><a href="/api/admin/promotion-operations/calendar.csv" className="min-h-10 border px-3 py-2 text-sm">안전한 CSV</a></div><div className="mt-3 grid gap-3">{state.orders.map((order) => <article key={String(order.id)} className="border p-4 text-sm"><p className="font-bold">{String(order.order_number)} · {String(order.status)}</p><div className="mt-3 flex flex-wrap gap-2">{order.status === 'payment_confirmed' ? <button onClick={() => schedule(order)} className="min-h-10 bg-gray-950 px-3 text-white">예약</button> : null}{order.status === 'scheduled' ? <button onClick={() => apply({ action: 'delivery', order_id: order.id, transition: 'activate' })} className="min-h-10 border px-3">활성화</button> : null}{order.status === 'active' ? <button onClick={() => apply({ action: 'delivery', order_id: order.id, transition: 'pause' })} className="min-h-10 border px-3">중단</button> : null}{order.status === 'paused' ? <button onClick={() => apply({ action: 'delivery', order_id: order.id, transition: 'resume' })} className="min-h-10 border px-3">재개</button> : null}{['active', 'paused'].includes(String(order.status)) ? <button onClick={() => apply({ action: 'delivery', order_id: order.id, transition: 'complete' })} className="min-h-10 border px-3">종료</button> : null}<button onClick={() => { const start = window.prompt('보고 시작일 YYYY-MM-DD'); const end = window.prompt('보고 종료일 YYYY-MM-DD'); if (start && end) void apply({ action: 'generate_report', order_id: order.id, period_start: start, period_end: end }) }} className="min-h-10 border px-3">집계 보고 생성</button></div></article>)}{state.calendar.map((slot) => <p key={String(slot.id)} className="border p-3 text-sm">{String(slot.slot_date)} · {String(slot.placement_type)} · {String(slot.context_key)} · {String(slot.status)}</p>)}</div></section>

      <section className="mt-8"><h2 className="text-xl font-bold">알림 outbox</h2><div className="mt-3 grid gap-2">{state.outbox.map((notice) => <div key={String(notice.id)} className="flex flex-wrap items-center justify-between gap-3 border p-3 text-sm"><span>{String(notice.event_type)} · {String(notice.status)} · 시도 {String(notice.attempts)}</span><div className="flex gap-2"><button onClick={() => apply({ action: 'notification', notification_id: notice.id, status: 'sent' })} className="min-h-9 border px-3">내부 전달 완료</button><button onClick={() => apply({ action: 'notification', notification_id: notice.id, status: 'retry' })} className="min-h-9 border px-3">재시도</button></div></div>)}</div></section>
    </main>
  )
}
