'use client'

import { useState } from 'react'

interface ShareButtonProps {
  text: string
  url: string
  label?: string
  className?: string
}

// Web Share API 지원 기기는 네이티브 공유 시트, 아니면 링크 복사로 폴백
export default function ShareButton({ text, url, label = '공유하기', className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title: '스쿨러브아이', text, url })
        return
      } catch {
        // 사용자가 공유를 취소한 경우 등 → 조용히 무시
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드 불가 → 무시
    }
  }

  return (
    <button type="button" onClick={handleShare} className={className}>
      {copied ? '복사됨!' : label}
    </button>
  )
}
