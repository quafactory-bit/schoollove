'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { searchSchools, getSchoolById } from '@/lib/api/schools'
import { calculateLevelState } from '@/lib/policy/levelPolicy'
import { resolveLevelUpdate } from '@/lib/policy/levelPersistence'
import {
  validateCumulativeXp,
  compareStoredAndCalculatedLevel,
  describeSyncResult,
  type LevelSnapshot,
} from './validation'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import type { School } from '@/types/school'

export default function LevelSyncPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<School[]>([])
  const [searching, setSearching] = useState(false)

  const [schoolIdInput, setSchoolIdInput] = useState('')
  const [idLookupError, setIdLookupError] = useState<string | null>(null)

  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [levelSnapshot, setLevelSnapshot] = useState<LevelSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [xpInput, setXpInput] = useState('')

  const [executing, setExecuting] = useState(false)
  const [execResult, setExecResult] = useState<{
    before: LevelSnapshot
    after: LevelSnapshot
    cumulativeXp: number
  } | null>(null)
  const [execError, setExecError] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    searchSchools(trimmed, 10).then((data) => {
      if (!cancelled) {
        setResults(data)
        setSearching(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [query])

  async function loadLevelSnapshot(schoolId: string) {
    setLevelSnapshot(null)
    setSnapshotError(null)
    setDetailLoading(true)

    // getSchoolLevelSnapshot(lib/api/levels.ts)은 service role 기반 서버 전용 함수라
    // 클라이언트 컴포넌트에서 호출할 수 없다. schools_select_all RLS 정책 하에
    // anon client로 필요한 두 컬럼만 직접 조회한다 (app/admin/profiles/page.tsx와 동일 패턴).
    const { data, error } = await supabase
      .from('schools')
      .select('current_level, level_updated_at')
      .eq('id', schoolId)
      .single()

    if (error || !data) {
      setSnapshotError('Level 저장 상태를 불러오지 못했습니다.')
      setDetailLoading(false)
      return
    }

    setLevelSnapshot(data)
    setDetailLoading(false)
  }

  async function selectSchool(school: School) {
    // 실행 중에는 학교를 바꿀 수 없다 — 응답이 도착했을 때 execResult/loadLevelSnapshot이
    // 이미 다른 학교를 가리키는 상태(race condition)를 원천적으로 막는다.
    if (executing) return
    setSelectedSchool(school)
    setXpInput('')
    setExecResult(null)
    setExecError(null)
    await loadLevelSnapshot(school.id)
  }

  async function handleIdLookup(e: React.FormEvent) {
    e.preventDefault()
    if (executing) return
    setIdLookupError(null)
    const id = schoolIdInput.trim()
    if (!id) return

    const school = await getSchoolById(id)
    if (!school) {
      setIdLookupError('해당 School ID를 찾을 수 없습니다.')
      return
    }

    await selectSchool(school)
  }

  async function handleSync() {
    if (executing) return
    if (!selectedSchool) return
    if (xpValidation.value === null) return

    const schoolId = selectedSchool.id
    const cumulativeXp = xpValidation.value

    setExecuting(true)
    setExecError(null)
    setExecResult(null)

    try {
      const res = await fetch('/api/admin/tools/level-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId, cumulativeXp }),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        setExecError(json.error ?? `요청이 실패했습니다 (status ${res.status})`)
        return
      }

      setExecResult({
        before: json.before,
        after: json.after,
        cumulativeXp: json.cumulativeXp,
      })

      // 실행 후 저장 Level 상태를 다시 조회해 화면을 최신 DB 상태로 갱신한다.
      // route 응답을 재계산하지 않고, 기존 조회 함수를 그대로 재사용한다.
      await loadLevelSnapshot(schoolId)
    } catch {
      setExecError('네트워크 오류로 요청을 완료하지 못했습니다.')
    } finally {
      setExecuting(false)
    }
  }

  // Level 계산/저장 판단 로직을 여기서 다시 구현하지 않는다 — 기존 순수 함수를 그대로 재사용한다.
  const xpValidation = validateCumulativeXp(xpInput)
  const calculatedState = xpValidation.value !== null ? calculateLevelState(xpValidation.value) : null
  const decision =
    calculatedState && levelSnapshot
      ? resolveLevelUpdate(levelSnapshot.current_level, calculatedState)
      : null
  const comparison =
    calculatedState && levelSnapshot
      ? compareStoredAndCalculatedLevel(levelSnapshot.current_level, calculatedState.level)
      : null

  // 실행 결과 표시는 route 응답의 before/after 확정 사실만 사용한다.
  // 판단 로직은 ./validation의 describeSyncResult로 분리해 독립적으로 테스트한다.
  const resultLabel = execResult ? describeSyncResult(execResult.before, execResult.after) : null

  return (
    <div className="admin-game-ui min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
            ← 대시보드
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Level Sync Tool (v0.1)</h1>
        </div>

        <p className="text-xs text-gray-500 mb-6">
          Level Persistence 저장 상태를 학교 단위로 조회하고, cumulative XP를 입력해 동기화를
          실행하는 관리자 도구입니다. cumulative XP는 아직 자동으로 연결되지 않아 개발 검증용으로
          직접 입력합니다.
        </p>

        {/* 학교 이름 검색 */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">학교 이름 검색</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학교 이름 (2글자 이상)"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm mb-2"
          />

          {searching && <p className="text-xs text-gray-400">검색 중...</p>}

          {!searching && results.length > 0 && (
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              {results.map((school) => (
                <li key={school.id}>
                  <button
                    type="button"
                    onClick={() => selectSchool(school)}
                    disabled={executing}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-medium text-gray-900">{school.school_name}</span>
                    <span className="text-gray-400 ml-2 text-xs">
                      {school.sido} {school.sigungu} · {SCHOOL_TYPE_LABELS[school.school_type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-gray-400">검색 결과가 없습니다.</p>
          )}
        </div>

        {/* School ID 직접 조회 */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">School ID로 직접 조회</label>
          <form onSubmit={handleIdLookup} className="flex gap-2">
            <input
              type="text"
              value={schoolIdInput}
              onChange={(e) => setSchoolIdInput(e.target.value)}
              placeholder="School UUID"
              disabled={executing}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={executing}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              조회
            </button>
          </form>
          {idLookupError && <p className="text-xs text-red-600 mt-1">{idLookupError}</p>}
        </div>

        {/* 선택된 학교 상세 */}
        {selectedSchool && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">선택된 학교</h2>
            <dl className="text-sm space-y-1 mb-4">
              <div className="flex justify-between">
                <dt className="text-gray-500">학교명</dt>
                <dd className="text-gray-900">{selectedSchool.school_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">유형</dt>
                <dd className="text-gray-900">{SCHOOL_TYPE_LABELS[selectedSchool.school_type]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">지역</dt>
                <dd className="text-gray-900">
                  {selectedSchool.sido} {selectedSchool.sigungu}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">slug</dt>
                <dd className="text-gray-900">{selectedSchool.slug}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">School ID</dt>
                <dd className="text-gray-900 text-xs">{selectedSchool.id}</dd>
              </div>
            </dl>

            <h3 className="text-sm font-semibold text-gray-900 mb-2">저장된 Level 상태</h3>
            {detailLoading && <p className="text-xs text-gray-400">불러오는 중...</p>}
            {!detailLoading && snapshotError && (
              <p className="text-xs text-red-600">{snapshotError}</p>
            )}
            {!detailLoading && levelSnapshot && (
              <dl className="text-sm space-y-1">
                <div className="flex justify-between">
                  <dt className="text-gray-500">current_level</dt>
                  <dd className="text-gray-900">
                    {levelSnapshot.current_level ?? '미초기화 (null)'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">level_updated_at</dt>
                  <dd className="text-gray-900">{levelSnapshot.level_updated_at ?? '없음'}</dd>
                </div>
              </dl>
            )}

            {!detailLoading && !snapshotError && levelSnapshot && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  cumulative XP 입력 (개발 검증용)
                </h3>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  이 값은 개발 검증용 수동 입력입니다. 현재 XP Source는 연결되어 있지 않으며,
                  입력한 값이 아래 계산·비교에 그대로 사용됩니다.
                </p>

                <input
                  type="text"
                  inputMode="numeric"
                  value={xpInput}
                  onChange={(e) => setXpInput(e.target.value)}
                  placeholder="cumulativeXp (0 이상의 정수)"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm mb-1"
                />
                {xpValidation.error && (
                  <p className="text-xs text-red-600 mb-2">{xpValidation.error}</p>
                )}

                {calculatedState && decision && comparison && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <h4 className="text-xs font-semibold text-gray-700 mb-2">
                      계산 미리보기 (저장 없음)
                    </h4>
                    <dl className="text-sm space-y-1 mb-3">
                      <div className="flex justify-between">
                        <dt className="text-gray-500">계산된 Level</dt>
                        <dd className="text-gray-900">Lv.{calculatedState.level}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">저장된 current_level</dt>
                        <dd className="text-gray-900">
                          {levelSnapshot.current_level ?? '미초기화 (null)'}
                        </dd>
                      </div>
                    </dl>

                    <p className="text-xs font-medium text-gray-800 mb-2">
                      {comparison === 'uninitialized' &&
                        '미초기화 → 최초 저장 예정 (Level Up 아님)'}
                      {comparison === 'increase' &&
                        `상승 예정: Lv.${levelSnapshot.current_level} → Lv.${calculatedState.level}`}
                      {comparison === 'same' &&
                        `동일 (Lv.${levelSnapshot.current_level}, 변경 없음)`}
                      {comparison === 'lower' &&
                        `계산값이 더 낮음 — 저장된 Lv.${levelSnapshot.current_level} 유지 (하락 없음)`}
                    </p>

                    <dl className="text-xs text-gray-500 space-y-0.5 mb-4">
                      <div className="flex justify-between">
                        <dt>저장 예정 여부 (shouldPersistLevel)</dt>
                        <dd>{decision.shouldPersistLevel ? '예' : '아니오'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>실제 Level Up 여부 (levelIncreased)</dt>
                        <dd>{decision.levelIncreased ? '예' : '아니오'}</dd>
                      </div>
                    </dl>

                    <div className="border-t border-gray-200 pt-3">
                      <p className="text-xs text-gray-500 mb-2">
                        실행 전 확인: School <strong>{selectedSchool.school_name}</strong>, 입력 XP{' '}
                        <strong>{xpValidation.value}</strong>, 저장 Level{' '}
                        <strong>{levelSnapshot.current_level ?? 'null'}</strong> → 계산 Level{' '}
                        <strong>Lv.{calculatedState.level}</strong>
                      </p>
                      <button
                        type="button"
                        onClick={handleSync}
                        disabled={executing}
                        className={
                          executing
                            ? 'w-full bg-gray-300 text-gray-500 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed'
                            : 'w-full bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700'
                        }
                      >
                        {executing ? '실행 중...' : '동기화 실행'}
                      </button>

                      {execError && (
                        <p className="text-xs text-red-600 mt-2">{execError}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {execResult && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">실행 결과</h3>
                <dl className="text-xs text-gray-600 space-y-0.5 mb-2">
                  <div className="flex justify-between">
                    <dt>실행 입력 cumulativeXp</dt>
                    <dd>{execResult.cumulativeXp}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>before.current_level</dt>
                    <dd>{execResult.before.current_level ?? 'null'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>before.level_updated_at</dt>
                    <dd>{execResult.before.level_updated_at ?? '없음'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>after.current_level</dt>
                    <dd>{execResult.after.current_level ?? 'null'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>after.level_updated_at</dt>
                    <dd>{execResult.after.level_updated_at ?? '없음'}</dd>
                  </div>
                </dl>
                <p className="text-xs font-medium text-gray-800">{resultLabel}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
