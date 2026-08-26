'use client'

import { useEffect, useState } from 'react'
import {
  executeShareButton,
  type ShareButtonContent,
} from '@/lib/schoolShare'

type ShareButtonProps = ShareButtonContent & {
  label?: string
  className?: string
}

// Web Share API 지원 기기는 네이티브 공유 시트, 아니면 링크 복사로 폴백
export default function ShareButton(props: ShareButtonProps) {
  const { label = '공유하기', className } = props
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [copied])

  async function handleShare() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    const outcome = await executeShareButton(props, {
      origin: window.location.origin,
      share: nav && typeof nav.share === 'function' ? nav.share.bind(nav) : undefined,
      writeClipboard: nav?.clipboard && typeof nav.clipboard.writeText === 'function'
        ? nav.clipboard.writeText.bind(nav.clipboard)
        : undefined,
    })
    if (outcome === 'copied') setCopied(true)
  }

  return (
    <button type="button" onClick={handleShare} className={className}>
      {copied ? '링크 복사됨' : label}
      <span className="sr-only" aria-live="polite">{copied ? '링크 복사됨' : ''}</span>
    </button>
  )
}
