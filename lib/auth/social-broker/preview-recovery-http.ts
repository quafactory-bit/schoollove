import 'server-only'
import { recoveryOtpMac } from '../social-account/recovery'
import { prepareAndDeliverAttemptRecovery, type RecoveryDeliveryDatabase, type RecoveryOtpDeliveryTransport } from '../social-account/recovery-delivery'
import { ResendRecoveryOtpDeliveryTransport } from '../social-account/resend-recovery-transport'
import { loadUserLoginBrokerConfig } from './preview-config'
import { activatePreviewSocialAccountFromAttempt, bindPreviewAuthPrincipal, consumePreviewRecoveryDecision, createPreviewRecoveryDatabase, type PreviewRpcClient } from './preview-persistence'
import { createActiveBrokerServices, type ActiveBrokerServices } from './preview-runtime'
import { openRecoveryContinuity, recoveryContinuityCookie, sealRecoveryContinuity, type RecoveryContinuity } from './recovery-continuity-session'

const COOKIE_OPTIONS = recoveryContinuityCookie.options
const clearCookie = { ...COOKIE_OPTIONS, maxAge: 0 }
const OTP = /^[0-9]{8}$/
const MAX_SESSION_TOKEN_LENGTH = 8192

function cookieHeader(name: string, value: string, options: typeof COOKIE_OPTIONS | typeof clearCookie): string {
  return `${name}=${value}; Max-Age=${options.maxAge}; Path=${options.path}; HttpOnly; Secure; SameSite=Lax`
}
function readCookie(request: Request, name: string): string | undefined {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
}
function coarse(status: number, message: string): Response {
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>소셜 로그인 복구</title><main><h1>소셜 로그인 복구</h1><p>${message}</p></main></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
function recoveryPage(stage: RecoveryContinuity['stage']): Response {
  if (stage === 'recovery_required') return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>복구 이메일 확인</title><main><h1>복구 이메일 확인</h1><p>이 주소는 로그인 ID로 사용되지 않습니다.</p><form method="post"><input type="hidden" name="action" value="send"><label>복구 이메일 <input name="recovery_email" type="email" autocomplete="email" maxlength="254" required></label><button type="submit">인증번호 받기</button></form></main></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  if (stage === 'otp_sent') return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>인증번호 확인</title><main><h1>인증번호 확인</h1><p>이메일로 받은 8자리 인증번호를 입력하세요.</p><form method="post"><input type="hidden" name="action" value="verify"><label>인증번호 <input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" minlength="8" maxlength="8" required></label><button type="submit">확인</button></form></main></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  return coarse(400, '이미 처리된 요청입니다.')
}

async function rpcText(client: PreviewRpcClient, name: string, args: Record<string, unknown>): Promise<string | null> {
  const result = await Promise.resolve(client.rpc(name, args))
  return result.error || typeof result.data !== 'string' ? null : result.data
}

export async function activeBrokerRecoveryServices(request: Request): Promise<ActiveBrokerServices | null> {
  try {
    const config = loadUserLoginBrokerConfig()
    if (!config || new URL(request.url).origin !== config.issuer) return null
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    return createActiveBrokerServices(config, getSupabaseAdmin())
  } catch { return null }
}

async function trustedRecovery(request: Request, services: ActiveBrokerServices): Promise<RecoveryContinuity | null> {
  try {
    const value = openRecoveryContinuity(readCookie(request, recoveryContinuityCookie.name), services.config.browserSessionKey, services.now())
    if (value.stage === 'downstream_finalized') return value
    const outcome = await rpcText(services.client, 'get_social_recovery_http_context', { target_attempt_id: value.trustedAttemptId })
    return outcome === 'RECOVERY_REQUIRED' ? value : null
  } catch { return null }
}

export async function recoveryGet(request: Request): Promise<Response> {
  const services = await activeBrokerRecoveryServices(request)
  if (!services) return new Response(null, { status: 404 })
  const continuity = await trustedRecovery(request, services)
  return continuity && continuity.stage !== 'downstream_finalized' ? recoveryPage(continuity.stage) : coarse(400, '복구 요청을 확인할 수 없습니다.')
}

export async function recoveryPost(request: Request): Promise<Response> {
  const services = await activeBrokerRecoveryServices(request)
  if (!services) return new Response(null, { status: 404 })
  return recoveryPostWithServices(request, services, {
    createDatabase: createPreviewRecoveryDatabase,
    createTransport: active => new ResendRecoveryOtpDeliveryTransport({ apiKey: active.config.recovery.resendApiKey, from: active.config.recovery.emailFrom }),
  })
}

export type RecoveryPostDependencies = Readonly<{
  createDatabase(client: PreviewRpcClient): RecoveryDeliveryDatabase
  createTransport(services: ActiveBrokerServices): RecoveryOtpDeliveryTransport
}>

/** Server-only, dependency-injected recovery boundary used by executable HTTP tests. */
export async function recoveryPostWithServices(
  request: Request,
  services: ActiveBrokerServices,
  dependencies: RecoveryPostDependencies,
): Promise<Response> {
  if (request.headers.get('origin') !== services.config.issuer) return coarse(400, '잘못된 요청입니다.')
  const continuity = await trustedRecovery(request, services)
  if (!continuity || continuity.stage === 'downstream_finalized') return coarse(400, '복구 요청을 확인할 수 없습니다.')
  let form: FormData
  try { form = await request.formData() } catch { return coarse(400, '잘못된 요청입니다.') }
  const action = form.get('action')
  if (action === 'send') {
    if (continuity.stage !== 'recovery_required') return coarse(400, '이미 인증번호가 발송되었습니다.')
    const recoveryEmail = form.get('recovery_email')
    if (typeof recoveryEmail !== 'string') return coarse(400, '복구 이메일을 확인해 주세요.')
    const result = await prepareAndDeliverAttemptRecovery({
      attemptId: continuity.trustedAttemptId, recoveryEmail,
      recoveryHmacKey: services.config.recovery.hmacKey,
      recoveryEncryptionKey: services.config.recovery.encryptionKey,
      otpMacKey: services.config.recovery.otpMacKey,
      database: dependencies.createDatabase(services.client), transport: dependencies.createTransport(services),
    })
    if (result.state === 'limited') return coarse(429, '잠시 후 다시 시도해 주세요.')
    if (result.state !== 'sent' || !result.verificationId) return coarse(503, '인증번호를 발송할 수 없습니다.')
    const response = new Response(null, { status: 303, headers: { location: '/auth/social/recovery', 'cache-control': 'no-store' } })
    response.headers.set('set-cookie', cookieHeader(recoveryContinuityCookie.name, sealRecoveryContinuity({ ...continuity, stage: 'otp_sent', verificationId: result.verificationId, issuedAt: services.now(), expiresAt: services.now() + 600 }, services.config.browserSessionKey), COOKIE_OPTIONS))
    return response
  }
  if (action !== 'verify' || continuity.stage !== 'otp_sent' || !continuity.verificationId) return coarse(400, '잘못된 요청입니다.')
  const otp = form.get('otp')
  if (typeof otp !== 'string' || !OTP.test(otp)) return coarse(400, '8자리 인증번호를 확인해 주세요.')
  let decision
  try {
    decision = await consumePreviewRecoveryDecision(services.client, { attemptId: continuity.trustedAttemptId, verificationId: continuity.verificationId, otpMac: recoveryOtpMac(continuity.verificationId, otp, services.config.recovery.otpMacKey) })
  } catch { return coarse(400, '인증 요청을 처리할 수 없습니다.') }
  if (decision.outcome === 'USE_PRIMARY_PROVIDER') {
    const response = coarse(409, '이미 사용 중인 기본 소셜 로그인 제공자로 다시 로그인해 주세요.')
    response.headers.set('set-cookie', cookieHeader(recoveryContinuityCookie.name, '', clearCookie)); return response
  }
  if (decision.outcome === 'OTP_REJECTED') return coarse(401, '인증번호가 올바르지 않습니다.')
  if (decision.outcome !== 'ACCOUNT_DECIDED' && decision.outcome !== 'EXISTING_PRIMARY') {
    const response = coarse(decision.outcome === 'LOCKED' ? 423 : decision.outcome === 'EXPIRED' ? 410 : 409, '이 복구 요청을 계속할 수 없습니다.')
    response.headers.set('set-cookie', cookieHeader(recoveryContinuityCookie.name, '', clearCookie)); return response
  }
  try {
    const finalized = await services.orchestrator.finalizeReadyAttempt({ trustedAttemptId: continuity.trustedAttemptId, authenticationTime: continuity.authenticationTime })
    if (finalized.redirectUri !== services.config.supabaseCallback) throw new Error('RECOVERY_FINALIZATION_REJECTED')
    const destination = new URL(services.config.supabaseCallback); destination.searchParams.set('code', finalized.authorizationCode)
    if (finalized.downstreamState !== null) destination.searchParams.set('state', finalized.downstreamState)
    const response = new Response(null, { status: 302, headers: { location: destination.toString(), 'cache-control': 'no-store' } })
    response.headers.set('set-cookie', cookieHeader(recoveryContinuityCookie.name, sealRecoveryContinuity({ ...continuity, stage: 'downstream_finalized', verificationId: null, issuedAt: services.now(), expiresAt: services.now() + 600 }, services.config.browserSessionKey), COOKIE_OPTIONS))
    return response
  } catch {
    const response = coarse(400, '로그인 완료 요청을 처리할 수 없습니다.')
    response.headers.set('set-cookie', cookieHeader(recoveryContinuityCookie.name, '', clearCookie)); return response
  }
}

export async function completeSocialSession(request: Request): Promise<Response> {
  const services = await activeBrokerRecoveryServices(request)
  if (!services || request.headers.get('origin') !== services.config.issuer) return new Response(null, { status: services ? 400 : 404 })
  const [{ createPublicAuthClient, setUserSessionCookies }, { NextResponse }] = await Promise.all([import('@/lib/user-auth'), import('next/server')])
  return completeSocialSessionWithServices(request, services, {
    createAuthClient: createPublicAuthClient,
    bindPrincipal: bindPreviewAuthPrincipal,
    activateAccount: activatePreviewSocialAccountFromAttempt,
    createSuccessResponse: () => NextResponse.json({ authenticated: true, redirect: '/account' }, { headers: { 'cache-control': 'no-store' } }),
    setSessionCookies: setUserSessionCookies,
  })
}

type CompletionIdentity = Readonly<{ id?: string; provider?: string; identity_data?: Readonly<{ sub?: unknown }> }>
type CompletionUser = Readonly<{ id: string; identities?: readonly CompletionIdentity[] }>
type CompletionSession = Readonly<{ access_token: string; refresh_token: string; expires_in?: number }>
type CompletionAuthClient = Readonly<{ auth: Readonly<{
  getUser(accessToken: string): Promise<Readonly<{ data: Readonly<{ user: CompletionUser | null }>; error: unknown }>>
  refreshSession(session: Readonly<{ refresh_token: string }>): Promise<Readonly<{ data: Readonly<{ session: CompletionSession | null; user?: CompletionUser | null }>; error: unknown }>>
}> }>

export type SocialSessionCompletionDependencies = Readonly<{
  createAuthClient(): CompletionAuthClient
  bindPrincipal(client: PreviewRpcClient, input: Readonly<{ attemptId: string; authUserId: string }>): Promise<unknown>
  activateAccount(client: PreviewRpcClient, attemptId: string): Promise<'SOCIAL_ACCOUNT_ACTIVATED' | 'SOCIAL_ACCOUNT_ALREADY_ACTIVE' | 'SOCIAL_ACCOUNT_LAUNCH_CLOSED' | 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED'>
  createSuccessResponse(): Response
  setSessionCookies(response: Response, session: CompletionSession): void
}>

/** Server-only, dependency-injected completion boundary used by executable security tests. */
export async function completeSocialSessionWithServices(
  request: Request,
  services: ActiveBrokerServices,
  dependencies: SocialSessionCompletionDependencies,
): Promise<Response> {
  let continuity: RecoveryContinuity
  try {
    continuity = openRecoveryContinuity(readCookie(request, recoveryContinuityCookie.name), services.config.browserSessionKey, services.now())
    if (continuity.stage !== 'downstream_finalized') throw new Error('SOCIAL_COMPLETION_REJECTED')
  } catch { return coarse(400, '로그인 완료 요청을 확인할 수 없습니다.') }
  let body: unknown
  try { body = await request.json() } catch { return coarse(400, '잘못된 요청입니다.') }
  const accessToken = typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).access_token === 'string' ? (body as Record<string, string>).access_token : ''
  const refreshToken = typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).refresh_token === 'string' ? (body as Record<string, string>).refresh_token : ''
  if (!accessToken || !refreshToken || accessToken.length > MAX_SESSION_TOKEN_LENGTH || refreshToken.length > MAX_SESSION_TOKEN_LENGTH) return coarse(400, '잘못된 요청입니다.')
  try {
    const auth = dependencies.createAuthClient()
    const submittedAccess = await auth.auth.getUser(accessToken)
    const accessUser = submittedAccess.data.user
    if (submittedAccess.error || !accessUser) throw new Error('SOCIAL_COMPLETION_SESSION_REJECTED')
    const refreshed = await auth.auth.refreshSession({ refresh_token: refreshToken })
    const session = refreshed.data.session
    if (refreshed.error || !session?.access_token || !session.refresh_token) throw new Error('SOCIAL_COMPLETION_SESSION_REJECTED')
    const refreshedAccess = await auth.auth.getUser(session.access_token)
    const user = refreshedAccess.data.user
    const expectedProvider = `custom:schoollove-${continuity.provider}`
    const identityMatches = user?.identities?.some(identity =>
      identity.provider === expectedProvider
      && identity.id === continuity.brokerSubject
      && identity.identity_data?.sub === continuity.brokerSubject
    ) ?? false
    if (refreshedAccess.error || !user || accessUser.id !== user.id || !identityMatches) throw new Error('SOCIAL_COMPLETION_SESSION_REJECTED')
    await dependencies.bindPrincipal(services.client, { attemptId: continuity.trustedAttemptId, authUserId: user.id })
    const activation = await dependencies.activateAccount(services.client, continuity.trustedAttemptId)
    if (activation === 'SOCIAL_ACCOUNT_ACTIVATION_REJECTED') throw new Error('SOCIAL_ACCOUNT_ACTIVATION_REJECTED')
    const response = dependencies.createSuccessResponse()
    dependencies.setSessionCookies(response, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      ...(typeof session.expires_in === 'number' && Number.isFinite(session.expires_in) ? { expires_in: session.expires_in } : {}),
    })
    response.headers.append('set-cookie', cookieHeader(recoveryContinuityCookie.name, '', clearCookie))
    return response
  } catch {
    const response = coarse(400, '로그인을 완료할 수 없습니다.')
    response.headers.set('set-cookie', cookieHeader(recoveryContinuityCookie.name, '', clearCookie)); return response
  }
}
