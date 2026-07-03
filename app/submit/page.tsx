'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { IMG } from '@/lib/images'
import { supabase } from '@/lib/supabase'

type SchoolLite = {
  id: string
  school_name: string
  school_type: string
  sido: string | null
  sigungu: string | null
  slug: string
}

// message: 이 친구에게 한마디 (등록 사유/인사). 본인이 보면 연결 동기가 됨.
type Person = { nickname: string; instagram: string; isSelf: boolean; message: string }

const TYPE_LABEL: Record<string, string> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
  university: '대학교',
  college: '전문대학',
}

const YEARS = Array.from({ length: 2032 - 1970 + 1 }, (_, i) => 2032 - i)

const INITIAL_PEOPLE: Person[] = [
  { nickname: '', instagram: '', isSelf: false, message: '' },
  { nickname: '', instagram: '', isSelf: false, message: '' },
  { nickname: '', instagram: '', isSelf: false, message: '' },
]

const INITIAL_SELF: Person[] = [{ nickname: '', instagram: '', isSelf: true, message: '' }]

// 따뜻한 프리셋 (악용 방지: 부정 표현 대신 긍정 프레임 유도)
const MSG_PRESETS = ['보고싶다', '잘 지내?', '그때 고마웠어', '연락하고 지내자']

function normalizeInsta(raw: string): string {
  let s = raw.trim()
  if (!s) return ''
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
  s = s.replace(/[/?].*$/, '')
  s = s.replace(/^@/, '')
  return s.trim()
}

function SubmitInner() {
  const searchParams = useSearchParams()
  const selfMode = searchParams.get('self') === '1'

  const [school, setSchool] = useState<SchoolLite | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SchoolLite[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)

  const [gradYear, setGradYear] = useState('')
  const [grade, setGrade] = useState('')
  const [classNumber, setClassNumber] = useState('')
  const [department, setDepartment] = useState('')
  const [studentYear, setStudentYear] = useState('')

  const [people, setPeople] = useState<Person[]>(selfMode ? INITIAL_SELF : INITIAL_PEOPLE)

  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<
    { success: number; dup: number; fail: number; totalAtSchool: number } | null
  >(null)

  const isUni = school?.school_type === 'university' || school?.school_type === 'college'
  const gradeMax = school?.school_type === 'elementary' ? 6 : 3

  useEffect(() => {
    const slug = searchParams.get('school')
    if (!slug) return
    ;(async () => {
      const { data } = await supabase
        .from('schools')
        .select('id, school_name, school_type, sido, sigungu, slug')
        .eq('slug', slug)
        .maybeSingle()
      if (data) setSchool(data as SchoolLite)
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

  function addPerson() {
    setPeople((p) => [...p, { nickname: '', instagram: '', isSelf: false, message: '' }])
  }
  function removePerson(i: number) {
    setPeople((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)))
  }
  function updatePerson(i: number, key: keyof Person, val: string | boolean) {
    setPeople((p) => p.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)))
  }

  async function handleSubmit() {
    setErr('')
    if (!school) return setErr('학교를 선택해주세요.')
    if (!gradYear) return setErr('졸업(예정) 년도를 선택해주세요.')
    if (!isUni && (!grade || !classNumber)) return setErr('학년과 반을 입력해주세요.')
    const valid = people.filter((p) => p.nickname.trim())
    if (valid.length === 0) return setErr('이름을 한 명 이상 입력해주세요.')
    if (selfMode && !normalizeInsta(valid[0].instagram)) {
      return setErr('연결할 인스타 ID를 입력해주세요.')
    }

    setSubmitting(true)
    const base = {
      school_id: school.id,
      graduation_year: Number(gradYear),
      grade: isUni ? null : Number(grade),
      class_number: isUni ? null : Number(classNumber),
      department: isUni ? department.trim() || null : null,
      student_year: isUni && studentYear ? Number(studentYear) : null,
    }

    let success = 0
    let dup = 0
    let fail = 0
    for (const p of valid) {
      const insta = normalizeInsta(p.instagram) || null
      const { error } = await supabase.from('profiles').insert({
        ...base,
        nickname: p.nickname.trim(),
        instagram_id: insta,
        is_self: insta ? p.isSelf : false,
        message: p.message.trim() || null, // 이 친구에게 한마디
      })
      if (!error) success++
      else if (error.code === '23505') dup++
      else fail++
    }

    let totalAtSchool = success
    const { count: schoolTotal } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .eq('is_hidden', false)
    if (typeof schoolTotal === 'number') totalAtSchool = schoolTotal

    setSubmitting(false)
    setDone({ success, dup, fail, totalAtSchool })
  }

  function shareSchool() {
    if (!school) return
    const url = `https://www.schoollove.kr/school/${school.slug}`
    const text = `${school.school_name} 우리 반 친구들 모아놨어! 너도 네 인스타 연결하러 와`
    if (typeof navigator !== 'undefined' && (navigator as Navigator).share) {
      ;(navigator as Navigator).share({ title: '스쿨러브아이', text, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(`${text} ${url}`)
      alert('링크가 복사되었어요')
    }
  }

  function resetAll() {
    setDone(null)
    setPeople(selfMode ? INITIAL_SELF : INITIAL_PEOPLE)
    setGrade('')
    setClassNumber('')
    setDepartment('')
    setStudentYear('')
    setGradYear('')
    setSchool(null)
  }

  // ── 등록 완료 화면 ──────────────────────────────────────
  if (done) {
    const othersAtSchool = Math.max(done.totalAtSchool - done.success, 0)
    return (
      <main className="mx-auto w-full max-w-[600px] px-5 pb-24 pt-10 text-center">
<div className="mx-auto mb-6 w-full max-w-xs overflow-hidden rounded-2xl">
          <Image src={IMG.completeGraduation} alt="졸업 축하" width={1000} height={750} className="h-auto w-full" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">
          {selfMode ? '연결 완료!' : '등록 완료!'}
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          {school?.school_name}에 <b className="text-neutral-900">{done.success}명</b>{' '}
          {selfMode ? '연결됐어요.' : '등록됐어요.'}
          {done.dup > 0 && <span className="block text-neutral-400">{done.dup}명은 이미 등록되어 있었어요.</span>}
          {done.fail > 0 && <span className="block text-red-400">{done.fail}명은 등록에 실패했어요.</span>}
        </p>

        {othersAtSchool > 0 && (
          <div className="mx-auto mt-6 max-w-xs rounded-2xl bg-neutral-100 px-4 py-4">
            <p className="text-sm font-bold text-neutral-900">혼자가 아니에요 👋</p>
            <p className="mt-1 text-sm text-neutral-600">
              이 학교엔 이미 <b className="text-neutral-900">{done.totalAtSchool}명</b>이 함께 있어요.
            </p>
          </div>
        )}

        <div className="mt-8 space-y-2.5">
          {school && (
            <Link
              href={`/school/${school.slug}`}
              className="block w-full rounded-2xl bg-neutral-900 px-5 py-4 text-sm font-bold text-white transition active:scale-95"
            >
              우리 학교 페이지에서 확인하기
            </Link>
          )}
          <button
            onClick={shareSchool}
            className="block w-full rounded-2xl border border-neutral-200 px-5 py-4 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50"
          >
            단톡방에 공유하기
          </button>
          <button onClick={resetAll} className="block w-full px-5 py-3 text-sm text-neutral-400">
            계속 등록하기
          </button>
        </div>

        <p className="mt-4 text-xs text-neutral-400">
          단톡방에 공유하면 친구들이 자기 인스타를 직접 연결해요.
        </p>
      </main>
    )
  }

  // ── 등록 폼 ─────────────────────────────────────────────
  return (
    <main className="mx-auto w-full max-w-[600px] px-5 pb-28">
      <h1 className="mt-8 text-center text-2xl font-extrabold tracking-tight text-neutral-900">
      <h1 className="text-center text-2xl font-extrabold tracking-tight text-neutral-900">
        {selfMode ? '내 인스타를 연결해요' : '기억나는 친구 이름을 남겨보세요'}
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
            <button onClick={() => setSchool(null)} className="ml-3 shrink-0 text-xs text-neutral-500 underline">
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
                    onChange={(e) => updatePerson(i, 'nickname', e.target.value)}
                    placeholder={selfMode ? '내 이름 또는 별명' : '이름 또는 별명'}
                    className="w-2/5 rounded-2xl border border-neutral-200 px-3 py-3.5 text-sm outline-none focus:border-neutral-900"
                  />
                  <div className="flex flex-1 items-center rounded-2xl border border-neutral-200 bg-white px-3 focus-within:border-neutral-900">
                    <span className="text-sm text-neutral-400">@</span>
                    <input
                      value={p.instagram}
                      onChange={(e) => updatePerson(i, 'instagram', e.target.value)}
                      placeholder={selfMode ? '내 인스타 ID' : '인스타 ID (선택)'}
                      className="w-full bg-transparent px-1 py-3.5 text-sm outline-none"
                    />
                  </div>
                  {!selfMode && people.length > 1 && (
                    <button
                      onClick={() => removePerson(i)}
                      className="shrink-0 rounded-2xl px-2 text-neutral-300 hover:text-red-400"
                      aria-label="삭제"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* 이름을 입력하면 "이 친구에게 한마디" 노출 (본인모드면 "나를 한마디로") */}
                {p.nickname.trim() && (
                  <div className="mt-2.5">
                    <input
                      value={p.message}
                      onChange={(e) => updatePerson(i, 'message', e.target.value.slice(0, 30))}
                      placeholder={selfMode ? '나를 한마디로 소개 (선택)' : '이 친구에게 한마디 (선택)'}
                      maxLength={30}
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-sm outline-none focus:border-neutral-900"
                    />
                    {!selfMode && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {MSG_PRESETS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updatePerson(i, 'message', m)}
                            className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-900"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 인스타를 입력한 행에만 본인 동의 체크 노출 */}
                {p.instagram.trim() && (
                  <label className="mt-2.5 flex items-center gap-2 pl-1 text-xs text-neutral-500">
                    <input
                      type="checkbox"
                      checked={p.isSelf}
                      onChange={(e) => updatePerson(i, 'isSelf', e.target.checked)}
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
              onClick={addPerson}
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
          {err && <p className="mb-3 text-center text-sm text-red-500">{err}</p>}
          <button
            onClick={handleSubmit}
            disabled={submitting}
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
