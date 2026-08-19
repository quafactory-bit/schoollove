import 'server-only'
import { recoveryOtpMac } from '../social-account/recovery'
import { prepareAndDeliverAttemptRecovery } from '../social-account/recovery-delivery'
import { ResendRecoveryOtpDeliveryTransport } from '../social-account/resend-recovery-transport'
import { PREVIEW_BROKER_ISSUER, PREVIEW_SUPABASE_CALLBACK, loadBrokerPreviewConfig } from './preview-config'
import { bindPreviewAuthPrincipal, consumePreviewRecoveryDecision, createPreviewRecoveryDatabase, type PreviewRpcClient } from './preview-persistence'
import { createActivePreviewServices, type ActivePreviewServices } from './preview-runtime'
import { openRecoveryContinuity, recoveryContinuityCookie, sealRecoveryContinuity, type RecoveryContinuity } from './recovery-continuity-session'

const COOKIE_OPTIONS = recoveryContinuityCookie.options
const clearCookie = { ...COOKIE_OPTIONS, maxAge: 0 }
const OTP = /^[0-9]{8}$/

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

export async function activePreviewRecoveryServices(request: Request): Promise<ActivePreviewServices | null> {
  try {
    if (new URL(request.url).origin !== PREVIEW_BROKER_ISSUER) return null
    const config = loadBrokerPreviewConfig()
    if (config.exposure !== 'preview') return null
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    return createActivePreviewServices(config, getSupabaseAdmin())
  } catch { return null }
}

async function trustedRecovery(request: Request, services: ActivePreviewServices): Promise<RecoveryContinuity | null> {
  try {
    const value = openRecoveryContinuity(readCookie(request, recoveryContinuityCookie.name), services.config.browserSessionKey, services.now())
    if (value.stage === 'downstream_finalized') return value
    const outcome = await rpcText(services.client, 'get_social_recovery_http_context', { target_attempt_id: value.trustedAttemptId })
    return outcome === 'RECOVERY_REQUIRED' ? value : null
  } catch { return null }
}

export async function recoveryGet(request: Request): Promise<Response> {
  const services = await activePreviewRecoveryServices(request)
  if (!services) return new Response(null, { status: 404 })
  const continuity = await trustedRecovery(request, services)
  return continuity && continuity.stage !== 'downstream_finalized' ? recoveryPage(continuity.stage) : coarse(400, '복구 요청을 확인할 수 없습니다.')
}

export async function recoveryPost(request: Request): Promise<Response> {
  const services = await activePreviewRecoveryServices(request)
  if (!services) return new Response(null, { status: 404 })
  if (request.headers.get('origin') !== PREVIEW_BROKER_ISSUER) return coarse(400, '잘못된 요청입니다.')
  const continuity = await trustedRecovery(request, services)
  if (!continuity || continuity.stage === 'downstream_finalized') return coarse(400, '복구 요청을 확인할 수 없습니다.')
  let form: FormData
  try { form = await request.formData() } catch { return coarse(400, '잘못된 요청입니다.') }
  const action = form.get('action')
  if (action === 'send') {
    if (continuity.stage !== 'recovery_required') return coarse(400, '이미 인증번호가 발송되었습니다.')
    const recoveryEmail = form.get('recovery_email')
    if (typeof recoveryEmail !== 'string') return coarse(400, '복구 이메일을 확인해 주세요.')
    const transport = new ResendRecoveryOtpDeliveryTransport({ apiKey: services.config.recovery.resendApiKey, from: services.config.recovery.emailFrom })
    const result = await prepareAndDeliverAttemptRecovery({
      attemptId: continuity.trustedAttemptId, recoveryEmail,
      recoveryHmacKey: services.config.recovery.hmacKey,
      recoveryEncryptionKey: services.config.recovery.encryptionKey,
      otpMacKey: services.config.recovery.otpMacKey,
      database: createPreviewRecoveryDatabase(services.client), transport,
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
    if (finalized.redirectUri !== PREVIEW_SUPABASE_CALLBACK) throw new Error('RECOVERY_FINALIZATION_REJECTED')
    const destination = new URL(PREVIEW_SUPABASE_CALLBACK); destination.searchParams.set('code', finalized.authorizationCode)
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
  const services = await activePreviewRecoveryServices(request)
  if (!services || request.headers.get('origin') !== PREVIEW_BROKER_ISSUER) return new Response(null, { status: services ? 400 : 404 })
  let continuity: RecoveryContinuity
  try {
    continuity = openRecoveryContinuity(readCookie(request, recoveryContinuityCookie.name), services.config.browserSessionKey, services.now())
    if (continuity.stage !== 'downstream_finalized') throw new Error('SOCIAL_COMPLETION_REJECTED')
  } catch { return coarse(400, '로그인 완료 요청을 확인할 수 없습니다.') }
  let body: unknown
  try { body = await request.json() } catch { return coarse(400, '잘못된 요청입니다.') }
  const accessToken = typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).access_token === 'string' ? (body as Record<string, string>).access_token : ''
  const refreshToken = typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).refresh_token === 'string' ? (body as Record<string, string>).refresh_token : ''
  if (!accessToken || !refreshToken || accessToken.length > 8192 || refreshToken.length > 8192) return coarse(400, '잘못된 요청입니다.')
  try {
    const [{ createPublicAuthClient, setUserSessionCookies }, { NextResponse }] = await Promise.all([import('@/lib/user-auth'), import('next/server')])
    const auth = createPublicAuthClient()
    const { data, error } = await auth.auth.getUser(accessToken)
    const user = data.user
    const subjectMatches = user?.identities?.some(identity => identity.identity_data?.sub === continuity.brokerSubject) ?? false
    if (error || !user || !subjectMatches) throw new Error('SOCIAL_COMPLETION_SESSION_REJECTED')
    await bindPreviewAuthPrincipal(services.client, { attemptId: continuity.trustedAttemptId, authUserId: user.id })
    const response = NextResponse.json({ authenticated: true, redirect: '/account' }, { headers: { 'cache-control': 'no-store' } })
    setUserSessionCookies(response, { access_token: accessToken, refresh_token: refreshToken })
    response.headers.append('set-cookie', cookieHeader(recoveryContinuityCookie.name, '', clearCookie))
    return response
  } catch {
    const response = coarse(400, '로그인을 완료할 수 없습니다.')
    response.headers.set('set-cookie', cookieHeader(recoveryContinuityCookie.name, '', clearCookie)); return response
  }
}
