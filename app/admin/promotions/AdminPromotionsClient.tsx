'use client'

import { useEffect, useState } from 'react'

type Item = Record<string, unknown>
type State = { accounts: Item[]; requests: Item[]; reports: Item[] }

export default function AdminPromotionsClient() {
  const [state, setState] = useState<State | null>(null)
  const [message, setMessage] = useState('')

  async function load() {
    const response = await fetch('/api/admin/promotions', { cache: 'no-store' })
    setState(response.ok ? await response.json() : null)
    if (!response.ok) setMessage('관리자 인증 또는 PHASE 10D 데이터베이스가 필요합니다.')
  }
  useEffect(() => { void load() }, [])

  async function action(body: Item) {
    const response = await fetch('/api/admin/promotions', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    const result = await response.json()
    setMessage(response.ok ? '작업을 적용하고 감사 기록을 남겼습니다.' : result.error)
    if (response.ok) await load()
  }

  function verifyAccount(account: Item) {
    const verification = (account.promotion_account_verifications as Item[] | undefined)?.find((item) => !item.used_at && !item.verified_at)
    if (!verification) return
    const code = window.prompt('Instagram 프로필에서 확인한 코드를 입력하세요.')
    if (code) void action({ action: 'verify_account', verification_id: verification.id, verification_code: code })
  }

  function confirmPayment(request: Item) {
    const reference = window.prompt('민감 금융정보가 아닌 내부 결제 확인 참조를 입력하세요.')
    if (reference) void action({ action: 'payment_confirmed', request_id: request.id, internal_reference: reference })
  }

  function schedule(request: Item) {
    const startsAt = window.prompt('시작 시각을 ISO 8601 형식으로 입력하세요.')
    const endsAt = window.prompt('종료 시각을 ISO 8601 형식으로 입력하세요.')
    if (startsAt && endsAt) void action({ action: 'scheduled', request_id: request.id, starts_at: startsAt, ends_at: endsAt })
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-bold">프로모션 운영</h1>
      <p className="mt-2 text-sm text-gray-600">자동 승인은 없습니다. 계정 소유, 문구·이미지 권리, 학교 공식성 오인, 미성년자 위험, 결제와 배치 충돌을 사람이 검수합니다.</p>
      {message ? <p role="status" className="mt-4 border p-3 text-sm">{message}</p> : null}
      {!state ? null : <>
        <section className="mt-8">
          <h2 className="text-xl font-bold">계정 검증</h2>
          <div className="mt-3 grid gap-3">{state.accounts.map((account) => (
            <article key={String(account.id)} className="border p-4 text-sm">
              <p className="font-semibold">{String(account.display_name)} · {String(account.account_type)} · {String(account.status)}</p>
              <a className="mt-1 block break-all underline" href={String(account.instagram_url)} target="_blank" rel="noopener noreferrer">Instagram 프로필 확인</a>
              <p className="mt-2 text-xs text-gray-500">프로필의 임시 코드를 직접 대조합니다. 비밀번호·쿠키·토큰은 수집하지 않습니다.</p>
              {account.status === 'pending_verification' ? <button onClick={() => verifyAccount(account)} className="mt-3 min-h-10 bg-gray-950 px-3 text-white">소유 코드 확인</button> : null}
            </article>
          ))}</div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">신청 검수·결제·배치</h2>
          <div className="mt-3 grid gap-3">{state.requests.map((request) => {
            const placements = request.promotion_placements as Item[] | undefined
            const placement = placements?.[0]
            return <article key={String(request.id)} className="border p-4 text-sm">
              <p className="font-semibold">{String(request.title)} · {String(request.status)}</p>
              <p className="mt-2 whitespace-pre-wrap">{String(request.body)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['pending_review', 'changes_requested'].includes(String(request.status)) ? <>
                  <button onClick={() => action({ action: 'changes_requested', request_id: request.id, reason_code: 'creative', note: '문구 또는 이미지를 수정해 주세요.' })} className="min-h-10 border px-3">수정 요청</button>
                  <button onClick={() => action({ action: 'rejected', request_id: request.id, reason_code: 'safety' })} className="min-h-10 border px-3">거절</button>
                  <button onClick={() => action({ action: 'approved', request_id: request.id, amount_krw: 10000 })} className="min-h-10 bg-gray-950 px-3 text-white">검수 승인·가격 확정</button>
                </> : null}
                {request.status === 'payment_pending' ? <button onClick={() => confirmPayment(request)} className="min-h-10 bg-gray-950 px-3 text-white">수동 결제 확인</button> : null}
                {request.status === 'payment_confirmed' ? <button onClick={() => schedule(request)} className="min-h-10 bg-gray-950 px-3 text-white">KST 배치 예약</button> : null}
                {request.status === 'scheduled' && placement ? <button onClick={() => action({ action: 'activate', placement_id: placement.id })} className="min-h-10 bg-gray-950 px-3 text-white">기간 확인 후 활성화</button> : null}
                {request.status === 'active' && placement ? <button onClick={() => action({ action: 'pause', placement_id: placement.id })} className="min-h-10 border border-red-500 px-3 text-red-700">일시 중단</button> : null}
                {request.status === 'paused' && placement ? <button onClick={() => action({ action: 'resume', placement_id: placement.id })} className="min-h-10 border px-3">재개</button> : null}
              </div>
            </article>
          })}</div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">공개 신고</h2>
          <div className="mt-3 grid gap-3">{state.reports.map((report) => (
            <article key={String(report.id)} className="border border-red-200 p-4 text-sm">
              <p>{String(report.reason_code)} · {String(report.created_at)}</p>
              <button onClick={() => action({ action: 'pause', placement_id: report.placement_id })} className="mt-3 min-h-10 bg-red-700 px-3 text-white">즉시 중단</button>
            </article>
          ))}</div>
        </section>
      </>}
    </main>
  )
}
