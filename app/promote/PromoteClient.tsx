'use client'

import { FormEvent, useState } from 'react'

type State = { accounts: Array<Record<string, unknown>>; requests: Array<Record<string, unknown>> }

export default function PromoteClient({ initialState }: { initialState: State }) {
  const [state, setState] = useState(initialState)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState({ title: '', body: '', image: '' })

  async function refresh() {
    const response = await fetch('/api/promotions/accounts', { cache: 'no-store' })
    if (response.ok) setState(await response.json())
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const accountType = String(form.get('account_type'))
    const body: Record<string, string> = {
      account_type: accountType, instagram_url: String(form.get('instagram_url')),
      display_name: String(form.get('display_name')),
    }
    if (accountType === 'business') {
      body.business_name = String(form.get('business_name'))
      body.business_contact_name = String(form.get('business_contact_name'))
      body.business_registration_reference = String(form.get('business_registration_reference'))
      body.business_category = String(form.get('business_category'))
    }
    const response = await fetch('/api/promotions/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    setMessage(response.ok ? 'Instagram 계정을 등록했습니다. 소유 확인 코드를 발급해 주세요.' : result.error)
    if (response.ok) await refresh()
  }

  async function issueCode(accountId: string) {
    const response = await fetch(`/api/promotions/accounts/${accountId}/verification`, { method: 'POST' })
    const result = await response.json()
    setMessage(response.ok ? `30분 안에 Instagram 소개에 ${result.code} 를 표시해 주세요. 운영자 확인 후 삭제할 수 있습니다.` : result.error)
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const body = {
      account_id: String(form.get('account_id')), title: String(form.get('title')), body: String(form.get('body')),
      image_url: String(form.get('image_url')), landing_url: String(form.get('landing_url')),
      requested_placement: String(form.get('requested_placement')), requested_date: String(form.get('requested_date')),
      school_affiliation_claimed: form.get('school_affiliation_claimed') === 'on',
      rights_confirmed: form.get('rights_confirmed') === 'on', adult_and_ownership_confirmed: form.get('adult_and_ownership_confirmed') === 'on',
    }
    const response = await fetch('/api/promotions/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const result = await response.json()
    setMessage(response.ok ? '검수 신청을 접수했습니다. 결제는 승인·가격 안내 후 수동 확인합니다.' : result.error)
    if (response.ok) await refresh()
  }

  async function cancelRequest(requestId: string) {
    if (!window.confirm('결제 확인 전 신청을 취소할까요?')) return
    const response = await fetch(`/api/promotions/requests/${requestId}`, { method: 'DELETE' })
    const result = await response.json()
    setMessage(response.ok ? '신청을 취소했습니다.' : result.error)
    if (response.ok) await refresh()
  }

  const verified = state.accounts.filter((item) => item.status === 'verified')
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-xs font-bold tracking-[0.14em] text-gray-500">TODAY INSTAGRAM · MVP</p>
      <h1 className="mt-3 text-3xl font-bold text-gray-950">오늘의 Instagram 신청</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">만 19세 이상 본인 소유 계정만 신청할 수 있습니다. 자동 승인은 없으며, 검수와 수동 결제 확인 뒤에만 스폰서드로 노출됩니다.</p>
      {message ? <div role="status" className="mt-5 border border-gray-300 bg-gray-50 p-4 text-sm">{message}</div> : null}

      <section className="mt-9 border border-gray-200 p-5">
        <h2 className="text-lg font-bold">1. Instagram 소유 확인</h2>
        <form onSubmit={createAccount} className="mt-5 grid gap-4">
          <select name="account_type" className="min-h-11 border px-3" defaultValue="personal"><option value="personal">개인</option><option value="business">사업자</option></select>
          <input name="instagram_url" required type="url" placeholder="https://www.instagram.com/account" className="min-h-11 border px-3" />
          <input name="display_name" required maxLength={60} placeholder="공개할 계정명" className="min-h-11 border px-3" />
          <details><summary className="cursor-pointer text-sm font-semibold">사업자 신청 정보</summary><div className="mt-3 grid gap-3"><input name="business_name" placeholder="사업자명" className="min-h-11 border px-3" /><input name="business_contact_name" placeholder="담당자명" className="min-h-11 border px-3" /><input name="business_registration_reference" placeholder="사업자등록번호 또는 검수 참조" className="min-h-11 border px-3" /><input name="business_category" placeholder="업종" className="min-h-11 border px-3" /></div></details>
          <button className="min-h-11 bg-gray-950 px-4 font-semibold text-white">계정 등록</button>
        </form>
        <div className="mt-5 space-y-3">{state.accounts.map((account) => <div key={String(account.id)} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><span>{String(account.display_name)} · {String(account.status)}</span>{account.status === 'pending_verification' ? <button onClick={() => issueCode(String(account.id))} className="min-h-10 border px-3 font-semibold">인증 코드 발급</button> : null}</div>)}</div>
      </section>

      <section className="mt-6 border border-gray-200 p-5">
        <h2 className="text-lg font-bold">2. 스폰서드 검수 신청</h2>
        <p className="mt-2 text-xs text-gray-500">이미지는 공개 버킷에 올리지 않습니다. 이번 MVP는 운영자가 접근 가능한 HTTPS 이미지 URL을 검수하며, 공개 노출에는 승인된 URL만 사용합니다.</p>
        <form onSubmit={submitRequest} className="mt-5 grid gap-4">
          <select name="account_id" required className="min-h-11 border px-3"><option value="">검증된 계정 선택</option>{verified.map((account) => <option key={String(account.id)} value={String(account.id)}>{String(account.display_name)}</option>)}</select>
          <input name="title" required maxLength={80} placeholder="소개 제목" className="min-h-11 border px-3" onChange={(e) => setPreview((v) => ({ ...v, title: e.target.value }))} />
          <textarea name="body" required maxLength={300} placeholder="소개 문구" className="min-h-28 border p-3" onChange={(e) => setPreview((v) => ({ ...v, body: e.target.value }))} />
          <input name="image_url" required type="url" placeholder="검수용 HTTPS 이미지 URL" className="min-h-11 border px-3" onChange={(e) => setPreview((v) => ({ ...v, image: e.target.value }))} />
          <input name="landing_url" required type="url" placeholder="Instagram 또는 안전한 HTTPS 랜딩 URL" className="min-h-11 border px-3" />
          <select name="requested_placement" className="min-h-11 border px-3"><option value="homepage_today">홈</option><option value="content_feed">콘텐츠 피드</option></select>
          <input name="requested_date" required type="date" className="min-h-11 border px-3" />
          <label className="flex gap-2 text-sm"><input name="rights_confirmed" type="checkbox" required /> 이미지·문구 사용 권리를 보유합니다.</label>
          <label className="flex gap-2 text-sm"><input name="adult_and_ownership_confirmed" type="checkbox" required /> 만 19세 이상이며 본인 소유 계정을 신청합니다.</label>
          <label className="flex gap-2 text-sm"><input name="school_affiliation_claimed" type="checkbox" /> 학교 관련 배치는 별도 소속 검수가 필요함을 확인합니다.</label>
          <button disabled={!verified.length} className="min-h-11 bg-gray-950 px-4 font-semibold text-white disabled:opacity-40">검수 신청</button>
        </form>
        <div className="mt-6 border bg-gray-50 p-4"><p className="text-xs font-bold text-gray-500">미리보기 · 스폰서드</p>{preview.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview.image} alt="" className="mt-3 aspect-video w-full object-cover" /> : null}<h3 className="mt-3 font-bold">{preview.title || '소개 제목'}</h3><p className="mt-1 text-sm text-gray-600">{preview.body || '검수할 소개 문구가 표시됩니다.'}</p></div>
      </section>

      <section className="mt-6 border border-gray-200 p-5"><h2 className="text-lg font-bold">신청 상태와 집계</h2><div className="mt-4 space-y-3">{state.requests.map((request) => { const metrics = request.metrics as { impressions?: number; clicks?: number } | undefined; const cancellable = ['pending_review', 'changes_requested', 'payment_pending'].includes(String(request.status)); return <div key={String(request.id)} className="border-t pt-3 text-sm"><p className="font-semibold">{String(request.title)} · {String(request.status)}</p><p className="mt-1 text-gray-500">노출 {metrics?.impressions ?? 0} · 클릭 {metrics?.clicks ?? 0} · 개인별 방문 목록은 제공하지 않습니다.</p>{cancellable ? <button onClick={() => cancelRequest(String(request.id))} className="mt-2 min-h-10 border px-3">신청 취소</button> : null}</div> })}</div></section>
      <p className="mt-6 text-xs leading-5 text-gray-500">브라우저 임시 저장·자동 결제·자동 승인 기능은 이번 MVP 범위에 포함되지 않습니다. 법률 자문을 대체하지 않는 운영 초안입니다.</p>
    </main>
  )
}
