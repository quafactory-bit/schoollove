'use client'

import { useCallback, useEffect, useState } from 'react'
import { sendFunnelEvent } from '@/lib/part2FunnelClient'
import {
  STATUS_NOTE_MAX, STATUS_TAGS, STATUS_TAG_MAX, SUMMONS_DAILY_LIMIT, SUMMONS_NAME_ERRORS,
  checkStatusTags, checkSummonsName, type StatusTag,
} from '@/lib/part2P3'

type Board = { locked: true; members: number; needed: number } | { locked: false; members: number; needed: number; entries: Array<{ display_name: string; tags: string[]; note: string | null }> }
type OwnSummons = { share_code: string; target_name: string; graduation_year: number; school_name: string; hidden: boolean }

// Part 2 P3: 내 출석부 아래 — 우리 학년 칠판(3명부터 열림), 내 근황 태그, 지명 소환장.
export default function MemberTools({ schoolId, schoolName, year }: { schoolId: string; schoolName: string; year: number }) {
  return (
    <div className="mt-6 space-y-4">
      <YearChalkboard schoolId={schoolId} year={year} />
      <StatusTagsEditor />
      <SummonsCreator schoolId={schoolId} schoolName={schoolName} year={year} />
    </div>
  )
}

function YearChalkboard({ schoolId, year }: { schoolId: string; year: number }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/part2/chalkboard?school_id=${encodeURIComponent(schoolId)}&year=${year}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { board?: Board }
        if (alive) { if (response.ok && body.board) setBoard(body.board); else setFailed(true) }
      })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [schoolId, year])
  if (failed || !board) return null
  if (board.locked) {
    const left = Math.max(0, board.needed - board.members)
    return (
      <section aria-labelledby="board-lock" className="rounded-2xl border border-[#d97706]/40 bg-[#fffbeb] px-4 py-4">
        <h2 id="board-lock" className="break-keep text-[15px] font-black text-[#92400e]">같은 학교·졸업연도 동창 {left}명만 더 출석하면 [우리 학년 비밀 칠판]이 열립니다!</h2>
        <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-[#fde68a]" role="progressbar" aria-valuemin={0} aria-valuemax={board.needed} aria-valuenow={board.members} aria-label="우리 학년 출석 수">
          <div className="h-full rounded-full bg-[#d97706]" style={{ width: `${Math.min(100, (board.members / board.needed) * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-[13px] font-bold text-[#92400e]">현재 {board.members}/{board.needed}명</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="board-open" className="rounded-2xl border-[6px] border-[#8b5e34] bg-[#14532d] px-4 py-4 text-[#fcfaf5]">
      <h2 id="board-open" className="text-[15px] font-black">우리 학년 비밀 칠판 · {board.members}명 출석</h2>
      {board.entries.length === 0
        ? <p className="mt-2 text-[13px] text-[#fcfaf5]/80">아직 근황을 적은 동창이 없어요. 아래에서 내 근황을 먼저 적어 보세요.</p>
        : <ul className="mt-2 space-y-1.5">{board.entries.map((entry, index) => (
          <li key={`${entry.display_name}-${index}`} className="text-[14px] leading-[1.5]"><b>{entry.display_name}</b>{entry.tags.length ? ` · ${entry.tags.join(' · ')}` : ''}{entry.note ? ` · ‘${entry.note}’` : ''}</li>
        ))}</ul>}
      <p className="mt-2 text-[11.5px] text-[#fcfaf5]/60">같은 학교·졸업연도에 출석한 회원만 볼 수 있어요.</p>
    </section>
  )
}

function StatusTagsEditor() {
  const [tags, setTags] = useState<StatusTag[]>([])
  const [note, setNote] = useState('')
  const [show, setShow] = useState(false)
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    fetch('/api/account/status-tags', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { status?: { tags: StatusTag[]; note: string | null; show_on_school_page: boolean } }
      if (response.ok && body.status) { setTags(body.status.tags ?? []); setNote(body.status.note ?? ''); setShow(Boolean(body.status.show_on_school_page)) }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])
  function toggle(tag: StatusTag) {
    setMessage('')
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : current.length >= STATUS_TAG_MAX ? current : [...current, tag])
  }
  async function save() {
    const checked = checkStatusTags({ tags, note, show_on_school_page: show })
    if (!checked.ok) return setMessage(checked.reason === 'note_contact' ? '한마디에는 연락처·링크·아이디를 적을 수 없어요.' : `한마디는 ${STATUS_NOTE_MAX}자까지예요.`)
    const response = await fetch('/api/account/status-tags', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(checked.value) }).catch(() => null)
    setMessage(response?.ok ? '근황을 저장했어요.' : '지금은 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
  if (!loaded) return null
  return (
    <section aria-labelledby="status-tags" className="rounded-2xl border border-sl-line px-4 py-4">
      <h2 id="status-tags" className="text-[15px] font-extrabold text-sl-ink">내 근황 (선택, 최대 {STATUS_TAG_MAX}개)</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {STATUS_TAGS.map((tag) => <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}
          className={`schoollove-focus min-h-10 rounded-full px-3.5 text-[14px] font-bold ${tags.includes(tag) ? 'bg-[#14532d] text-white' : 'bg-sl-bg2 text-sl-ink2'}`}>{tag}</button>)}
      </div>
      <label className="mt-3 block text-[13px] font-bold text-sl-ink2">한마디 ({STATUS_NOTE_MAX}자)
        <input value={note} maxLength={STATUS_NOTE_MAX + 10} onChange={(event) => { setNote(event.target.value); setMessage('') }} placeholder="반가워! 잘 지내?" className="schoollove-focus mt-1 block min-h-11 w-full rounded-xl bg-sl-bg2 px-3.5 text-[16px] text-sl-ink" />
      </label>
      <label className="mt-3 flex items-start gap-2.5 text-[13.5px] font-semibold leading-[1.45] text-sl-ink">
        <input type="checkbox" checked={show} onChange={(event) => { setShow(event.target.checked); setMessage('') }} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16a34a]" />
        <span>학교 페이지에 보이기 <small className="block font-medium text-sl-ink3">켜면 로그인하지 않은 방문자에게도 가린 이름(김O수) 옆에 근황·한마디가 보여요. 끄면 같은 학교·졸업연도 회원의 칠판에만 보여요.</small></span>
      </label>
      <button type="button" onClick={() => void save()} className="btn-secondary schoollove-focus mt-3 w-full text-[15px]">근황 저장</button>
      {message ? <p role="status" className="mt-2 text-[13px] font-bold text-sl-ink2">{message}</p> : null}
    </section>
  )
}

function SummonsCreator({ schoolId, schoolName, year }: { schoolId: string; schoolName: string; year: number }) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [own, setOwn] = useState<OwnSummons[]>([])
  const load = useCallback(() => {
    fetch('/api/summons/own', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { summons?: OwnSummons[] }
      if (response.ok && Array.isArray(body.summons)) setOwn(body.summons)
    }).catch(() => undefined)
  }, [])
  useEffect(() => { load() }, [load])

  async function share(code: string, targetName: string) {
    sendFunnelEvent('summons_share_clicked')
    const url = `${window.location.origin}/summons/${code}`
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    try {
      if (typeof nav.share === 'function') { await nav.share({ title: `출석부 알림 · ${targetName}님을 찾고 있어요`, url }); return }
      await navigator.clipboard.writeText(url)
      setMessage('링크를 복사했어요. 인스타 스토리나 단톡방에 붙여 넣어 보세요.')
    } catch { setMessage(url) }
  }
  async function create() {
    const checked = checkSummonsName(name)
    if (!checked.ok) return setMessage(SUMMONS_NAME_ERRORS[checked.reason])
    const response = await fetch('/api/summons/own', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school_id: schoolId, graduation_year: year, target_name: checked.value }) }).catch(() => null)
    const body = await response?.json().catch(() => ({})) as { share_code?: string; message?: string } | undefined
    if (!response?.ok || !body?.share_code) return setMessage(body?.message ?? '지금은 소환장을 만들 수 없어요.')
    setName(''); setMessage('소환장을 만들었어요. 아래에서 공유해 보세요.'); load()
  }
  async function hide(code: string) {
    if (!window.confirm('이 소환장을 내릴까요?')) return
    await fetch('/api/summons/own', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ share_code: code }) }).catch(() => null)
    load()
  }
  const active = own.filter((item) => !item.hidden)
  return (
    <section aria-labelledby="summons-create" className="rounded-2xl border border-sl-line px-4 py-4">
      <h2 id="summons-create" className="text-[15px] font-extrabold text-sl-ink">지명 소환장 보내기</h2>
      <p className="mt-1 break-keep text-[13px] leading-[1.55] text-sl-ink2">“{schoolName} {year}년 졸업생 누군가가 ‘김민수’님을 찾고 있습니다” 카드를 만들어 공유해요. 만든 사람은 카드에 나오지 않아요. 하루 {SUMMONS_DAILY_LIMIT}장까지.</p>
      <div className="mt-2.5 flex gap-2">
        <input value={name} maxLength={20} onChange={(event) => { setName(event.target.value); setMessage('') }} placeholder="찾는 친구 이름" aria-label="찾는 친구 이름" className="schoollove-focus min-h-11 min-w-0 flex-1 rounded-xl bg-sl-bg2 px-3.5 text-[16px] font-bold text-sl-ink" />
        <button type="button" onClick={() => void create()} className="btn-primary schoollove-focus min-h-11 shrink-0 px-4 text-[15px]">만들기</button>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-[1.5] text-sl-ink3">카드에는 학교·졸업연도·이름만 들어가요. 이름이 올라간 사람은 카드에서 바로 내릴 수 있어요. 90일 뒤 자동으로 닫혀요.</p>
      {message ? <p role="status" className="mt-2 text-[13px] font-bold text-sl-ink2">{message}</p> : null}
      {active.length ? <ul className="mt-2.5 divide-y divide-sl-line">{active.map((item) => (
        <li key={item.share_code} className="flex min-h-12 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-sl-ink">‘{item.target_name}’님 소환장</span>
          <button type="button" onClick={() => void share(item.share_code, item.target_name)} className="schoollove-focus min-h-10 rounded-full bg-[#14532d] px-3 text-[13px] font-bold text-white">공유</button>
          <button type="button" onClick={() => void hide(item.share_code)} className="schoollove-focus min-h-10 px-2 text-[13px] font-semibold text-sl-ink3 underline">내리기</button>
        </li>
      ))}</ul> : null}
    </section>
  )
}
