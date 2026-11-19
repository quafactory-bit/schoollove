'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendFunnelEvent } from '@/lib/part2FunnelClient'
import { saveSchoolIntent } from '@/lib/policy/schoolJourney'
import { CHALKBOARD_NOTE_MAX, checkInitials, checkNote, readChalkboardDraft, saveChalkboardDraft } from '@/lib/part2Chalkboard'

const INITIALS_ERRORS = {
  length: '초성은 2~4글자로 적어 주세요. (예: 김ㅇ수)',
  characters: '한글 초성만 적을 수 있어요. (예: 김ㅇ수)',
  full_name: '이름 전체 대신 초성을 섞어 주세요. (예: 김민수 → 김ㅇ수)',
} as const

// Part 2 P1: 0명인 졸업연도의 비로그인 칠판. 입력은 이 브라우저(localStorage)에만 둔다.
export default function Chalkboard({ slug, year, canStart }: { slug: string; year: number; canStart: boolean }) {
  const router = useRouter()
  const [initials, setInitials] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const draft = readChalkboardDraft()
    if (draft && draft.slug === slug && draft.year === year) {
      setInitials(draft.initials)
      setNote(draft.note)
      setSaved(true)
    }
  }, [slug, year])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const checked = checkInitials(initials)
    if (!checked.ok) return setError(INITIALS_ERRORS[checked.reason])
    const noteChecked = checkNote(note)
    if (!noteChecked.ok) return setError(noteChecked.reason === 'length' ? `한마디는 ${CHALKBOARD_NOTE_MAX}자까지예요.` : '한마디에는 연락처·링크·아이디를 적을 수 없어요.')
    if (!saveChalkboardDraft({ slug, year, initials: checked.value, note: noteChecked.value })) return setError('이 브라우저에 저장할 수 없어요. 로그인 뒤 다시 적어 주세요.')
    setError(null)
    setInitials(checked.value)
    setNote(noteChecked.value)
    setSaved(true)
    if (!started) { setStarted(true); sendFunnelEvent('chalkboard_initials_started') }
  }

  return (
    <section aria-labelledby="chalkboard-title" className="mt-4 rounded-2xl border-[6px] border-[#8b5e34] bg-[#14532d] px-4 py-4 text-[#fcfaf5] shadow-inner">
      <h2 id="chalkboard-title" className="break-keep text-[17px] font-black leading-[1.4]">우리 학년 1대 반장(첫 출석자) 자리가 비어 있어요!</h2>
      <p className="mt-1.5 break-keep text-[13.5px] leading-[1.55] text-[#fcfaf5]/85">찾는 친구 초성(예: 김ㅇ수)과 한마디를 칠판에 먼저 적어두세요.</p>
      <form onSubmit={submit} className="mt-3 space-y-2.5" noValidate>
        <label className="block text-[12.5px] font-bold">찾는 친구 초성
          <input value={initials} onChange={(e) => { setInitials(e.target.value); setSaved(false) }} maxLength={8} inputMode="text" autoComplete="off" placeholder="김ㅇ수" className="schoollove-focus mt-1 block h-11 w-full rounded-lg border border-white/30 bg-white/10 px-3 text-[16px] font-bold text-white placeholder:text-white/40" />
        </label>
        <label className="block text-[12.5px] font-bold">한마디 <span className="font-medium text-white/60">(선택, {CHALKBOARD_NOTE_MAX}자)</span>
          <input value={note} onChange={(e) => { setNote(e.target.value); setSaved(false) }} maxLength={CHALKBOARD_NOTE_MAX + 10} autoComplete="off" placeholder="반가워! 잘 지내?" className="schoollove-focus mt-1 block h-11 w-full rounded-lg border border-white/30 bg-white/10 px-3 text-[16px] text-white placeholder:text-white/40" />
        </label>
        {error ? <p role="alert" className="text-[13px] font-bold text-[#fbbf24]">{error}</p> : null}
        <button type="submit" className="schoollove-focus h-11 w-full rounded-lg bg-[#fcfaf5] text-[15px] font-black text-[#14532d]">{saved ? '칠판에 적어 뒀어요 ✓' : '칠판에 적기'}</button>
      </form>
      {saved ? <div className="mt-3 rounded-lg bg-black/20 px-3 py-2.5">
        <p className="text-[13px] leading-[1.55]">이 칠판 내용은 <b>이 휴대폰에만</b> 저장돼요. 로그인하면 가입 화면으로 이어져요.</p>
        {canStart ? <button type="button" className="schoollove-focus mt-2 h-11 w-full rounded-lg bg-[#d97706] text-[15px] font-black text-white" onClick={() => { saveSchoolIntent(slug); router.push(`/login?next=${encodeURIComponent(`/school/${slug}/${year}`)}`) }}>Google로 1대 반장 출석하기</button> : null}
      </div> : <p className="mt-2.5 text-[11.5px] leading-[1.5] text-white/60">로그인 전에는 서버에 저장하지 않아요. 연락처·아이디는 적을 수 없어요.</p>}
    </section>
  )
}
