'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SchoolMembership } from '@/lib/account'
import { buildGradeClassPayload, gradeNumbersForSchoolType } from '@/lib/accountGradeClass'
import type { SchoolType } from '@/types/school'

export default function ClassHistoryEditor({ membership, writable }: { membership: SchoolMembership; writable: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState(false)
  const grades = gradeNumbersForSchoolType(membership.school?.school_type as SchoolType ?? null)
  if (!writable || grades.length === 0) return null

  function open() {
    setValues(Object.fromEntries(membership.class_history.map(row => [row.grade_number, String(row.class_number)])))
    setError(false)
    setEditing(true)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(false)
    try {
      const response = await fetch(`/api/account/memberships/${encodeURIComponent(membership.id)}/class-history`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade_classes: buildGradeClassPayload(values) }),
      })
      if (!response.ok) { setError(true); return }
      setEditing(false)
      router.refresh()
    } catch { setError(true) }
    finally { submitting.current = false; setBusy(false) }
  }

  return <div className="mt-3 min-w-0">
    {!editing ? <>
      {membership.class_history.length === 0 ? <p className="text-xs leading-5 text-schoollove-secondary">같은 반까지 기억난다면 학년·반을 추가해 보세요.</p> : null}
      <button type="button" onClick={open} className="schoollove-focus min-h-11 text-sm font-semibold underline">
        {membership.class_history.length === 0 ? '학년·반 추가' : '학년·반 수정'}
      </button>
    </> : <form onSubmit={save} className="min-w-0 space-y-3 rounded-xl border border-schoollove-border p-3">
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold">학년·반 편집 (선택)</legend>
        <p className="text-xs leading-5 text-schoollove-secondary">기억나는 학년의 반만 입력해 주세요. 빈칸으로 저장하면 입력한 학년·반만 지워집니다. 학교와 졸업연도는 그대로 유지됩니다.</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {grades.map(grade => <label key={grade} className="min-w-0 text-sm">{grade}학년 반
            <input type="number" inputMode="numeric" min={1} max={100} step={1} value={values[grade] ?? ''}
              onChange={event => setValues(current => ({ ...current, [grade]: event.target.value }))}
              className="schoollove-focus mt-1 min-h-12 w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2" />
          </label>)}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="schoollove-dark-action schoollove-focus min-h-11 rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? '저장 중…' : '저장'}</button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)} className="schoollove-focus min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm">취소</button>
      </div>
      {error ? <p role="alert" className="text-sm text-red-800">학년·반 정보를 저장할 수 없습니다. 입력값과 로그인 상태를 확인해 주세요.</p> : null}
    </form>}
  </div>
}
