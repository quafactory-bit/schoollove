'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { buildGrowthShareUrl } from '@/lib/growthReferral'
import SchoolWorld from '@/components/game/SchoolWorld'

export default function GrowthShareButton({ schoolId, schoolName, slug }: { schoolId: string; schoolName: string; slug: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const manual = useRef<HTMLTextAreaElement>(null)
  const pending = useRef(false)
  const generation = useRef(0)
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null)
  const [message, setMessage] = useState('')
  const [fallback, setFallback] = useState('')
  const [nativeAvailable, setNativeAvailable] = useState(false)
  const invitation = `${schoolName}, 우리 학교 같이 키워보자!\n스쿨러브아이에서 내 학교를 비공개로 등록하고 성장을 함께 확인해요.`
  useEffect(() => {
    generation.current += 1; setLink(null); setFallback(''); setMessage('')
    return () => { generation.current += 1 }
  }, [schoolId, slug])
  useEffect(() => {
    if (!link) return
    const timer = window.setTimeout(() => { setLink(null); setFallback(''); setMessage('링크가 만료됐어요. 필요하면 새 링크 준비를 눌러 주세요.') }, Math.max(0, link.expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [link])
  function currentUrl() {
    if (link && link.expiresAt > Date.now()) return link.url
    setLink(null); setFallback(''); setMessage('먼저 친구 링크를 준비해 주세요. 만료된 링크는 사용하지 않아요.')
    return null
  }
  async function prepare() {
    if (pending.current || (link && link.expiresAt > Date.now())) return
    pending.current = true; setBusy(true); setMessage(''); setFallback('')
    const version = generation.current
    try {
      const response = await fetch('/api/growth/referral', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId }) })
      const data = await response.json()
      if (!response.ok || !Number.isInteger(data.expiresIn) || data.expiresIn <= 0 || data.expiresIn > 604800) throw new Error('SHARE_UNAVAILABLE')
      const url = buildGrowthShareUrl(window.location.origin, slug, data.token)
      if (generation.current === version) { setLink({ url, expiresAt: Date.now() + data.expiresIn * 1000 }); setMessage('준비됐어요. 공유 또는 초대 문구 복사를 선택해 주세요.') }
    } catch { if (generation.current === version) setMessage('친구 링크를 준비하지 못했어요. 로그인·학교 등록 상태를 확인한 뒤 다시 시도해 주세요. 일반 학교 링크는 아래에서 복사할 수 있어요.') }
    finally { pending.current = false; setBusy(false) }
  }
  async function copy(url: string) {
    const text = `${invitation}\n${url}`
    try { await navigator.clipboard.writeText(text); setFallback(''); setMessage('학교 이름·초대 문구·링크를 복사했어요. 원하는 곳에 직접 붙여 넣어 주세요.') }
    catch { setFallback(text); setMessage('자동 복사가 차단됐어요. 아래 문구를 선택해 직접 복사해 주세요.') }
  }
  async function share() {
    const url = currentUrl()
    if (!url) return
    try { await navigator.share({ title: `${schoolName} · 스쿨러브아이`, text: invitation, url }); setMessage('공유 창을 마쳤어요.') }
    catch (error) { setMessage(error instanceof Error && error.name === 'AbortError' ? '공유를 취소했어요. 자동 복사는 하지 않았어요.' : '공유 창을 열지 못했어요. 초대 문구 복사를 이용해 주세요.') }
  }
  async function copyLinkOnly() {
    const url = currentUrl()
    if (!url) return
    try { await navigator.clipboard.writeText(url); setFallback(''); setMessage('링크만 복사했어요. 원하는 곳에 직접 붙여 넣어 주세요.') }
    catch { setFallback(url); setMessage('자동 복사가 차단됐어요. 아래 링크를 선택해 직접 복사해 주세요.') }
  }
  return <div>
    <button type="button" onClick={() => { setNativeAvailable(typeof navigator.share === 'function'); dialog.current?.showModal() }} className="schoollove-dark-action schoollove-focus inline-flex min-h-12 items-center rounded-xl bg-[var(--schoollove-game-accent)] px-5 py-3 text-base font-semibold text-white">친구 불러서 학교 키우기</button>
    <dialog ref={dialog} aria-labelledby={titleId} className="growth-journey sl-game sl-share-dialog m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-schoollove-border bg-white p-5 text-schoollove-text shadow-xl backdrop:bg-black/40 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h2 id={titleId} className="text-xl font-bold">친구에게 전할 미리보기</h2><button type="button" onClick={() => dialog.current?.close()} className="schoollove-focus min-h-11 min-w-11 rounded-lg border border-schoollove-border px-2 text-sm">닫기</button></div>
      <div className="sl-share-preview mt-4 break-words p-4"><p className="text-sm font-bold">SchoolLove · 우리 학교 함께 키우기</p><SchoolWorld mode="share" /><p className="sl-share-headline">친구와 함께<br />더 높이 올라가요!</p><h3 className="mt-3 text-lg font-bold">{schoolName}</h3><p className="mt-2 text-sm leading-6">{invitation}</p><p className="mt-3 text-sm text-schoollove-secondary">공유에는 학교 이름과 공개 학교 링크만 들어가요. 내 이름·졸업연도·반·개인 성장 수치는 넣지 않아요.</p></div>
      <p className="mt-4 text-sm leading-6">미리보기만 열면 링크를 만들지 않아요. 친구 링크는 준비 후 최대 7일간 유효해요. 같은 학교 신규 참여 조건을 충족할 때만 성장이 반영되며, 복사·공유만으로 XP가 생기지 않아요. 베타 초대와도 별개예요.</p>
      {!link ? <button type="button" disabled={busy} onClick={() => void prepare()} className="schoollove-dark-action schoollove-focus mt-4 min-h-12 w-full rounded-xl bg-[var(--schoollove-game-accent)] px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? '링크 준비 중…' : '친구 링크 준비'}</button> : <div className="mt-4 grid gap-2">
        {nativeAvailable && <button type="button" onClick={() => void share()} className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-[var(--schoollove-game-accent)] px-4 py-3 font-semibold text-white">공유 앱 선택</button>}
        <button type="button" onClick={() => { const url = currentUrl(); if (url) void copy(url) }} className="schoollove-focus min-h-12 rounded-xl border border-indigo-700 px-4 py-3 font-semibold">초대 문구와 링크 복사</button>
        <button type="button" onClick={() => void copyLinkOnly()} className="schoollove-focus min-h-11 rounded-xl border border-schoollove-border px-4 py-2 text-sm">링크만 복사</button>
      </div>}
      <button type="button" onClick={() => void copy(`${window.location.origin}/school/${encodeURIComponent(slug)}`)} className="schoollove-focus mt-3 min-h-11 text-sm underline">추천 없이 일반 학교 링크 복사</button>
      <p className="text-xs leading-5 text-schoollove-secondary">일반 링크에는 추천 정보가 없으며 추천 성장 보상이 연결되지 않아요.</p>
      <p role="status" aria-live="polite" className="mt-3 text-sm leading-6">{message}</p>
      {fallback && <div className="mt-3"><label htmlFor={`${titleId}-manual`} className="text-sm font-semibold">직접 복사할 문구</label><textarea ref={manual} id={`${titleId}-manual`} readOnly value={fallback} onFocus={event => event.currentTarget.select()} className="mt-2 min-h-32 w-full rounded-xl border border-schoollove-border p-3 text-sm"/><button type="button" className="schoollove-focus min-h-11 text-sm underline" onClick={() => { manual.current?.focus(); manual.current?.select() }}>문구 전체 선택</button></div>}
    </dialog>
  </div>
}
