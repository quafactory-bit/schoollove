'use client'

import { useState } from 'react'
import { X, AlertCircle, Check, Loader2 } from 'lucide-react'
import { insertReport } from '@/lib/api/reports'
import { normalizeInstagramId, validateInstagramId, cn } from '@/lib/utils'
import type { Profile } from '@/types/profile'

interface EditDeleteModalProps {
  profile: Profile
  onClose: () => void
  onSuccess: () => void
}

type Mode = 'select' | 'edit' | 'delete'

export default function EditDeleteModal({ profile, onClose, onSuccess }: EditDeleteModalProps) {
  const [mode, setMode] = useState<Mode>(profile.instagram_id ? 'select' : 'edit')
  const [newInstaId, setNewInstaId] = useState('')
  const [selfClaimed, setSelfClaimed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    setError('')

    if (!selfClaimed) {
      setError('본인 또는 정당한 관계자 확인이 필요합니다.')
      return
    }

    if (mode === 'edit') {
      const normalized = normalizeInstagramId(newInstaId)
      if (!normalized) {
        setError('인스타그램 ID를 입력해주세요.')
        return
      }
      if (!validateInstagramId(normalized)) {
        setError('유효하지 않은 인스타그램 ID입니다.')
        return
      }
    }

    setLoading(true)
    const { error: err } = await insertReport({
      profile_id: profile.id,
      type: mode === 'delete' ? 'delete' : 'edit',
      reason: mode === 'delete' ? '삭제 요청' : '인스타그램 ID 수정 요청',
      requested_instagram_id: mode === 'edit' ? normalizeInstagramId(newInstaId) : null,
      is_self_claimed: selfClaimed,
    })
    setLoading(false)

    if (err) {
      setError(err)
      return
    }

    setDone(true)
    setTimeout(onSuccess, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {mode === 'delete' ? '삭제 요청' : '수정 요청'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-50">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <Check size={24} className="text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">요청이 접수되었습니다</p>
              <p className="text-xs text-gray-500 text-center">
                관리자 확인 후 처리됩니다. 감사합니다.
              </p>
            </div>
          ) : (
            <>
              {/* 대상 프로필 */}
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{profile.nickname}</p>
                {profile.instagram_id && (
                  <p className="text-xs text-gray-500 mt-0.5">@{profile.instagram_id}</p>
                )}
              </div>

              {/* mode 선택 (기존 등록이 있을 때) */}
              {mode === 'select' && (
                <div className="space-y-2">
                  <button
                    onClick={() => setMode('edit')}
                    className="w-full text-left px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-800 hover:border-brand-blue hover:bg-brand-blue-light transition-colors"
                  >
                    📝 인스타그램 ID 수정
                  </button>
                  <button
                    onClick={() => setMode('delete')}
                    className="w-full text-left px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors"
                  >
                    🗑 이 정보 삭제 요청
                  </button>
                </div>
              )}

              {/* 수정 폼 */}
              {mode === 'edit' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">
                      {profile.instagram_id ? '새 인스타그램 ID' : '인스타그램 ID 추가'}
                    </label>
                    <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand-blue focus-within:ring-1 focus-within:ring-brand-blue/20">
                      <span className="text-gray-400 text-sm">@</span>
                      <input
                        type="text"
                        value={newInstaId}
                        onChange={(e) => setNewInstaId(e.target.value.replace(/^@/, ''))}
                        placeholder="instagram_id"
                        className="flex-1 text-sm outline-none text-gray-900 placeholder-gray-400"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 삭제 확인 */}
              {mode === 'delete' && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-sm text-red-700">
                    삭제 요청은 관리자 검토 후 처리됩니다.
                    실제 본인 또는 관계자만 요청해주세요.
                  </p>
                </div>
              )}

              {/* 본인 확인 체크 */}
              {mode !== 'select' && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selfClaimed}
                    onChange={(e) => setSelfClaimed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-brand-blue cursor-pointer"
                  />
                  <span className="text-xs text-gray-600">
                    본인 또는 정당한 관계자임을 확인합니다.
                  </span>
                </label>
              )}

              {/* 에러 */}
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              {/* 버튼 */}
              {mode !== 'select' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setMode('select')}
                    className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    뒤로
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className={cn(
                      'flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5',
                      mode === 'delete'
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-brand-blue text-white hover:bg-brand-blue-hover',
                      loading && 'opacity-70 cursor-not-allowed'
                    )}
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    {mode === 'delete' ? '삭제 요청' : '수정 요청'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
