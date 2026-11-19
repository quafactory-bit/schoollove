import 'server-only'
import type { BrowserSessionKey } from './browser-continuity-session'
import { GOOGLE_LOGIN_HINT_COOKIE, oneTapClientId, sealLoginHint, verifyOneTapCredential } from './one-tap-hint'
import type { UpstreamHttpTransport } from './upstream-adapters'

const headers = { 'cache-control': 'no-store' }
const START = '/auth/social/start/google'

export type OneTapHttpDependencies = Readonly<{
  issuer: string | null
  clientId: string | undefined
  browserSessionKey: BrowserSessionKey | null
  transport: Pick<UpstreamHttpTransport, 'fetchJwks'>
  now(): number
}>

/**
 * POST {credential} from Google Identity Services. On success: a 2-minute sealed
 * login-hint cookie and `{ next: '/auth/social/start/google' }` — the SAME start
 * as the Google button. On any failure the client keeps the normal button.
 */
export async function oneTapPost(request: Request, deps: OneTapHttpDependencies): Promise<Response> {
  const clientId = oneTapClientId(deps.clientId)
  if (!deps.issuer || !clientId || !deps.browserSessionKey) return new Response(null, { status: 404, headers })
  if (new URL(request.url).origin !== deps.issuer || request.headers.get('origin') !== deps.issuer) return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403, headers })
  let credential: unknown
  try { credential = ((await request.json()) as { credential?: unknown })?.credential } catch { return Response.json({ error: 'INVALID_INPUT' }, { status: 400, headers }) }
  let sub: string
  try { sub = await verifyOneTapCredential({ credential, clientId, transport: deps.transport, now: deps.now() }) }
  catch { return Response.json({ error: 'ONE_TAP_REJECTED', next: START }, { status: 400, headers }) }
  const sealed = sealLoginHint({ sub, expiresAt: deps.now() + GOOGLE_LOGIN_HINT_COOKIE.options.maxAge }, deps.browserSessionKey)
  const response = Response.json({ next: START }, { headers })
  response.headers.append('set-cookie', `${GOOGLE_LOGIN_HINT_COOKIE.name}=${sealed}; Max-Age=${GOOGLE_LOGIN_HINT_COOKIE.options.maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`)
  return response
}
