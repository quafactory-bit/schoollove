'use client'

import { useState } from 'react'
import { X, Check, Loader2, AlertCircle } from 'lucide-react'
import { insertReport } from '@/lib/api/reports'
import type { Profile } from '@/types/profile'

const REPORT_REASONS = [
  '잘못된 정보',
  '사칭',
  '부적절한 내용',
  '기타',
]

interface ReportButtonProps {
  profile: Profile
  onClose: () => void
  onSuccess: () => void
}

export default function ReportButton({ profile, onClose, onSuccess }: ReportButtonProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async () => {
    if (!reason) {
      setError('신고 사유를 선택해주세요.')
      return
    }

    setLoading(true)
    setError('')
    const { error: err } = await insertReport({
      profile_id: profile.id,
      type: 'report',
      reason,
      is_self_claimed: false,
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">신고하기</h3>
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
              <p className="text-sm font-medium text-gray-900">신고가 접수되었습니다</p>
            </div>
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{profile.nickname}</p>
                {profile.instagram_id && (
                  <p className="text-xs text-gray-500 mt-0.5">@{profile.instagram_id}</p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">신고 사유</p>
                {REPORT_REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="w-4 h-4 accent-brand-blue"
                    />
                    <span className="text-sm text-gray-700">{r}</span>
                  </label>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-70"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  신고하기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
