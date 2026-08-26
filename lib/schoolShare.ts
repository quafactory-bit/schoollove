export type SchoolSharePayload = {
  title: '스쿨러브아이'
  text: string
  url: string
}

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'unavailable'

type ShareDependencies = {
  share?: (payload: SchoolSharePayload) => Promise<void>
  writeClipboard?: (value: string) => Promise<void>
}

const SCHOOL_PATH = /^\/school\/[^/?#]+$/

export function buildSchoolSharePayload({
  schoolName,
  href,
  origin,
}: {
  schoolName: string
  href: string
  origin: string
}): SchoolSharePayload | null {
  if (!SCHOOL_PATH.test(href)) return null

  try {
    const base = new URL(origin)
    if (!['http:', 'https:'].includes(base.protocol) || base.origin !== origin) return null
    const resolved = new URL(href, base.origin)
    if (resolved.origin !== base.origin || resolved.pathname !== href || resolved.search || resolved.hash) return null

    return {
      title: '스쿨러브아이',
      text: `스쿨러브아이에서 ${schoolName} 학교 정보를 확인해 보세요.`,
      url: resolved.href,
    }
  } catch {
    return null
  }
}

export function formatSchoolShareClipboard(payload: SchoolSharePayload) {
  return `${payload.text}\n${payload.url}`
}

export function isShareCancellation(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

export async function executeSchoolShare(
  payload: SchoolSharePayload,
  { share, writeClipboard }: ShareDependencies,
): Promise<ShareOutcome> {
  if (share) {
    try {
      await share(payload)
      return 'shared'
    } catch (error) {
      if (isShareCancellation(error)) return 'cancelled'
    }
  }

  if (!writeClipboard) return 'unavailable'

  try {
    await writeClipboard(formatSchoolShareClipboard(payload))
    return 'copied'
  } catch {
    return 'unavailable'
  }
}
