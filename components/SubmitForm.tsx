'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, AlertCircle, Check, Loader2, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSchoolSearch } from '@/lib/hooks/useSchoolSearch'
import { checkDuplicate, insertProfile } from '@/lib/api/profiles'
import { normalizeInstagramId, validateInstagramId, sanitizeText, getGraduationYears, getGradesForType, debounce, cn } from '@/lib/utils'
import { SCHOOL_TYPE_LABELS, isUniversity } from '@/types/school'
import type { School } from '@/types/school'

interface PersonRow {
  id: string
  nickname: string
  instagram_id: string
  nicknameError: string
  instagramError: string
  status: 'idle' | 'checking' | 'duplicate' | 'ok'
}

function newRow(): PersonRow {
  return {
    id: Math.random().toString(36).slice(2),
    nickname: '',
    instagram_id: '',
    nicknameError: '',
    instagramError: '',
    status: 'idle',
  }
}

export default function SubmitForm() {
  const router = useRouter()

  // 단계
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // 학교 선택
  const [schoolQuery, setSchoolQuery] = useState('')
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [schoolDropdown, setSchoolDropdown] = useState(false)

  // 년도/학년/반
  const [graduationYear, setGraduationYear] = useState<number | ''>('')
  const [grade, setGrade] = useState<number | ''>('')
  const [classNumber, setClassNumber] = useState<number | ''>('')
  const [department, setDepartment] = useState('')
  const [studentYear, setStudentYear] = useState<number | ''>('')

  // 사람 목록
  const [rows, setRows] = useState<PersonRow[]>([newRow()])

  // 제출
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  const { data, isLoading: schoolSearching } = useSchoolSearch(schoolQuery)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSchoolQuery = useCallback(debounce((v: string) => setSchoolQuery(v), 300), [])

  const isUniv = selectedSchool ? isUniversity(selectedSchool.school_type) : false
  const grades = selectedSchool ? getGradesForType(selectedSchool.school_type) : []
  const years = getGraduationYears()

  // 행 업데이트
  const updateRow = (id: string, patch: Partial<PersonRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRow = () => setRows((prev) => [...prev, newRow()])
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id))

  // Step 1 → 2 검증
  const goStep2 = () => {
    if (!selectedSchool) return
    setStep(2)
  }

  // Step 2 → 3 검증
  const goStep3 = () => {
    if (!graduationYear) return
    if (!isUniv && (!grade || !classNumber)) return
    setStep(3)
  }

  // 최종 제출
  const handleSubmit = async () => {
    setSubmitError('')

    // 빈 행 제거
    const validRows = rows.filter((r) => r.nickname.trim())
    if (validRows.length === 0) {
      setSubmitError('최소 1명의 이름을 입력해주세요.')
      return
    }

    // 인스타 검증
    for (const row of validRows) {
      if (row.instagram_id && !validateInstagramId(row.instagram_id)) {
        setSubmitError(`"${row.nickname}"의 인스타그램 ID 형식이 올바르지 않습니다.`)
        return
      }
    }

    setSubmitting(true)

    const results = await Promise.all(
      validRows.map(async (row) => {
        // 중복 체크
        const isDup = await checkDuplicate(
          selectedSchool!.id,
          graduationYear as number,
          isUniv ? null : (grade as number),
          isUniv ? null : (classNumber as number),
          row.nickname.trim()
        )

        if (isDup) {
          return { row, error: '이미 등록된 이름입니다.' }
        }

        const { error } = await insertProfile({
          school_id: selectedSchool!.id,
          graduation_year: graduationYear as number,
          grade: isUniv ? null : (grade as number),
          class_number: isUniv ? null : (classNumber as number),
          department: isUniv && department ? sanitizeText(department) : null,
          student_year: isUniv && studentYear ? (studentYear as number) : null,
          nickname: sanitizeText(row.nickname),
          instagram_id: row.instagram_id ? normalizeInstagramId(row.instagram_id) : null,
        })

        return { row, error }
      })
    )

    setSubmitting(false)

    const failed = results.filter((r) => r.error)
    if (failed.length > 0) {
      // 에러 표시
      failed.forEach(({ row, error }) => {
        updateRow(row.id, { nicknameError: error || '' })
      })
      setSubmitError(`${failed.length}명 등록에 실패했습니다.`)
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div className="card p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto">
          <Check size={32} className="text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">등록 완료!</h2>
        <p className="text-sm text-gray-500">
          {rows.filter((r) => r.nickname.trim()).length}명이 성공적으로 등록되었습니다
        </p>
        <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center">
          <button
            onClick={() => router.push(`/school/${selectedSchool!.slug}`)}
            className="btn-primary text-sm"
          >
            학교 페이지 보기
          </button>
          <button
            onClick={() => {
              setStep(1)
              setSelectedSchool(null)
              setSchoolQuery('')
              setGraduationYear('')
              setGrade('')
              setClassNumber('')
              setDepartment('')
              setStudentYear('')
              setRows([newRow()])
              setDone(false)
            }}
            className="btn-secondary text-sm"
          >
            추가 등록하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 스텝 표시 */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold',
                step === s
                  ? 'bg-brand-blue text-white'
                  : step > s
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-400'
              )}
            >
              {step > s ? <Check size={14} /> : s}
            </div>
            <span className={cn('text-sm', step === s ? 'font-medium text-gray-900' : 'text-gray-400')}>
              {s === 1 ? '학교' : s === 2 ? '학년·반' : '이름 입력'}
            </span>
            {s < 3 && <span className="text-gray-300 text-xs">›</span>}
          </div>
        ))}
      </div>

      {/* STEP 1: 학교 선택 */}
      {step === 1 && (
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-gray-900">학교를 선택하세요</h2>

          {/* 선택된 학교 */}
          {selectedSchool ? (
            <div className="flex items-center justify-between p-3 bg-brand-blue-light border border-brand-blue/20 rounded-xl">
              <div>
                <p className="font-semibold text-brand-blue">{selectedSchool.school_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {SCHOOL_TYPE_LABELS[selectedSchool.school_type]} · {selectedSchool.sido} {selectedSchool.sigungu}
                </p>
              </div>
              <button
                onClick={() => { setSelectedSchool(null); setSchoolQuery('') }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                변경
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="input-base flex items-center gap-2">
                <input
                  type="text"
                  placeholder="학교 이름을 입력하세요"
                  onChange={(e) => {
                    debouncedSchoolQuery(e.target.value)
                    setSchoolDropdown(true)
                  }}
                  onFocus={() => setSchoolDropdown(true)}
                  className="w-full outline-none text-sm bg-transparent"
                  autoComplete="off"
                />
                {schoolSearching && <Loader2 size={14} className="animate-spin text-brand-blue shrink-0" />}
              </div>
              {schoolDropdown && data?.schools && data.schools.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-card-hover z-10 overflow-hidden">
                  {data?.schools?.map((school) => (
                    <button
                      key={school.id}
                      onClick={() => {
                        setSelectedSchool(school)
                        setSchoolDropdown(false)
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">{school.school_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {SCHOOL_TYPE_LABELS[school.school_type]} · {school.sido} {school.sigungu}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={goStep2}
            disabled={!selectedSchool}
            className="btn-primary w-full text-sm"
          >
            다음
          </button>
        </div>
      )}

      {/* STEP 2: 졸업년도 + 학년/반 */}
      {step === 2 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
            <h2 className="font-bold text-gray-900">
              {isUniv ? '졸업년도 · 학과' : '졸업년도 · 학년 · 반'}
            </h2>
          </div>

          {/* 학교 요약 */}
          <p className="text-sm text-brand-blue font-medium">
            {selectedSchool?.school_name}
          </p>

          {/* 졸업년도 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">
              졸업(예정) 년도 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={graduationYear}
                onChange={(e) => setGraduationYear(Number(e.target.value))}
                className="input-base appearance-none pr-8 cursor-pointer"
              >
                <option value="">년도를 선택하세요</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 초/중/고: 학년 + 반 */}
          {!isUniv && grades.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  학년 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={grade}
                    onChange={(e) => setGrade(Number(e.target.value))}
                    className="input-base appearance-none pr-8 cursor-pointer"
                  >
                    <option value="">학년</option>
                    {grades.map((g) => (
                      <option key={g} value={g}>{g}학년</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">
                  반 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  placeholder="반 번호"
                  value={classNumber}
                  onChange={(e) => setClassNumber(Number(e.target.value))}
                  className="input-base"
                />
              </div>
            </div>
          )}

          {/* 대학교: 학과 + 학번 (선택) */}
          {isUniv && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">학과 (선택)</label>
                <input
                  type="text"
                  placeholder="예: 컴퓨터공학과"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="input-base"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600">학번 (선택)</label>
                <input
                  type="number"
                  placeholder="예: 19"
                  value={studentYear}
                  onChange={(e) => setStudentYear(Number(e.target.value))}
                  className="input-base"
                />
              </div>
            </div>
          )}

          <button
            onClick={goStep3}
            disabled={!graduationYear || (!isUniv && (!grade || !classNumber))}
            className="btn-primary w-full text-sm"
          >
            다음
          </button>
        </div>
      )}

      {/* STEP 3: 이름 입력 */}
      {step === 3 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(2)} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
            <h2 className="font-bold text-gray-900">이름 · 인스타 입력</h2>
          </div>

          {/* 요약 */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
            <p className="font-medium text-gray-800">{selectedSchool?.school_name}</p>
            <p className="text-gray-500 text-xs mt-0.5">
              {graduationYear}년 졸업
              {!isUniv && grade && classNumber && ` · ${grade}학년 ${classNumber}반`}
              {isUniv && department && ` · ${department}`}
            </p>
          </div>

          {/* 안내 문구 */}
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>공개 인스타그램 계정만 등록 가능합니다. 타인의 개인정보를 무단으로 등록할 경우 신고·삭제될 수 있습니다.</p>
          </div>

          {/* 사람 행들 */}
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
              <span>이름/별명 *</span>
              <span>인스타 ID (선택)</span>
              <span></span>
            </div>

            {rows.map((row, idx) => (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    type="text"
                    placeholder="이름 또는 별명"
                    value={row.nickname}
                    onChange={(e) => updateRow(row.id, { nickname: e.target.value, nicknameError: '' })}
                    className={cn('input-base text-sm', row.nicknameError && 'border-red-400')}
                    maxLength={30}
                  />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                    <input
                      type="text"
                      placeholder="instagram_id"
                      value={row.instagram_id}
                      onChange={(e) => updateRow(row.id, { instagram_id: e.target.value.replace(/^@/, ''), instagramError: '' })}
                      className={cn('input-base text-sm pl-7', row.instagramError && 'border-red-400')}
                      maxLength={30}
                    />
                  </div>
                  <button
                    onClick={() => idx > 0 && removeRow(row.id)}
                    className={cn('p-2 rounded-lg transition-colors', idx === 0 ? 'text-gray-200 cursor-default' : 'text-gray-400 hover:text-red-500 hover:bg-red-50')}
                    disabled={idx === 0}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {row.nicknameError && (
                  <p className="text-xs text-red-500 px-1">{row.nicknameError}</p>
                )}
              </div>
            ))}
          </div>

          {/* 친구 추가 */}
          <button
            onClick={addRow}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-brand-blue hover:text-brand-blue transition-colors"
          >
            <Plus size={16} />
            친구 추가
          </button>

          {/* 에러 */}
          {submitError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} />
              <span>{submitError}</span>
            </div>
          )}

          {/* 제출 */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? '등록 중...' : `${rows.filter((r) => r.nickname.trim()).length}명 등록하기`}
          </button>
        </div>
      )}
    </div>
  )
}
