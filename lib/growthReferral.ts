export const GROWTH_VISIT_COOKIE = 'sl_growth_visit'
export const GROWTH_TOKEN_PATTERN = /^[a-f0-9]{64}$/

export function isSameOriginGrowthRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  return origin === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site'
}

export function buildGrowthShareUrl(origin: string, slug: string, token: string): string {
  if (!GROWTH_TOKEN_PATTERN.test(token)) throw new Error('INVALID_GROWTH_TOKEN')
  // Fragment is never sent as an HTTP request path, referrer, or OG parameter.
  return `${origin}/school/${encodeURIComponent(slug)}#grow=${token}`
}
