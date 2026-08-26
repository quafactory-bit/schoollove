'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSchoolAutocomplete } from '@/lib/hooks/useSchoolAutocomplete'

const relationships = [
  ['same_class', '같은 반'], ['same_school', '같은 학교'], ['senior_junior', '선후배'],
  ['club', '동아리'], ['other', '기타'],
] as const

export default function PeopleSearchClient() {
  const router = useRouter()
  const [schoolQuery, setSchoolQuery] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [exactName, setExactName] = useState('')
  const [matchToken, setMatchToken] = useState('')
  const [relationship, setRelationship] = useState('same_school')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const schools = useSchoolAutocomplete(schoolQuery)

  async function search(event: React.FormEvent) {
    event.preventDefault()
    if (!schoolId) { setStatus('검색 결과에서 학교를 선택해 주세요.'); return }
    setBusy(true); setStatus(''); setMatchToken('')
    const response = await fetch('/api/connections/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, graduation_year: Number(graduationYear), exact_name: exactName }),
    })
    const result = await response.json() as { state?: string; matchToken?: string }
    setBusy(false)
    const copy: Record<string, string> = {
      unavailable: '일치 여부를 확인하지 못했습니다.',
      invalid_search: '학교, 졸업연도와 정확한 이름을 확인해 주세요.',
      service_unavailable: '검색을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    }
    if (result.state === 'match_available' && result.matchToken) {
      setMatchToken(result.matchToken); setStatus('일치하는 등록자가 있습니다. 개인정보는 안부 수락 전까지 공개되지 않습니다.')
    } else setStatus(copy[result.state ?? ''] ?? '일치 여부를 확인하지 못했습니다.')
  }

  async function sendGreeting() {
    if (!preview) { setPreview(true); return }
    setBusy(true)
    const response = await fetch('/api/connections/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_token: matchToken, relationship_type: relationship, message }),
    })
    const result = await response.json() as { error?: string }
    setBusy(false)
    if (!response.ok) { setStatus(result.error ?? '안부를 보낼 수 없습니다.'); return }
    setStatus('안부를 보냈습니다. 수락 전에는 추가 메시지를 보낼 수 없습니다.')
    setMatchToken(''); setMessage(''); setPreview(false); router.refresh()
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Private exact match</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">정확한 사람 찾기</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">목록을 보여주지 않습니다. 기억하는 학교, 졸업연도와 정확한 이름이 하나의 비공개 등록과 일치할 때만 안부를 보낼 수 있습니다.</p>

      <form onSubmit={search} className="mt-7 space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div>
          <label htmlFor="person-school" className="text-sm font-semibold text-gray-900">학교</label>
          <input id="person-school" value={schoolQuery} onChange={(event) => { setSchoolQuery(event.target.value); setSchoolId(''); setMatchToken('') }} autoComplete="off" className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" />
          {schoolQuery.trim().length >= 2 && schools.status === 'ok' && schools.results.length > 0 && (
            <div className="mt-1 rounded-xl border border-gray-200 bg-white p-1">
              {schools.results.map((school) => <button type="button" key={school.id} onClick={() => { setSchoolId(school.id); setSchoolQuery(`${school.school_name} · ${school.sido} ${school.sigungu}`) }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">{school.school_name} · {school.sido} {school.sigungu}</button>)}
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="person-year" className="text-sm font-semibold text-gray-900">졸업연도</label><input id="person-year" type="number" min={1900} max={2200} required value={graduationYear} onChange={(event) => { setGraduationYear(event.target.value); setMatchToken('') }} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" /></div>
          <div><label htmlFor="person-name" className="text-sm font-semibold text-gray-900">정확한 이름</label><input id="person-name" minLength={2} maxLength={50} required value={exactName} onChange={(event) => { setExactName(event.target.value); setMatchToken('') }} className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3" /></div>
        </div>
        <p className="text-xs leading-5 text-gray-500">부분 이름, 초성, 한 글자 검색과 전체 명단 조회는 제공하지 않습니다.</p>
        <button disabled={busy} className="w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">정확히 일치하는지 확인</button>
      </form>

      {matchToken && <section className="mt-5 space-y-4 rounded-2xl border border-red-200 bg-red-50 p-5">
        <h2 className="text-lg font-bold text-gray-950">안부 보내기</h2>
        <select aria-label="관계 유형" value={relationship} onChange={(event) => setRelationship(event.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3">{relationships.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <textarea aria-label="최초 안부" maxLength={200} value={message} onChange={(event) => { setMessage(event.target.value); setPreview(false) }} rows={5} placeholder="상대가 알아볼 수 있는 안전한 안부를 남겨보세요." className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3" />
        <div className="flex justify-between text-xs text-gray-600"><span>URL·이메일·전화번호·외부 ID는 보낼 수 없습니다.</span><span>{message.length}/200</span></div>
        {preview && <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-semibold text-gray-500">전송 전 미리보기 · 전송 후 수정 불가</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">{message}</p></div>}
        <button type="button" disabled={busy || !message.trim()} onClick={sendGreeting} className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{preview ? '이 안부를 한 번 보내기' : '안부 미리보기'}</button>
      </section>}
      {status && <p role="status" className="mt-5 rounded-xl bg-gray-950 px-4 py-3 text-sm text-white">{status}</p>}
    </main>
  )
}
