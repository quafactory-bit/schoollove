'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSchoolAutocomplete } from '@/lib/hooks/useSchoolAutocomplete'
import type { AccountState } from '@/lib/account'

type Props = { email: string; state: AccountState }

async function readResult(response: Response): Promise<{ error?: string }> {
  try { return await response.json() as { error?: string } } catch { return {} }
}

export default function AccountClient({ email, state }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [birthDate, setBirthDate] = useState('')
  const [consents, setConsents] = useState({
    terms: false,
    privacy_collection: false,
    adult_confirmation: false,
    private_by_default: false,
  })
  const [displayName, setDisplayName] = useState(state.profile?.display_name ?? '')
  const [instagram, setInstagram] = useState(state.profile?.instagram_handle ?? '')
  const [introduction, setIntroduction] = useState(state.profile?.introduction ?? '')
  const [schoolQuery, setSchoolQuery] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [classNumber, setClassNumber] = useState('')
  const schools = useSchoolAutocomplete(schoolQuery)

  async function submit(endpoint: string, payload: unknown, method = 'POST') {
    setBusy(true)
    setStatus('')
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await readResult(response)
    setBusy(false)
    if (!response.ok) {
      setStatus(result.error ?? '요청을 완료할 수 없습니다.')
      return false
    }
    setStatus('안전하게 저장했습니다.')
    router.refresh()
    return true
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Private account</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">내 계정</h1>
          <p className="mt-2 text-sm text-gray-600">{email}</p>
        </div>
        <button type="button" onClick={async () => {
          await fetch('/api/auth/logout', { method: 'POST' })
          router.push('/login')
          router.refresh()
        }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">로그아웃</button>
      </div>
      <Link href="/onboarding" className="mt-5 block rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900">제한 베타 시작 상태 확인</Link>

      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold text-gray-950">1. 만 19세 이상 확인</h2>
        {state.adultEligible ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">현재 정책 기준 성인 확인 완료</p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={async (event) => {
            event.preventDefault()
            await submit('/api/account/eligibility', { dateOfBirth: birthDate })
          }}>
            <label htmlFor="birth-date" className="block text-sm font-medium text-gray-800">생년월일</label>
            <input id="birth-date" type="date" required value={birthDate} onChange={(event) => setBirthDate(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3" />
            <p className="text-xs leading-5 text-gray-500">KST 기준 만 나이 판정에만 사용하며 원본 생년월일은 DB에 저장하지 않습니다. 자기진술은 강한 본인확인이 아닙니다.</p>
            <button disabled={busy} className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">만 19세 이상 확인</button>
          </form>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold text-gray-950">2. 필수 동의</h2>
        {state.consentsComplete ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">현재 정책 버전의 필수 동의 완료</p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={async (event) => {
            event.preventDefault()
            await submit('/api/account/consents', consents)
          }}>
            {([
              ['terms', '이용약관에 동의합니다.'],
              ['privacy_collection', '개인정보 수집·이용에 동의합니다.'],
              ['adult_confirmation', '만 19세 이상이며 본인 정보만 등록합니다.'],
              ['private_by_default', '개인 정보가 기본 비공개임을 확인했습니다.'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-start gap-3 text-sm text-gray-700">
                <input type="checkbox" required checked={consents[key]}
                  onChange={(event) => setConsents((current) => ({ ...current, [key]: event.target.checked }))}
                  className="mt-0.5 h-4 w-4" />
                <span>{label}</span>
              </label>
            ))}
            <button disabled={busy || !state.adultEligible} className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">필수 동의 기록</button>
          </form>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold text-gray-950">3. 내 비공개 프로필</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">이름·Instagram·소개는 나만 조회할 수 있습니다. 다른 로그인 사용자와 공개 학교 페이지에는 표시되지 않습니다.</p>
        <form className="mt-4 space-y-3" onSubmit={async (event) => {
          event.preventDefault()
          await submit('/api/account/profile', {
            display_name: displayName,
            instagram_handle: instagram || null,
            introduction: introduction || null,
          })
        }}>
          <label htmlFor="display-name" className="block text-sm font-medium text-gray-800">내 이름</label>
          <input id="display-name" required maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3" />
          <label htmlFor="instagram" className="block text-sm font-medium text-gray-800">Instagram 아이디 (선택·비공개)</label>
          <input id="instagram" maxLength={30} value={instagram} onChange={(event) => setInstagram(event.target.value.replace(/^@/, ''))}
            className="w-full rounded-xl border border-gray-300 px-4 py-3" />
          <label htmlFor="introduction" className="block text-sm font-medium text-gray-800">소개 (선택·비공개)</label>
          <textarea id="introduction" maxLength={300} value={introduction} onChange={(event) => setIntroduction(event.target.value)}
            className="min-h-24 w-full rounded-xl border border-gray-300 px-4 py-3" />
          <button disabled={busy || !state.adultEligible || !state.consentsComplete}
            className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">내 프로필 저장</button>
        </form>
        {state.profile && (
          <button type="button" onClick={async () => {
            if (!window.confirm('내 비공개 프로필과 학교 이력을 삭제할까요?')) return
            await submit('/api/account/profile', {}, 'DELETE')
          }} className="mt-4 text-sm font-medium text-red-700">내 프로필 삭제</button>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-bold text-gray-950">4. 내 학교 이력</h2>
        <ul className="mt-3 space-y-2">
          {state.memberships.map((membership) => (
            <li key={membership.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <span>{membership.school?.school_name ?? '학교'} · {membership.graduation_year}년{membership.class_number ? ` · ${membership.class_number}반` : ''}</span>
              <button type="button" onClick={() => submit('/api/account/memberships', { membership_id: membership.id }, 'DELETE')} className="text-red-700">삭제</button>
            </li>
          ))}
        </ul>
        <form className="mt-4 space-y-3" onSubmit={async (event) => {
          event.preventDefault()
          if (!schoolId) { setStatus('검색 결과에서 학교를 선택해 주세요.'); return }
          if (await submit('/api/account/memberships', {
            school_id: schoolId,
            graduation_year: Number(graduationYear),
            class_number: classNumber ? Number(classNumber) : null,
          })) {
            setSchoolQuery(''); setSchoolId(''); setGraduationYear(''); setClassNumber('')
          }
        }}>
          <label htmlFor="school-query" className="block text-sm font-medium text-gray-800">학교 검색</label>
          <input id="school-query" value={schoolQuery} onChange={(event) => { setSchoolQuery(event.target.value); setSchoolId('') }}
            autoComplete="off" className="w-full rounded-xl border border-gray-300 px-4 py-3" />
          {schoolQuery.trim().length >= 2 && schools.status === 'ok' && schools.results.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-1">
              {schools.results.map((school) => (
                <button type="button" key={school.id} onClick={() => { setSchoolId(school.id); setSchoolQuery(`${school.school_name} · ${school.sido} ${school.sigungu}`) }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">{school.school_name} · {school.sido} {school.sigungu}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min={1900} max={2200} required placeholder="졸업연도" value={graduationYear} onChange={(event) => setGraduationYear(event.target.value)} className="rounded-xl border border-gray-300 px-4 py-3" />
            <input type="number" min={1} max={100} placeholder="반 (선택)" value={classNumber} onChange={(event) => setClassNumber(event.target.value)} className="rounded-xl border border-gray-300 px-4 py-3" />
          </div>
          <button disabled={busy || !state.profile} className="rounded-xl border border-gray-900 px-4 py-3 text-sm font-semibold text-gray-900 disabled:opacity-40">학교 이력 추가</button>
        </form>
      </section>

      <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
        <h2 className="text-lg font-bold text-red-950">계정 탈퇴 요청</h2>
        <p className="mt-2 text-sm leading-6 text-red-900">요청 후 관리자가 확인합니다. 기존 공개 전환 전 데이터의 소유권은 자동으로 연결되지 않습니다.</p>
        <button type="button" disabled={busy || state.deletionRequested} onClick={() => submit('/api/account/deletion-request', { reason: null })}
          className="mt-4 rounded-xl bg-red-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {state.deletionRequested ? '탈퇴 요청 접수됨' : '계정 탈퇴 요청'}
        </button>
      </section>

      {state.profile && state.adultEligible && state.consentsComplete && (
        <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-bold text-gray-950">안전한 사람 연결</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">정확한 학교·졸업연도·이름이 일치할 때만 최초 안부를 한 번 보낼 수 있습니다. 공개 명단은 제공하지 않습니다.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/people/search" className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white">정확한 사람 찾기</Link>
            <Link href="/connections" className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900">내 연결과 안부</Link>
            <Link href="/notifications" className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900">내 알림</Link>
            <Link href="/account/safety" className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900">내 안전 설정</Link>
          </div>
        </section>
      )}

      {status && <p role="status" className="sticky bottom-20 mt-5 rounded-xl bg-gray-950 px-4 py-3 text-sm text-white shadow-lg">{status}</p>}
    </main>
  )
}
