'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { normalizeInsta, registerPeople, type PersonInput } from './registerPeople'
import {
  addPerson,
  createPerson,
  PROFILE_MESSAGE_MAX_LENGTH,
  removePerson,
  updatePerson,
} from './personFormState'
import { getGrowthRewardCopy } from './growthRewardCopy'
import RegistrationSuccessFeedback, {
  type RegistrationSuccessContext,
} from '@/components/RegistrationSuccessFeedback'
import CaptchaWidget, { type CaptchaStatus, type CaptchaWidgetHandle } from '@/components/CaptchaWidget'
import type { RegistrationGrowthReward } from '@/types/registration'
import {
  gradeForSchoolType,
  parseSubmitPrefill,
  SUBMIT_MAX_GRADUATION_YEAR,
  SUBMIT_MIN_GRADUATION_YEAR,
} from './prefill'

// PHASE 9 — 공개 site key만 client에서 참조한다(비밀 키는 서버 전용
// lib/security/captcha.ts에서만 읽음). 빌드 시점에 값이 없으면 등록 폼 자체를 막는다
// (§4 "site key 누락 → 등록 UI에서 제출 불가 또는 명확한 오류").
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

type SchoolLite = {
  id: string
  school_name: string
  school_type: string
  sido: string | null
  sigungu: string | null
  slug: string
}

const TYPE_LABEL: Record<string, string> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
  university: '대학교',
  college: '전문대학',
}

const YEARS = Array.from(
  { length: SUBMIT_MAX_GRADUATION_YEAR - SUBMIT_MIN_GRADUATION_YEAR + 1 },
  (_, i) => SUBMIT_MAX_GRADUATION_YEAR - i
)

const INITIAL_PEOPLE: PersonInput[] = [createPerson(), createPerson(), createPerson()]
const INITIAL_SELF: PersonInput[] = [createPerson(true)]

const MSG_PRESETS = ['보고싶다', '잘 지내?', '그때 고마웠어', '연락하고 지내자']

function SubmitInner() {
  const searchParams = useSearchParams()
  const prefill = parseSubmitPrefill(searchParams)
  const selfMode = prefill.selfMode

  const [school, setSchool] = useState<SchoolLite | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SchoolLite[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)

  const [gradYear, setGradYear] = useState(prefill.graduationYear)
  const [grade, setGrade] = useState(prefill.grade)
  const [classNumber, setClassNumber] = useState(prefill.classNumber)
  const [department, setDepartment] = useState('')
  const [studentYear, setStudentYear] = useState('')

  const [people, setPeople] = useState<PersonInput[]>(selfMode ? INITIAL_SELF : INITIAL_PEOPLE)

  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [err, setErr] = useState('')
  const captchaRef = useRef<CaptchaWidgetHandle>(null)
  const [captchaStatus, setCaptchaStatus] = useState<CaptchaStatus>('loading')
  const [done, setDone] = useState<
    | {
        success: number
        dup: number
        fail: number
        createdNames: string[]
        totalAtSchool: number | null
        context: RegistrationSuccessContext
        growthReward?: RegistrationGrowthReward
      }
    | null
  >(null)

  const isUni = school?.school_type === 'university' || school?.school_type === 'college'
  const gradeMax = school?.school_type === 'elementary' ? 6 : 3

  useEffect(() => {
    const slug = prefill.schoolSlug
    if (!slug) return
    ;(async () => {
      const { data } = await supabase
        .from('schools')
        .select('id, school_name, school_type, sido, sigungu, slug')
        .eq('slug', slug)
        .maybeSingle()
      if (data) {
        const selected = data as SchoolLite
        setSchool(selected)
        setGrade(gradeForSchoolType(prefill.grade, selected.school_type))
        setClassNumber(
          selected.school_type === 'university' || selected.school_type === 'college'
            ? ''
            : prefill.classNumber
        )
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (school) return
    if (debounce.current) clearTimeout(debounce.current)
    const q = query.trim()
    if (q.length < 1) {
      setResults([])
      return
    }
    debounce.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('schools')
        .select('id, school_name, school_type, sido, sigungu, slug')
        .ilike('school_name', `%${q}%`)
        .limit(20)
      setResults((data as SchoolLite[]) ?? [])
      setSearching(false)
      setOpen(true)
    }, 300)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [query, school])

  function selectSchool(s: SchoolLite) {
    setSchool(s)
    setOpen(false)
    setResults([])
    setQuery('')
    setGrade('')
    setClassNumber('')
    setDepartment('')
    setStudentYear('')
  }

  async function handleSubmit() {
    if (submittingRef.current) return
    setErr('')
    if (!school) return setErr('학교를 선택해주세요.')
    if (!gradYear) return setErr('졸업(예정) 년도를 선택해주세요.')
    if (!isUni && (!grade || !classNumber)) return setErr('학년과 반을 입력해주세요.')
    const valid = people.filter((p) => p.nickname.trim())
    if (valid.length === 0) return setErr('이름을 한 명 이상 입력해주세요.')
    if (selfMode && !normalizeInsta(valid[0].instagram)) {
      return setErr('연결할 인스타 ID를 입력해주세요.')
    }
    if (!TURNSTILE_SITE_KEY) return setErr('지금은 등록 기능을 사용할 수 없어요. 잠시 후 다시 시도해주세요.')
    if (captchaStatus !== 'ready') return setErr('보안 확인을 먼저 완료해주세요.')

    submittingRef.current = true
    setSubmitting(true)
    const base = {
      school_id: school.id,
      graduation_year: Number(gradYear),
      grade: isUni ? null : Number(grade),
      class_number: isUni ? null : Number(classNumber),
      department: isUni ? department.trim() || null : null,
      student_year: isUni && studentYear ? Number(studentYear) : null,
    }

    try {
      const { success, dup, fail, createdNames, rateLimited, growthReward } = await registerPeople(
        valid,
        base,
        () => {
          if (!captchaRef.current) return Promise.reject(new Error('captcha-not-ready'))
          return captchaRef.current.requestNextToken()
        }
      )

      if (success === 0) {
        if (rateLimited) setErr('요청이 많아요. 잠시 후 다시 등록해주세요.')
        else if (dup > 0 && fail === 0) setErr('입력한 이름은 이미 등록되어 있어요.')
        else setErr('등록하지 못했어요. 입력한 내용을 확인하고 다시 시도해주세요.')
        return
      }

      let totalAtSchool: number | null = growthReward?.after.visibleProfileCount ?? null
      if (!growthReward) {
        const { count: schoolTotal } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', school.id)
          .eq('is_hidden', false)
        if (typeof schoolTotal === 'number') totalAtSchool = schoolTotal
      }

      setDone({
        success,
        dup,
        fail,
        createdNames: createdNames ?? [],
        totalAtSchool,
        context: {
          schoolName: school.school_name,
          schoolSlug: school.slug,
          graduationYear: base.graduation_year,
          grade: base.grade,
          classNumber: base.class_number,
          department: base.department,
          studentYear: base.student_year,
        },
        growthReward,
      })
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function shareSchool(text?: string) {
    if (!school) return
    const url = `https://www.schoollove.kr/school/${school.slug}`
    const defaultText = `${school.school_name} 우리 반 친구들 모아놨어! 너도 네 인스타 연결하러 와`
    const shareText = text ?? defaultText
    if (typeof navigator !== 'undefined' && (navigator as Navigator).share) {
      ;(navigator as Navigator).share({ title: '스쿨러브아이', text: shareText, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(`${shareText} ${url}`)
      alert('링크가 복사되었어요')
    }
  }

  function registerMore() {
    setDone(null)
    setPeople(selfMode ? INITIAL_SELF : INITIAL_PEOPLE)
    setErr('')
  }

  // ── 등록 완료 화면 ──────────────────────────────────────
  if (done) {
    const growthCopy = getGrowthRewardCopy(done.growthReward, done.context.schoolName)
    return (
      <RegistrationSuccessFeedback
        context={done.context}
        success={done.success}
        dup={done.dup}
        fail={done.fail}
        createdNames={done.createdNames}
        totalAtSchool={done.totalAtSchool}
        growthReward={done.growthReward}
        growthCopy={growthCopy}
        selfMode={selfMode}
        onShare={() => shareSchool(growthCopy?.shareText)}
        onRegisterMore={registerMore}
      />
    )
  }

  // ── 등록 폼 ─────────────────────────────────────────────
  return (
    <main className="mx-auto w-full max-w-[600px] px-5 pb-28">
      <h1 className="mx-auto max-w-[280px] text-center text-[22px] font-extrabold leading-[1.35] tracking-tight text-neutral-900 [text-wrap:balance] sm:max-w-none sm:text-2xl">
        {selfMode ? (
          '내 인스타를 연결해요'
        ) : (
          <>
            <span className="block whitespace-nowrap">기억나는 친구 이름을</span>
            <span className="block whitespace-nowrap">남겨보세요</span>
          </>
        )}
      </h1>
      <p className="mt-2.5 text-center text-sm text-neutral-500">
        {selfMode
          ? '당신을 기억하는 친구들이 찾을 수 있게, 인스타를 연결해두세요.'
          : '이름만 적어도 돼요. 인스타는 알면 같이, 몰라도 괜찮아요.'}
      </p>

      {/* 1. 학교 */}
      <section className="mt-9">
        <label className="mb-2 block text-sm font-semibold text-neutral-800">학교</label>
        {school ? (
          <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900">{school.school_name}</p>
              <p className="truncate text-xs text-neutral-500">
                {TYPE_LABEL[school.school_type] ?? ''}
                {school.sido ? ` · ${school.sido}` : ''}
                {school.sigungu ? ` ${school.sigungu}` : ''}
              </p>
            </div>
            <button
              onClick={() => setSchool(null)}
              className="ml-3 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-xs text-neutral-500 underline"
            >
              변경
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length && setOpen(true)}
              placeholder="학교 이름을 검색하세요"
              className="w-full rounded-2xl border border-neutral-200 px-4 py-3.5 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100"
              autoComplete="off"
            />
            {open && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-neutral-200 bg-white shadow-lg">
                {searching ? (
                  <p className="px-4 py-3 text-sm text-neutral-400">검색 중…</p>
                ) : results.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-neutral-400">검색 결과가 없어요.</p>
                ) : (
                  results.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectSchool(s)}
                      className="block w-full px-4 py-2.5 text-left hover:bg-neutral-50"
                    >
                      <span className="text-sm font-medium text-neutral-900">{s.school_name}</span>
                      <span className="ml-2 text-xs text-neutral-400">
                        {s.sido ?? ''} {s.sigungu ?? ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. 학년·반 / 학과·학번 */}
      {school && (
        <section className="mt-8">
          <label className="mb-2 block text-sm font-semibold text-neutral-800">언제 / 어느 반</label>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value)}
              className="rounded-2xl border border-neutral-200 px-3 py-3.5 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">졸업년도</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>

            {isUni ? (
              <>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="학과(선택)"
                  className="rounded-2xl border border-neutral-200 px-3 py-3.5 text-sm outline-none focus:border-neutral-900"
                />
                <input
                  value={studentYear}
                  onChange={(e) => setStudentYear(e.target.value.replace(/\D/g, ''))}
                  placeholder="학번(선택)"
                  inputMode="numeric"
                  className="rounded-2xl border border-neutral-200 px-3 py-3.5 text-sm outline-none focus:border-neutral-900"
                />
              </>
            ) : (
              <>
                <select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="rounded-2xl border border-neutral-200 px-3 py-3.5 text-sm outline-none focus:border-neutral-900"
                >
                  <option value="">학년</option>
                  {Array.from({ length: gradeMax }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={g}>
                      {g}학년
                    </option>
                  ))}
                </select>
                <input
                  value={classNumber}
                  onChange={(e) => setClassNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="반"
                  inputMode="numeric"
                  className="rounded-2xl border border-neutral-200 px-3 py-3.5 text-sm outline-none focus:border-neutral-900"
                />
              </>
            )}
          </div>
        </section>
      )}

      {/* 3. 사람 추가 */}
      {school && (
        <section className="mt-8">
          <label className="mb-2 block text-sm font-semibold text-neutral-800">
            {selfMode ? '내 정보' : '누구를 등록할까요?'}
          </label>
          {!selfMode && (
            <p className="mb-3 text-xs text-neutral-400">기억나는 친구들을 한 번에 여러 명 남길 수 있어요.</p>
          )}
          <div className="space-y-4">
            {people.map((p, i) => (
              <div key={i} className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-3">
                <div className="flex gap-2">
                  <input
                    value={p.nickname}
                    onChange={(e) => setPeople((people) => updatePerson(people, i, 'nickname', e.target.value))}
                    placeholder={selfMode ? '내 이름 또는 별명' : '이름 또는 별명'}
                    className="w-2/5 rounded-2xl border border-neutral-200 px-3 py-3.5 text-sm outline-none focus:border-neutral-900"
                  />
                  <div className="flex flex-1 items-center rounded-2xl border border-neutral-200 bg-white px-3 focus-within:border-neutral-900">
                    <span className="text-sm text-neutral-400">@</span>
                    <input
                      value={p.instagram}
                      onChange={(e) => setPeople((people) => updatePerson(people, i, 'instagram', e.target.value))}
                      placeholder={selfMode ? '내 인스타 ID' : '인스타 ID (선택)'}
                      className="w-full bg-transparent px-1 py-3.5 text-sm outline-none"
                    />
                  </div>
                  {!selfMode && people.length > 1 && (
                    <button
                      onClick={() => setPeople((people) => removePerson(people, i))}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-2xl px-2 text-neutral-300 hover:text-red-400"
                      aria-label="삭제"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="mt-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor={`person-message-${i}`} className="font-retro text-xs font-normal text-schoollove-secondary">
                      한마디 남기기 (선택)
                    </label>
                    <span className="font-retro shrink-0 text-xs text-schoollove-muted">
                      {p.message.length}/{PROFILE_MESSAGE_MAX_LENGTH}
                    </span>
                  </div>
                  <input
                    id={`person-message-${i}`}
                    value={p.message}
                    onChange={(e) => setPeople((people) => updatePerson(people, i, 'message', e.target.value))}
                    placeholder="기억을 도울 짧은 한마디를 남겨보세요"
                    maxLength={PROFILE_MESSAGE_MAX_LENGTH}
                    className="w-full rounded-2xl border border-schoollove-border bg-white px-3 py-3 text-sm outline-none focus:border-schoollove-electric-blue focus:ring-2 focus:ring-schoollove-electric-blue/15"
                  />
                  {!selfMode && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {MSG_PRESETS.map((message) => (
                        <button
                          key={message}
                          type="button"
                          onClick={() => setPeople((people) => updatePerson(people, i, 'message', message))}
                          className="inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-900"
                        >
                          {message}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 인스타를 입력한 행에만 본인 동의 체크 노출 */}
                {p.instagram.trim() && (
                  <label className="mt-2.5 flex min-h-11 cursor-pointer items-center gap-2 pl-1 text-xs text-neutral-500">
                    <input
                      type="checkbox"
                      checked={p.isSelf}
                      onChange={(e) => setPeople((people) => updatePerson(people, i, 'isSelf', e.target.checked))}
                      className="h-3.5 w-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-400"
                    />
                    내 인스타예요 (공개 노출에 동의)
                  </label>
                )}
              </div>
            ))}
          </div>
          {!selfMode && (
            <button
              onClick={() => setPeople((people) => addPerson(people))}
              className="mt-3 w-full rounded-2xl border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50"
            >
              ＋ 친구 추가
            </button>
          )}
        </section>
      )}

      {/* 제출 */}
      {school && (
        <section className="mt-10">
          {TURNSTILE_SITE_KEY ? (
            <div className="mb-4">
              <p id="captcha-label" className="mb-2 text-xs font-medium text-neutral-500">
                보안 확인
              </p>
              <div aria-labelledby="captcha-label">
                <CaptchaWidget ref={captchaRef} siteKey={TURNSTILE_SITE_KEY} onStatusChange={setCaptchaStatus} />
              </div>
            </div>
          ) : (
            <p className="mb-4 text-center text-sm text-red-500">
              지금은 등록 기능을 사용할 수 없어요. 잠시 후 다시 시도해주세요.
            </p>
          )}
          {submitting && (
            <p className="mb-3 text-center text-sm text-schoollove-text" role="status" aria-live="polite">
              등록 내용을 안전하게 확인하고 있어요.
            </p>
          )}
          {err && (
            <p className="mb-3 text-center text-sm text-red-500" role="alert" aria-live="polite">
              {err}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !TURNSTILE_SITE_KEY || captchaStatus !== 'ready'}
            className="w-full rounded-2xl bg-neutral-900 py-4 text-base font-bold text-white transition active:scale-95 disabled:opacity-50"
          >
            {submitting ? '등록 중…' : selfMode ? '내 인스타 연결하기' : '등록하기'}
          </button>
          <p className="mt-3 text-center text-xs text-neutral-400">
            공개 인스타그램 계정만 등록 가능합니다. 타인의 비공개·민감 정보는 등록 시 신고·삭제될 수 있어요.
          </p>
        </section>
      )}
    </main>
  )
}

export default function SubmitPage() {
  return (
    <Suspense fallback={null}>
      <SubmitInner />
    </Suspense>
  )
}
