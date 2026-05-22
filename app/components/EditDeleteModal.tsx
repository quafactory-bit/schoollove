'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  profileId: string
  nickname: string
  instagramId: string | null
  onClose: () => void
}

export default function EditDeleteModal({ profileId, nickname, instagramId, onClose }: Props) {
  const [mode, setMode] = useState<'select' | 'edit' | 'delete'>('select')
  const [newInstagram, setNewInstagram] = useState('')
  const [selfClaimed, setSelfClaimed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!selfClaimed) return alert('본인 또는 정당한 관계자 확인이 필요합니다.')
    setLoading(true)
    await supabase.from('reports').insert({
      profile_id: profileId,
      type: mode,
      reason: mode === 'delete' ? '삭제 요청' : '수정 요청',
      requested_instagram_id: mode === 'edit' ? newInstagram : null,
      is_self_claimed: true,
      status: 'pending',
    })
    setLoading(false)
    setDone(true)
  }

  if (done) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
        <div className="text-4xl mb-3">✅</div>
        <p className="font-semibold mb-1">요청이 접수됐습니다</p>
        <p className="text-sm text-gray-500 mb-4">관리자 확인 후 처리됩니다</p>
        <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 rounded-lg">확인</button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="font-bold text-lg mb-4">{nickname} 님 정보</h3>

        {mode === 'select' && (
          <div className="space-y-3">
            <button onClick={() => setMode('edit')} className="w-full border border-gray-200 rounded-xl p-3 text-left hover:bg-gray-50">
              <div className="font-medium">인스타그램 ID 수정</div>
              <div className="text-sm text-gray-500">잘못된 ID를 수정 요청합니다</div>
            </button>
            <button onClick={() => setMode('delete')} className="w-full border border-red-100 rounded-xl p-3 text-left hover:bg-red-50">
              <div className="font-medium text-red-600">이 정보 삭제 요청</div>
              <div className="text-sm text-gray-500">등록된 정보 삭제를 요청합니다</div>
            </button>
            <button onClick={onClose} className="w-full text-gray-500 py-2 text-sm">취소</button>
          </div>
        )}

        {mode === 'edit' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">현재: {instagramId ? `@${instagramId}` : '미등록'}</p>
            <input
              value={newInstagram}
              onChange={e => setNewInstagram(e.target.value.replace('@', ''))}
              placeholder="새 인스타그램 ID"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={selfClaimed} onChange={e => setSelfClaimed(e.target.checked)} className="mt-0.5" />
              본인 또는 정당한 관계자입니다
            </label>
            <button onClick={submit} disabled={loading || !newInstagram} className="w-full bg-blue-600 text-white py-2 rounded-lg disabled:opacity-50">
              {loading ? '처리 중...' : '수정 요청'}
            </button>
            <button onClick={() => setMode('select')} className="w-full text-gray-500 py-2 text-sm">뒤로</button>
          </div>
        )}

        {mode === 'delete' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">이 정보의 삭제를 요청합니다. 관리자 확인 후 처리됩니다.</p>
            <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={selfClaimed} onChange={e => setSelfClaimed(e.target.checked)} className="mt-0.5" />
              본인 또는 정당한 관계자입니다
            </label>
            <button onClick={submit} disabled={loading} className="w-full bg-red-600 text-white py-2 rounded-lg disabled:opacity-50">
              {loading ? '처리 중...' : '삭제 요청'}
            </button>
            <button onClick={() => setMode('select')} className="w-full text-gray-500 py-2 text-sm">뒤로</button>
          </div>
        )}
      </div>
    </div>
  )
}