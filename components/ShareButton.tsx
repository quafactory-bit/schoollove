'use client'

import { useEffect, useState } from 'react'
import { buildSchoolSharePayload, executeSchoolShare, type SchoolSharePayload } from '@/lib/schoolShare'

type ShareButtonProps = {
  url: string
  label?: string
  className?: string
} & (
  | { text: string; schoolName?: never }
  | { schoolName: string; text?: never }
)

// Web Share API 지원 기기는 네이티브 공유 시트, 아니면 링크 복사로 폴백
export default function ShareButton(props: ShareButtonProps) {
  const { url, label = '공유하기', className } = props
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [copied])

  async function handleShare() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    let payload: SchoolSharePayload | null

    if ('schoolName' in props && props.schoolName) {
      payload = buildSchoolSharePayload({ schoolName: props.schoolName, href: url, origin: window.location.origin })
    } else {
      payload = { title: '스쿨러브아이', text: props.text ?? '', url }
    }

    if (!payload) return
    const outcome = await executeSchoolShare(payload, {
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
