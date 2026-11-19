'use client'

import { useState } from 'react'

// Part 2 P3: required "내 이름이 올라갔어요 · 내려 주세요" link and a report button on every summons page.
export default function SummonsPublicActions({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'taken_down' | 'reported' | 'error' | 'limited'>('idle')

  async function send(action: 'takedown' | 'report') {
    if (action === 'takedown' && !window.confirm('이 소환장을 바로 내릴까요? 내리면 링크로 더 이상 볼 수 없어요.')) return
    setState('busy')
    try {
      const response = await fetch(`/api/summons/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ share_code: code }) })
      if (response.status === 429) return setState('limited')
      if (!response.ok) return setState('error')
      setState(action === 'takedown' ? 'taken_down' : 'reported')
    } catch {
      setState('error')
    }
  }

  if (state === 'taken_down') return <p role="status" className="mt-6 rounded-xl bg-sl-bg2 px-4 py-3 text-sm font-bold text-sl-ink">소환장을 내렸어요. 이 링크로는 더 이상 보이지 않아요.</p>
  return (
    <div className="mt-6 border-t border-sl-line pt-4 text-center">
      <button type="button" disabled={state === 'busy'} onClick={() => void send('takedown')} className="schoollove-focus min-h-11 text-[14px] font-extrabold text-[#b45309] underline">
        내 이름이 올라갔어요 · 내려 주세요
      </button>
      <div>
        <button type="button" disabled={state === 'busy' || state === 'reported'} onClick={() => void send('report')} className="schoollove-focus mt-1 min-h-11 text-[13px] font-semibold text-sl-ink3 underline">
          {state === 'reported' ? '신고했어요. 확인 후 조치할게요.' : '부적절한 소환장 신고'}
        </button>
      </div>
      {state === 'error' ? <p role="alert" className="mt-1 text-[13px] text-sl-ink2">지금은 처리하지 못했어요. <a href="/contact" className="underline">문의 및 삭제 요청</a>으로 알려 주세요.</p> : null}
      {state === 'limited' ? <p role="alert" className="mt-1 text-[13px] text-sl-ink2">잠시 후 다시 시도해 주세요. 급하면 <a href="/contact" className="underline">문의 및 삭제 요청</a>으로 알려 주세요.</p> : null}
    </div>
  )
}
