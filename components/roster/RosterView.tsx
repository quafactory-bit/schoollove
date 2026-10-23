'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Bell, Settings, Share } from 'lucide-react'
import Avatar from '@/components/Avatar'
import BrandMark from '@/components/BrandMark'
import NewMembersStrip from '@/components/NewMembersStrip'
import RosterRowButton from '@/components/roster/RosterRowButton'
import { useConnectionNotificationUnreadCount } from '@/components/ConnectionNotificationProvider'
import { formatGradeClassHistory } from '@/lib/accountGradeClass'
import {
  ROSTER_REQUEST_MESSAGE, filterRoster, inviteLink, newMembers, rosterEntryKey, rosterRowAction, rosterTabs,
  updateFirstSeen, type RosterEntry, type RosterTabKey,
} from '@/lib/policy/roster'

export type RosterSchool = {
  membershipId: string
  schoolId: string
  schoolName: string
  slug: string | null
  graduationYear: number
  rosterVisible: boolean
  status: 'ok' | 'unavailable'
  entries: RosterEntry[]
}

const SEEN_KEY = 'sl_roster_seen_v2:'
const SENT_KEY = 'sl_roster_sent_v2'

function readJson<T>(key: string, fallback: T): T {
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}
function writeJson(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* 로컬 기록은 선택 사항 */ }
}

// v2-06: 로그인 후 첫 화면인 "내 출석부"(목업 4번). 기존 명단 RPC 결과만 보여 주고,
// 인스타 요청은 기존 정확 검색 → 연결 요청 API를 메시지 없이(고정 문구) 그대로 부른다.
export default function RosterView({ schools, myName }: { schools: RosterSchool[]; myName: string | null }) {
  const unread = useConnectionNotificationUnreadCount()
  const [index, setIndex] = useState(0)
  const school = schools[Math.min(index, schools.length - 1)]
  const [tab, setTab] = useState<RosterTabKey>('mine')
  const [nameQuery, setNameQuery] = useState('')
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [firstSeen, setFirstSeen] = useState<Record<string, number>>({})
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const meKey = myName && school ? rosterEntryKey({ display_name: myName, graduation_year: school.graduationYear }) : null

  useEffect(() => {
    if (!school) return
    const now = Date.now()
    const next = updateFirstSeen(school.entries, readJson(SEEN_KEY + school.schoolId, {}), now)
    writeJson(SEEN_KEY + school.schoolId, next)
    setFirstSeen(next)
    setSent(new Set(readJson<string[]>(SENT_KEY, [])))
  }, [school])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const fresh = useMemo(() => school ? newMembers(school.entries, firstSeen, Date.now(), meKey ?? undefined) : [], [school, firstSeen, meKey])
  if (!school) return null
  const year = school.graduationYear
  const tabs = rosterTabs(school.entries, year)
  const freshKeys = new Set(fresh.map(rosterEntryKey))
  const rows = (showNewOnly ? fresh : filterRoster(school.entries, tab, year, nameQuery))

  async function copyInvite() {
    if (!school.slug) return
    const link = inviteLink(window.location.origin, school.slug, year)
    try { await navigator.clipboard.writeText(link); setToast('링크를 복사했어요. 친구에게 보내 보세요.') }
    catch { setToast(link) }
  }

  async function setVisible(visible: boolean) {
    if (!visible && !window.confirm('출석부에서 나를 숨길까요? 숨기면 나도 같은 학교 출석부를 볼 수 없어요.')) return
    const response = await fetch('/api/account/memberships', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ membership_id: school.membershipId, visible }) }).catch(() => null)
    if (!response?.ok) { setToast('설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'); return }
    // Preview 실사용 확인(10/23): router.refresh()만으로는 출석부가 바로 바뀌지 않아 새로 불러온다.
    window.location.reload()
  }

  async function request(entry: RosterEntry) {
    const key = rosterEntryKey(entry)
    setBusyKey(key)
    try {
      const search = await fetch('/api/connections/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school_id: school.schoolId, graduation_year: entry.graduation_year, exact_name: entry.display_name }) })
      const found = await search.json().catch(() => ({})) as { state?: string; matchToken?: string }
      if (!search.ok || found.state !== 'match_available' || !found.matchToken) {
        setToast(search.status === 429 ? '오늘은 요청을 더 보낼 수 없어요. 내일 다시 시도해 주세요.' : '지금은 이 사람에게 요청할 수 없어요.')
        return
      }
      const response = await fetch('/api/connections/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ match_token: found.matchToken, relationship_type: 'same_school', message: ROSTER_REQUEST_MESSAGE }) })
      if (response.ok || response.status === 409) {
        const next = new Set(sent).add(key)
        setSent(next); writeJson(SENT_KEY, [...next])
        setToast(response.ok ? '인스타 요청을 보냈어요. 상대가 수락하면 알려드려요.' : '이미 요청을 보낸 사람이에요.')
      } else setToast(response.status === 429 ? '오늘은 요청을 더 보낼 수 없어요. 내일 다시 시도해 주세요.' : '지금은 요청을 보낼 수 없어요.')
    } catch { setToast('지금은 요청을 보낼 수 없어요.') }
    finally { setBusyKey(null) }
  }

  return (
    <section aria-labelledby="roster-title" className="pb-4">
      <div className="flex h-12 items-center justify-between">
        <BrandMark />
        <div className="flex items-center gap-1">
          {school.slug ? <button type="button" aria-label={`${year}년 출석부 링크 복사`} onClick={() => void copyInvite()} className="schoollove-focus inline-flex h-10 w-10 items-center justify-center rounded-full text-sl-ink"><Share className="h-[22px] w-[22px]" aria-hidden="true" /></button> : null}
          <a href="#account-settings" aria-label="설정" className="schoollove-focus inline-flex h-10 w-10 items-center justify-center rounded-full text-sl-ink"><Settings className="h-[22px] w-[22px]" aria-hidden="true" /></a>
        </div>
      </div>

      {schools.length > 1 ? <label className="mt-1 block text-[13px] font-semibold text-sl-ink3"><span className="sr-only">학교 전환</span>
        <select value={index} onChange={event => { setIndex(Number(event.target.value)); setTab('mine'); setNameQuery(''); setShowNewOnly(false) }} className="schoollove-focus rounded-lg bg-sl-bg2 px-2 py-1 text-[13px] font-bold text-sl-ink2">
          {schools.map((item, itemIndex) => <option key={item.membershipId} value={itemIndex}>{item.schoolName} · {item.graduationYear}년</option>)}
        </select>
      </label> : <p className="mt-1 text-[13px] font-semibold text-sl-ink3">{school.schoolName}</p>}
      <h1 id="roster-title" className="mt-1 text-[28px] font-black leading-[1.15] tracking-[-0.6px] text-sl-ink">{year}년 졸업 · <span className="text-sl-brand">{tabs[0].count}명</span></h1>

      {unread ? <Link href="/notifications" className="schoollove-focus mt-3 flex items-center gap-2 rounded-[14px] bg-sl-ink px-3.5 py-3 text-[13.5px] font-bold text-white"><Bell className="h-4 w-4" aria-hidden="true" />새 알림 {unread > 9 ? '9+' : unread}개 — 알림에서 확인하고 수락하기 ›</Link> : null}

      {!school.rosterVisible ? <div className="mt-4 rounded-2xl bg-sl-bg2 px-4 py-4">
        <p className="text-[15px] font-extrabold text-sl-ink">출석부에서 숨겨져 있어요</p>
        <p className="mt-1 text-[13px] leading-[1.6] text-sl-ink2">다시 보이면 이름·졸업연도가 같은 학교 회원에게 보이고, 나도 같은 학교 출석부를 볼 수 있어요.</p>
        <button type="button" onClick={() => void setVisible(true)} className="btn-primary schoollove-focus mt-3 w-full">출석부에 다시 보이기</button>
      </div> : school.status === 'unavailable' ? <p role="status" className="mt-4 rounded-2xl bg-sl-bg2 px-4 py-4 text-sm text-sl-ink2">출석부를 잠시 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p> : <>
        <NewMembersStrip members={fresh} year={year} onShowAll={() => setShowNewOnly(true)} onInvite={() => void copyInvite()} />

        <div className="mt-3.5 flex gap-2 overflow-x-auto" role="tablist" aria-label="졸업연도">
          {tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={!showNewOnly && tab === item.key} onClick={() => { setTab(item.key); setShowNewOnly(false) }}
            className={`schoollove-focus whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-extrabold ${!showNewOnly && tab === item.key ? 'bg-sl-ink text-white' : 'bg-sl-bg2 text-sl-ink2'}`}>{item.label} · {item.count}</button>)}
        </div>
        <label className="mt-3 block"><span className="sr-only">이름으로 찾기</span>
          <input value={nameQuery} onChange={event => { setNameQuery(event.target.value); setShowNewOnly(false) }} placeholder="이름으로 찾기" className="schoollove-focus min-h-11 w-full rounded-xl bg-sl-bg2 px-3.5 text-[15px] font-semibold text-sl-ink" />
        </label>
        {showNewOnly ? <p className="mt-2 text-xs font-bold text-sl-brand-text">새로 들어온 동문만 보는 중 · <button type="button" onClick={() => setShowNewOnly(false)} className="underline">전체 보기</button></p> : null}

        <ul className="mt-1">
          {rows.length === 0 ? <li className="py-6 text-center text-sm text-sl-ink2">{nameQuery ? '이 이름은 출석부에 없어요.' : '아직 이 연도에 등록한 동문이 없어요.'}</li> : null}
          {rows.map(entry => {
            const key = rosterEntryKey(entry)
            const action = rosterRowAction(entry, meKey, sent)
            return <li key={key} className="flex min-h-16 items-center gap-3 border-b border-sl-line last:border-b-0">
              <Avatar name={entry.display_name} />
              <p className="min-w-0 flex-1 text-[16.5px] font-extrabold tracking-[-0.2px] text-sl-ink">
                <span className="break-all">{entry.display_name}</span>
                {action === 'me' ? <span className="ml-1.5 rounded-full bg-sl-brand-soft px-2 py-0.5 align-middle text-[11px] font-extrabold text-sl-brand-text">나</span>
                  : freshKeys.has(key) ? <span className="ml-1.5 rounded-full bg-sl-brand-soft px-2 py-0.5 align-middle text-[11px] font-extrabold text-sl-brand-text">새로 옴</span> : null}
                <small className="mt-0.5 block text-[12.5px] font-semibold text-sl-ink3">{entry.graduation_year}년 졸업{entry.class_history.length ? ` · ${formatGradeClassHistory(entry.class_history)}` : ''}</small>
              </p>
              <RosterRowButton action={action} busy={busyKey === key} onRequest={() => void request(entry)} onHide={() => void setVisible(false)} />
            </li>
          })}
        </ul>

        {school.slug ? <>
          {/* 새 동문이 0명이면 위 띠 자리에 이미 같은 버튼이 있어서 아래에는 링크만 둔다. */}
          {fresh.length > 0 ? <button type="button" onClick={() => void copyInvite()} className="btn-secondary schoollove-focus mt-4 w-full text-[15px]">친구 부르기 — {year}년 링크 복사</button> : null}
          <p className="mt-1.5 text-center text-xs text-sl-ink3"><Link href={`/school/${encodeURIComponent(school.slug)}/${year}`} className="underline">/school/{school.slug}/{year}</Link></p>
        </> : null}
        <p className="mt-3 text-center text-[12.5px] leading-[1.55] text-sl-ink3">인스타 요청은 한 사람에게 한 번이에요. 상대가 수락하면 연결되고, 상대가 허용한 인스타 주소를 알림 탭에서 볼 수 있어요.</p>
      </>}

      {toast ? <p role="status" className="schoollove-dark-action fixed inset-x-4 bottom-24 z-50 mx-auto max-w-[568px] rounded-2xl bg-sl-ink px-3.5 py-3 text-[13.5px] font-bold text-white shadow-lg">{toast}</p> : null}
    </section>
  )
}
