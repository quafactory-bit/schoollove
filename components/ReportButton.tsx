'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const REASONS = ['\uc798\ubabb\ub41c \uc815\ubcf4', '\uc0ac\uce6d', '\ubd80\uc801\uc808\ud55c \ub0b4\uc6a9', '\uae30\ud0c0']

export default function ReportButton({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!reason) return
    setLoading(true)
    await supabase.from('reports').insert({ profile_id: profileId, type: 'report', reason, is_self_claimed: false, status: 'pending' })
    setLoading(false)
    setDone(true)
  }

  if (!open) return <button onClick={() => setOpen(true)} className='text-xs text-gray-400 hover:text-red-400'>{'\uc2e0\uace0'}</button>

  if (done) return (
    <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-2xl p-6 w-full max-w-sm text-center'>
        <div className='text-4xl mb-3'>checkmark</div>
        <p className='font-semibold mb-4'>{'\uc2e0\uace0\uac00 \uc811\uc218\ub410\uc2b5\ub2c8\ub2e4'}</p>
        <button onClick={() => { setOpen(false); setDone(false) }} className='w-full bg-blue-600 text-white py-2 rounded-lg'>{'\ud655\uc778'}</button>
      </div>
    </div>
  )

  return (
    <div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'>
      <div className='bg-white rounded-2xl p-6 w-full max-w-sm'>
        <h3 className='font-bold text-lg mb-4'>{'\uc2e0\uace0 \uc0ac\uc720 \uc120\ud0dd'}</h3>
        <div className='space-y-2 mb-4'>
          {REASONS.map(r => (<button key={r} onClick={() => setReason(r)} className={\w-full border rounded-xl p-3 text-left text-sm \\}>{r}</button>))}
        </div>
        <button onClick={submit} disabled={loading || !reason} className='w-full bg-red-500 text-white py-2 rounded-lg disabled:opacity-50 mb-2'>{loading ? '\ucc98\ub9ac \uc911...' : '\uc2e0\uace0\ud558\uae30'}</button>
        <button onClick={() => setOpen(false)} className='w-full text-gray-500 py-2 text-sm'>{'\ucde8\uc18c'}</button>
      </div>
    </div>
  )
}