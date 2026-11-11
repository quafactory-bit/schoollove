// Shared allowlists only. Never store names, queries, URLs, UA text or account IDs here.
export const FUNNEL_EVENTS = [
  'landing_view','home_viewed','home_search_submitted','school_search_submitted',
  'school_result_selected','school_detail_viewed','chalkboard_initials_started',
  'google_login_started','google_login_completed','signup_completed',
  'summons_share_clicked','cohort_link_share_clicked',
] as const
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number]
export const CLIENT_FUNNEL_EVENTS = [
  'landing_view','home_viewed','home_search_submitted','school_search_submitted',
  'school_result_selected','school_detail_viewed','cohort_link_share_clicked',
] as const
export const FUNNEL_SOURCES = ['direct','instagram','threads','share','other'] as const
export type FunnelSource = (typeof FUNNEL_SOURCES)[number]
export const FUNNEL_BROWSERS = ['external','instagram','threads','facebook','unknown'] as const
export type FunnelBrowser = (typeof FUNNEL_BROWSERS)[number]
export const FUNNEL_COOKIE = 'sl_p2_context'
export const FUNNEL_TTL_SECONDS = 30 * 60
export const FUTURE_FUNNEL_EVENTS: readonly FunnelEvent[] = ['chalkboard_initials_started','summons_share_clicked']
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const FUNNEL_LABELS: Record<FunnelEvent,string> = {
  landing_view:'유입',home_viewed:'홈 보기',home_search_submitted:'홈에서 검색',
  school_search_submitted:'학교 검색',school_result_selected:'검색 결과 학교 선택',
  school_detail_viewed:'학교 상세',chalkboard_initials_started:'칠판 초성 입력',
  google_login_started:'Google 로그인 시작',google_login_completed:'Google 로그인 완료',
  signup_completed:'첫 학교 등록까지 가입 완료',summons_share_clicked:'소환장 공유 클릭',
  cohort_link_share_clicked:'기수 링크 공유 클릭',
}
export function classifyFunnelBrowser(ua: string | null): FunnelBrowser {
  if (!ua) return 'unknown'
  if (/threads|barcelona/i.test(ua)) return 'threads'
  if (/instagram/i.test(ua)) return 'instagram'
  if (/FBAN|FBAV/i.test(ua)) return 'facebook'
  if (/;\s*wv\)|webview/i.test(ua)) return 'unknown'
  return 'external'
}
export function normalizeFunnelSource(value: unknown): FunnelSource {
  if (value === 'ig' || value === 'instagram') return 'instagram'
  if (value === 'threads' || value === 'share' || value === 'direct') return value
  return 'other'
}
export function incomingFunnelSource(href: string, referrer = ''): FunnelSource {
  try {
    const url = new URL(href)
    for (const key of ['ref','utm_source']) {
      const values = url.searchParams.getAll(key)
      if (values.length) return values.length === 1 ? normalizeFunnelSource(values[0]) : 'other'
    }
    if (!referrer) return 'direct'
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./,'')
    const own = url.hostname.toLowerCase().replace(/^www\./,'')
    if (host === own) return 'direct'
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
    if (['threads.net','threads.com'].some(d => host === d || host.endsWith('.'+d))) return 'threads'
    return 'other'
  } catch { return 'direct' }
}
export function parseFunnelCookie(value: string | undefined): {source:FunnelSource;browser:FunnelBrowser} | null {
  const parts = value?.split('.')
  if (parts?.length !== 3 || parts[0] !== '1' || !FUNNEL_SOURCES.includes(parts[1] as FunnelSource) || !FUNNEL_BROWSERS.includes(parts[2] as FunnelBrowser)) return null
  return {source:parts[1] as FunnelSource,browser:parts[2] as FunnelBrowser}
}
