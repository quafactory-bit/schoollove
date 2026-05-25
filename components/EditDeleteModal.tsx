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
    if (!selfClaimed) return alert('본인 또는 정당한 관계자임을 확인해주세요.')
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
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center space-y-4">
        <div className="text-4xl">✅</div>
        <p className="font-semibold text-gray-900">요청이 접수되었습니다</p>
        <p className="text-sm text-gray-500">관리자 검토 후 처리됩니다.</p>
        <button onClick={onClose} className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium">
          닫기
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="font-bold text-lg mb-1">{nickname}</h3>
        <p className="text-xs text-gray-400 mb-5">
          {instagramId ? `@${instagramId}` : '인스타그램 미등록'}
        </p>

        {mode === 'select' && (
          <div className="space-y-3">
            <button onClick={() => setMode('edit')}
              className="w-full border border-gray-200 rounded-xl p-3.5 text-left hover:bg-gray-50 transition">
              <div className="font-medium text-sm">인스타그램 ID 수정</div>
              <div className="text-xs text-gray-400 mt-0.5">잘못된 인스타 ID를 수정 요청합니다</div>
            </button>
            <button onClick={() => setMode('delete')}
              className="w-full border border-red-100 rounded-xl p-3.5 text-left hover:bg-red-50 transition">
              <div className="font-medium text-sm text-red-600">이 정보 삭제 요청</div>
              <div className="text-xs text-red-400 mt-0.5">관리자 확인 후 삭제 처리됩니다</div>
            </button>
            <button onClick={onClose} className="w-full text-gray-400 py-2 text-sm hover:text-gray-600">
              취소
            </button>
          </div>
        )}

        {mode === 'edit' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              현재: {instagramId ? `@${instagramId}` : '없음'}
            </p>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">새 인스타그램 ID</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                <input
                  value={newInstagram}
                  onChange={e => setNewInstagram(e.target.value.replace('@', ''))}
                  placeholder="instagram_id"
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={selfClaimed} onChange={e => setSelfClaimed(e.target.checked)} className="mt-0.5 shrink-0" />
              본인 또는 정당한 관계자입니다
            </label>
            <button onClick={submit} disabled={loading || !newInstagram || !selfClaimed}
              className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              {loading ? '처리 중...' : '수정 요청'}
            </button>
            <button onClick={() => setMode('select')} className="w-full text-gray-400 py-2 text-sm hover:text-gray-600">
              뒤로
            </button>
          </div>
        )}

        {mode === 'delete' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              이 프로필의 삭제를 요청합니다. 관리자가 검토 후 처리합니다.
            </p>
            <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={selfClaimed} onChange={e => setSelfClaimed(e.target.checked)} className="mt-0.5 shrink-0" />
              본인 또는 정당한 관계자입니다
            </label>
            <button onClick={submit} disabled={loading || !selfClaimed}
              className="w-full bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              {loading ? '처리 중...' : '삭제 요청'}
            </button>
            <button onClick={() => setMode('select')} className="w-full text-gray-400 py-2 text-sm hover:text-gray-600">
              뒤로
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
