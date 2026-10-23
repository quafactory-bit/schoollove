'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { OnboardingState } from '@/lib/onboarding'
import type { SchoolAutocompleteResult } from '@/lib/api/search'
import { useSchoolAutocomplete } from '@/lib/hooks/useSchoolAutocomplete'
import { buildGradeClassPayload, gradeNumbersForSchoolType } from '@/lib/accountGradeClass'
import { graduationYearRange, graduationYearRangeNotice } from '@/lib/policy/adultEligibility'
import { buildSignupSteps, signupFormErrors, type SignupChecks } from '@/lib/policy/signup'
import { clearSchoolIntent, readSchoolIntent } from '@/lib/policy/schoolJourney'
import { clearFirstTouch, readFirstTouch } from '@/lib/signupAttribution'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import PageNav from '@/components/PageNav'
import CollectionNotice from '@/components/privacy/CollectionNotice'

// v2-05: 가입 한 화면(목업 2번). Google 로그인 뒤 이름·생년월일·학교·졸업연도·체크 3개를 한 번에 받고
// 기존 API를 아직 끝나지 않은 단계만 순서대로 부른다. 중간에 실패하면 앞 단계 결과는 남고 다시 누르면 이어서 저장한다.
const stepFailure: Record<string, string> = {
  eligibility: '성인 확인을 저장하지 못했어요.',
  consents: '동의를 저장하지 못했어요.',
  profile: '이름을 저장하지 못했어요.',
  membership: '학교를 등록하지 못했어요.',
}

export default function OnboardingClient() {
  const [state, setState] = useState<OnboardingState | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [schoolQuery, setSchoolQuery] = useState('')
  const [school, setSchool] = useState<SchoolAutocompleteResult | null>(null)
  const [graduationYear, setGraduationYear] = useState('')
  const [gradeClassValues, setGradeClassValues] = useState<Record<number, string>>({})
  const [checks, setChecks] = useState<SignupChecks>({ adult: false, roster: false, terms: false })
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const schools = useSchoolAutocomplete(school ? '' : schoolQuery)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/onboarding?source=direct', { cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as { state?: OnboardingState }
      if (!response.ok || !body.state) throw new Error('ONBOARDING_STATE_UNAVAILABLE')
      if (body.state.complete) { window.location.replace('/account'); return }
      setState(body.state); setLoadError(false)
    } catch { setLoadError(true) }
  }, [])
  useEffect(() => { void load() }, [load])

  // 로그인 전 학교 페이지에서 고른 학교(기존 학교 intent)를 이어받는다.
  useEffect(() => {
    const intent = readSchoolIntent()
    if (!intent) return
    const controller = new AbortController()
    fetch(`/api/schools/selection?slug=${encodeURIComponent(intent.slug)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { school?: SchoolAutocompleteResult }
        if (response.ok && data.school?.slug === intent.slug) choose(data.school)
      }).catch(() => { /* 직접 검색하면 된다 */ })
    return () => controller.abort()
  }, [])

  function choose(next: SchoolAutocompleteResult) {
    setSchool(next); setSchoolQuery(next.school_name); setGraduationYear(''); setGradeClassValues({})
  }

  const yearOptions = school ? (({ min, max }) => Array.from({ length: max - min + 1 }, (_, index) => max - index))(graduationYearRange(school.school_type)) : []
  const gradeNumbers = gradeNumbersForSchoolType(school?.school_type ?? null)
  const progress = state ?? { adultReady: false, consentsReady: false, profileReady: false, schoolReady: false }
  const form = { displayName, birthDate, schoolId: school?.id ?? '', schoolType: school?.school_type ?? null, graduationYear, checks }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!state) return
    const found = signupFormErrors(form, progress)
    setErrors(found)
    if (found.length) return
    setBusy(true)
    for (const step of buildSignupSteps(form, progress, buildGradeClassPayload(gradeClassValues), readFirstTouch())) {
      const response = await fetch(step.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(step.payload) }).catch(() => null)
      const body = await response?.json().catch(() => ({})) as { error?: string; attribution_recorded?: boolean } | undefined
      if (!response?.ok) {
        setErrors([`${stepFailure[step.key]} ${body?.error ?? '잠시 후 다시 눌러 주세요.'}`])
        setBusy(false)
        await load()
        return
      }
      if (step.key === 'profile' && body?.attribution_recorded === true) clearFirstTouch()
    }
    clearSchoolIntent()
    window.location.replace('/account')
  }

  const paused = state?.stage === 'access_paused'
  return <main className="sl-onboarding mx-auto min-h-screen max-w-content bg-white pb-8">
    <PageNav title="내 학교 등록" back={false} right={<span className="text-[13px] font-bold text-sl-ink3">2/3</span>} />
    <div className="px-4">
      <div className="mb-3 mt-1 flex gap-1.5" aria-hidden="true"><i className="h-1 flex-1 rounded bg-sl-brand" /><i className="h-1 flex-1 rounded bg-sl-brand" /><i className="h-1 flex-1 rounded bg-sl-line" /></div>
      <h1 className="text-[28px] font-black leading-[1.15] tracking-[-0.6px] text-sl-ink">내 학교를<br />등록해요</h1>
      <p className="mt-2 text-[15px] leading-[1.45] text-sl-ink2">등록하면 같은 학교 출석부가 바로 보여요.</p>

      {loadError ? <div role="alert" className="mt-5 rounded-[14px] bg-sl-bg2 px-4 py-3 text-sm text-sl-ink2">시작 상태를 불러오지 못했어요. <button type="button" onClick={() => void load()} className="schoollove-focus font-bold underline">다시 시도</button></div> : null}
      {!state && !loadError ? <p role="status" className="mt-5 text-sm text-sl-ink2">불러오는 중…</p> : null}
      {paused ? <p role="status" className="mt-5 rounded-[14px] bg-sl-warn-soft px-4 py-3 text-sm text-sl-warn-text">지금은 계정 정보를 저장할 수 없어요. <Link href="/account" className="underline">내 계정</Link>에서 상태를 확인해 주세요.</p> : null}

      {state && !paused ? <form onSubmit={submit} noValidate>
        {!state.profileReady ? <label className="mt-3.5 block">
          <span className="mb-1.5 block text-[13px] font-extrabold text-sl-ink2">출석부에 보일 이름</span>
          <input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={50} autoComplete="name" placeholder="실명을 적으면 친구가 알아보기 쉬워요" className="schoollove-focus min-h-[52px] w-full rounded-xl bg-sl-bg2 px-3.5 text-[17px] font-extrabold text-sl-ink" />
        </label> : null}

        <div className="relative mt-3.5">
          <label htmlFor="signup-school" className="mb-1.5 block text-[13px] font-extrabold text-sl-ink2">학교</label>
          <input id="signup-school" role="combobox" aria-expanded={!school && schools.results.length > 0} aria-controls="signup-school-options" autoComplete="off" value={schoolQuery}
            onChange={event => { setSchoolQuery(event.target.value); setSchool(null); setGraduationYear(''); setGradeClassValues({}) }}
            placeholder="학교 이름을 검색하세요" className="schoollove-focus min-h-[52px] w-full rounded-xl bg-sl-bg2 px-3.5 text-[17px] font-extrabold text-sl-ink" />
          {school ? <p className="mt-1 text-xs font-semibold text-sl-ink3">{school.sido} {school.sigungu} · {SCHOOL_TYPE_LABELS[school.school_type]}</p> : null}
          {!school && schools.results.length > 0 ? <div id="signup-school-options" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-sl-line bg-white p-1 shadow-lg">
            {schools.results.map(result => <button key={result.id} type="button" role="option" aria-selected={false} onMouseDown={event => event.preventDefault()} onClick={() => choose(result)} className="block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-sl-bg2">
              <span className="font-bold text-sl-ink">{result.school_name}</span><span className="ml-2 text-xs text-sl-ink3">{result.sido} {result.sigungu} · {SCHOOL_TYPE_LABELS[result.school_type]}</span>
            </button>)}
          </div> : null}
          {!school && schools.status === 'error' ? <p className="mt-1 text-xs text-sl-ink2">지금은 학교 검색을 불러올 수 없어요. 잠시 후 다시 입력해 주세요.</p> : null}
        </div>

        <label className="mt-3.5 block">
          <span className="mb-1.5 block text-[13px] font-extrabold text-sl-ink2">졸업연도</span>
          <select value={graduationYear} disabled={!school} onChange={event => setGraduationYear(event.target.value)} className="schoollove-focus min-h-[52px] w-full rounded-xl bg-sl-bg2 px-3.5 text-[17px] font-extrabold text-sl-ink">
            <option value="">{school ? '졸업연도 선택' : '학교를 먼저 선택해 주세요'}</option>
            {yearOptions.map(year => <option key={year} value={year}>{year}년</option>)}
          </select>
        </label>
        {school ? <p className="mt-2.5 rounded-xl bg-sl-warn-soft px-3 py-2.5 text-[12.5px] font-semibold leading-[1.5] text-sl-warn-text">{graduationYearRangeNotice(school.school_type)}</p> : null}

        {gradeNumbers.length > 0 ? <details className="mt-3 rounded-xl border border-sl-line px-3.5 py-2">
          <summary className="schoollove-focus min-h-9 cursor-pointer py-1.5 text-sm font-bold text-sl-ink2">반 입력 (선택)</summary>
          <div className="grid grid-cols-3 gap-2 pb-2">{gradeNumbers.map(grade => <label key={grade} className="text-xs font-semibold text-sl-ink2">{grade}학년 반
            <input type="number" min={1} max={100} inputMode="numeric" value={gradeClassValues[grade] ?? ''} onChange={event => setGradeClassValues(current => ({ ...current, [grade]: event.target.value }))} className="schoollove-focus mt-1 min-h-11 w-full rounded-lg bg-sl-bg2 px-2 text-base font-bold text-sl-ink" />
          </label>)}</div>
        </details> : null}

        {!state.adultReady ? <label className="mt-3.5 block">
          <span className="mb-1.5 block text-[13px] font-extrabold text-sl-ink2">생년월일</span>
          <input type="date" value={birthDate} onChange={event => setBirthDate(event.target.value)} className="schoollove-focus min-h-[52px] w-full rounded-xl bg-sl-bg2 px-3.5 text-[17px] font-extrabold text-sl-ink" />
          <span className="mt-1 block text-xs leading-5 text-sl-ink3">만 19세 이상인지 계산하는 데만 쓰고 저장하지 않아요. 자기진술 방식이며 신분증 기반 본인확인이 아닙니다.</span>
        </label> : null}

        <div className="mt-3.5 rounded-2xl border border-sl-line px-3.5">
          {([
            ['adult', <>만 19세 이상 본인이에요. 본인 정보만 등록해요.</>],
            ['roster', <>이름·졸업연도가 같은 학교 회원에게 보여요. 언제든 숨길 수 있어요. 인스타 주소 등 나머지는 비공개예요.</>],
            ['terms', <><Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy#collection" className="underline">개인정보 수집·이용</Link> 동의</>],
          ] as const).map(([key, label]) => <label key={key} className="flex min-h-12 items-start gap-3 border-t border-sl-line py-3 text-[14.5px] font-semibold leading-[1.4] text-sl-ink first:border-t-0">
            <input type="checkbox" checked={checks[key]} onChange={event => setChecks(current => ({ ...current, [key]: event.target.checked }))} className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-[#0f7b5f]" />
            <span>{label}</span>
          </label>)}
        </div>
        <details className="mt-2 text-xs text-sl-ink3"><summary className="schoollove-focus min-h-9 cursor-pointer py-1.5 font-semibold">필수 개인정보 수집·이용 안내 보기</summary><div className="pb-2"><CollectionNotice /></div></details>

        {errors.length ? <ul role="alert" className="mt-3 space-y-1 rounded-xl bg-sl-warn-soft px-3 py-2.5 text-[13px] font-semibold text-sl-warn-text">{errors.map(error => <li key={error}>{error}</li>)}</ul> : null}
        <button disabled={busy} className="btn-primary schoollove-focus mt-3.5 w-full">{busy ? '등록하는 중…' : '등록하고 출석부 보기'}</button>
      </form> : null}
    </div>
  </main>
}
