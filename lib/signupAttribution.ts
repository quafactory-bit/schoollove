export const FIRST_TOUCH_KEY = 'sl_first_touch'
export const FIRST_TOUCH_TTL = 7 * 24 * 60 * 60 * 1000
const valuePattern = /^[a-z0-9_-]{1,40}$/
const fields = ['source', 'medium', 'campaign', 'content'] as const
export type Attribution = { source: string; medium: string | null; campaign: string | null; content: string | null; landing_path: string | null }
export type FirstTouch = Attribution & { ts: number }

export function validAttributionValue(value: unknown): value is string {
  return typeof value === 'string' && valuePattern.test(value)
}

// Never retain arbitrary URL segments (names, tokens, IDs or school history).
export function safeLandingPath(path: string): string {
  if (['/', '/login', '/account', '/onboarding', '/search', '/privacy', '/terms'].includes(path)) return path
  if (path.startsWith('/school/')) return '/school/[redacted]'
  return '/[redacted]'
}

export function referrerSource(referrer: string, origin: string): string {
  if (!referrer) return 'direct'
  try {
    const ref = new URL(referrer)
    const siteHost = new URL(origin).hostname.toLowerCase().replace(/^www\./, '')
    if (ref.hostname.toLowerCase().replace(/^www\./, '') === siteHost) return 'direct'
    const host = ref.hostname.toLowerCase()
    const within = (domain: string) => host === domain || host.endsWith(`.${domain}`)
    if (within('threads.net') || within('threads.com')) return 'threads'
    if (within('instagram.com')) return 'instagram'
    if (within('google.com') || within('google.co.kr') || within('naver.com') || within('daum.net')) return 'search'
    return 'other'
  } catch { return 'other' }
}

export function newFirstTouch(href: string, referrer: string, now = Date.now()): FirstTouch {
  const url = new URL(href)
  const values = fields.map(field => url.searchParams.get(`utm_${field}`))
  const hasUtm = values.some(value => value !== null)
  const [source, medium, campaign, content] = values.map(value => validAttributionValue(value) ? value : null)
  return {
    source: hasUtm ? source ?? 'unknown' : referrerSource(referrer, url.origin),
    medium: hasUtm ? medium : 'referral', campaign, content,
    landing_path: safeLandingPath(url.pathname), ts: now,
  }
}

export function parseFirstTouch(value: unknown, now = Date.now()): FirstTouch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (Object.keys(row).some(key => ![...fields, 'landing_path', 'ts'].includes(key))) return null
  if (typeof row.ts !== 'number' || !Number.isSafeInteger(row.ts) || row.ts > now || now - row.ts >= FIRST_TOUCH_TTL) return null
  if (!validAttributionValue(row.source)) return null
  for (const field of fields.slice(1)) if (row[field] !== null && !validAttributionValue(row[field])) return null
  if (typeof row.landing_path !== 'string' || row.landing_path.length > 120 || safeLandingPath(row.landing_path) !== row.landing_path) {
    // The two canonical redacted paths are safe persisted values.
    if (row.landing_path !== '/school/[redacted]' && row.landing_path !== '/[redacted]') return null
  }
  return row as FirstTouch
}

export function serverAttribution(value: unknown, now = Date.now()): Attribution {
  const parsed = parseFirstTouch(value, now)
  return parsed ? { source: parsed.source, medium: parsed.medium, campaign: parsed.campaign, content: parsed.content, landing_path: parsed.landing_path }
    : { source: 'unknown', medium: null, campaign: null, content: null, landing_path: null }
}

export function captureFirstTouch(storage: Storage, href: string, referrer: string, now = Date.now()): void {
  try {
    const existing = storage.getItem(FIRST_TOUCH_KEY)
    if (existing) {
      try { if (parseFirstTouch(JSON.parse(existing), now)) return } catch { /* Replace corrupt local data. */ }
    }
    storage.setItem(FIRST_TOUCH_KEY, JSON.stringify(newFirstTouch(href, referrer, now)))
  } catch { /* Attribution must never prevent navigation. */ }
}

export function readFirstTouch(): FirstTouch | null {
  try { return parseFirstTouch(JSON.parse(window.localStorage.getItem(FIRST_TOUCH_KEY) ?? 'null')) } catch { return null }
}

export function clearFirstTouch(): void {
  try { window.localStorage.removeItem(FIRST_TOUCH_KEY) } catch { /* Optional storage. */ }
}

export function analyticsUrl(href: string): string | null {
  try {
    const url = new URL(href)
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/growth/')) return null
    const original = new URLSearchParams(url.search)
    url.hash = ''; url.search = ''
    for (const field of fields) {
      const key = `utm_${field}`
      const value = original.get(key)
      if (original.getAll(key).length === 1 && validAttributionValue(value)) url.searchParams.set(key, value)
    }
    return url.toString()
  } catch { return null }
}
