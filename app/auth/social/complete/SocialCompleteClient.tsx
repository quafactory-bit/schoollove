'use client'

import { useEffect, useState } from 'react'

export default function SocialCompleteClient() {
  const [message, setMessage] = useState('소셜 로그인을 안전하게 완료하고 있습니다.')
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = parameters.get('access_token')
    const refreshToken = parameters.get('refresh_token')
    window.history.replaceState(null, '', '/auth/social/complete')
    if (!accessToken || !refreshToken) { setMessage('로그인 세션을 확인할 수 없습니다.'); return }
    void fetch('/auth/social/complete/session', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    }).then(async response => {
      if (!response.ok) throw new Error('completion rejected')
      const result = await response.json() as { redirect?: unknown }
      if (result.redirect !== '/account') throw new Error('completion rejected')
      window.location.replace('/account')
    }).catch(() => setMessage('로그인을 완료할 수 없습니다. 다시 시도해 주세요.'))
  }, [])
  return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="text-2xl font-bold text-gray-950">소셜 로그인 완료</h1><p className="mt-3 text-sm leading-6 text-gray-600" role="status">{message}</p></main>
}
