'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const REASONS = ['잘못된 정보', '사칭', '부적절한 내용', '기타']

export default function ReportButton({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!reason) return
    setLoading(true)
    await supabase.from('reports').insert({
      profile_id: profileId,
      type: 'report',
      reason,
      is_self_claimed: false,
      status: 'pending',
    })
    setLoading(false)
    setDone(true)
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-red-400 transition">
      신고
    </button>
  )

  if (done) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center space-y-4">
        <div className="text-4xl">✅</div>
        <p className="font-semibold text-gray-900">신고가 접수되었습니다</p>
        <p className="text-sm text-gray-500">검토 후 조치하겠습니다.</p>
        <button onClick={() => { setOpen(false); setDone(false) }}
          className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">
          확인
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="font-bold text-lg mb-5">신고 사유 선택</h3>
        <div className="space-y-2 mb-5">
          {REASONS.map(r => (
            <button key={r} onClick={() => setReason(r)}
              className={`w-full border rounded-xl p-3 text-left text-sm transition ${
                reason === r ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
              }`}>
              {r}
            </button>
          ))}
        </div>
        <button onClick={submit} disabled={loading || !reason}
          className="w-full bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 mb-2">
          {loading ? '처리 중...' : '신고하기'}
        </button>
        <button onClick={() => setOpen(false)} className="w-full text-gray-400 py-2 text-sm hover:text-gray-600">
          취소
        </button>
      </div>
    </div>
  )
}
