'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { SchoolAutocompleteResult } from '@/lib/api/search'
import { claimSchoolIntent, clearSchoolIntent, readSchoolIntent, saveSchoolIntent } from '@/lib/policy/schoolJourney'
import { schoolTypeLabel } from '@/lib/utils'

export function SchoolJoinButton({ slug }: { slug: string }) {
  const router = useRouter()
  const [unavailable, setUnavailable] = useState(false)
  return <div><button type="button" className="schoollove-dark-action schoollove-focus min-h-12 rounded-xl bg-[var(--schoollove-game-accent)] px-5 py-3 font-semibold text-white" onClick={() => {
    if (saveSchoolIntent(slug)) router.push('/account')
    else setUnavailable(true)
  }}>이 학교 함께 키우기</button>{unavailable && <p role="status" className="mt-3 text-sm leading-6">이 탭에 학교 선택을 보관할 수 없어요. <Link href="/account" className="underline">내 계정에서 학교를 직접 검색해 주세요.</Link></p>}</div>
}

type Props = {
  owner?: string
  registeredSlugs?: string[]
  onSelect?: (school: SchoolAutocompleteResult) => void
  writable?: boolean
  hasInput?: boolean
}
export default function SchoolSelection({ owner, registeredSlugs = [], onSelect, writable = false, hasInput = false }: Props) {
  const [school, setSchool] = useState<SchoolAutocompleteResult | null>(null)
  const [notice, setNotice] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const [selected, setSelected] = useState(false)
  useEffect(() => {
    setSchool(null); setNotice(''); setSelected(false)
    const intent = owner ? claimSchoolIntent(owner) : readSchoolIntent()
    if (!intent) return
    const controller = new AbortController()
    setExpiresAt(intent.expiresAt)
    fetch(`/api/schools/selection?slug=${encodeURIComponent(intent.slug)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('SCHOOL_UNAVAILABLE')
        const data = await response.json()
        if (controller.signal.aborted) return
        if (!data.school || data.school.slug !== intent.slug) throw new Error('SCHOOL_UNAVAILABLE')
        setSchool(data.school)
      }).catch(() => {
        if (!controller.signal.aborted) { clearSchoolIntent(); setNotice('선택한 학교를 확인하지 못했어요. 학교를 다시 선택해 주세요.') }
      })
    const timer = window.setTimeout(() => { clearSchoolIntent(); setSchool(null); setNotice('학교 선택이 만료됐어요. 학교를 다시 선택해 주세요.') }, Math.max(0, intent.expiresAt - Date.now()))
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [owner])
  const registered = Boolean(school && registeredSlugs.includes(school.slug))
  useEffect(() => { if (registered) clearSchoolIntent() }, [registered])
  if (!school && !notice) return null
  return <aside className="mt-5 rounded-xl border border-indigo-200 bg-[var(--schoollove-game-surface)] p-4" aria-label="선택한 학교">
    {school ? <>
      <p className="text-xs font-semibold text-[var(--schoollove-game-accent)]">{registered ? '이미 등록한 내 학교' : '아직 등록하지 않은 학교 후보'}</p>
      <p className="mt-2 font-bold">{school.school_name}</p>
      <p className="mt-1 text-sm text-schoollove-secondary">{school.sido} {school.sigungu} · {schoolTypeLabel(school.school_type)}</p>
      {registered ? <Link href="/account#my-schools-heading" className="schoollove-focus mt-2 inline-flex min-h-11 items-center underline">내 학교 성장 보기</Link> : <>
        <p className="mt-2 text-sm leading-6">지금 이 학교를 등록하려고 해요. 성인 확인과 동의를 마친 뒤 본인이 다닌 학교인지 확인하고 직접 저장해 주세요. 선택만으로 등록되지는 않아요.</p>
        {onSelect ? <button type="button" disabled={!writable || hasInput || selected} className="schoollove-focus mt-3 min-h-12 rounded-xl border border-indigo-700 px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => {
          if (!writable || hasInput || selected || Date.now() >= expiresAt) return
          onSelect(school); setSelected(true)
        }}>{selected ? '학교가 입력됐어요 · 졸업연도를 직접 입력해 주세요' : '이 학교를 등록 폼에 선택'}</button> : <p className="mt-2 text-xs leading-5">같은 탭에서 다음 단계로 이어가세요. 새 탭·새로고침·만료로 선택이 사라지면 학교를 다시 검색할 수 있어요.</p>}
        {hasInput && !selected && <p className="mt-2 text-sm">작성 중인 학교 정보를 덮어쓰지 않아요. 현재 입력을 먼저 확인해 주세요.</p>}
        {onSelect && !writable && <p className="mt-2 text-sm">먼저 필요한 가입 단계를 완료해 주세요. 현재 저장 권한은 변경되지 않아요.</p>}
      </>}
      <button type="button" onClick={() => { clearSchoolIntent(); setSchool(null); setNotice('학교 선택을 취소했어요. 등록 폼에서 직접 학교를 선택할 수 있어요.') }} className="schoollove-focus mt-2 block min-h-11 text-sm underline">학교 후보 지우기</button>
    </> : <p role="status" className="text-sm leading-6">{notice} <Link className="underline" href="/search">학교 다시 찾기</Link></p>}
  </aside>
}
