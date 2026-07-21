// PHASE 9 — PUBLIC WRITE CAPTCHA PROTECTION
// docs/design-package-v1.0/07-register-flow.md §8 "보안/악용 방지"의 P1 "CAPTCHA 적용"과
// docs/design-package-v1.0/13-api.md §8 "Registration은 CAPTCHA를 적용한다"를 구현한다.
// app/api/profiles/route.ts에서만 사용하는 서버 전용 helper — client bundle에 절대
// 포함되지 않는다(TURNSTILE_SECRET_KEY는 'use client' 파일에서 참조하지 않음).
//
// 공급자: Cloudflare Turnstile. 새 npm dependency 없이 공식 <script>(client 위젯)와
// fetch 기반 REST 검증(이 파일)만으로 구현 가능해 선택했다 — 로그인 없는 공개 폼에
// 적합하고, 무료이며, client token + server verification 구조가 명확히 분리된다.
//
// 환경변수 계약:
// - NEXT_PUBLIC_TURNSTILE_SITE_KEY: 공개 키. client 위젯(components/CaptchaWidget.tsx)
//   에서만 읽는다.
// - TURNSTILE_SECRET_KEY: 비밀 키. 이 파일(서버 전용)에서만 읽는다.
//
// 누락 정책 — app/api/profiles/route.ts의 checkRateLimit()과 동일한 관례를 그대로 따른다:
// - production에서 TURNSTILE_SECRET_KEY가 없으면 우회하지 않고 fail-closed(500).
// - development/test에서 없으면 로컬 개발·smoke test가 막히지 않도록 경고만 남기고
//   통과시킨다. 이 우회는 "환경변수가 아예 설정되지 않았을 때"만 발생한다 — 키가
//   설정돼 있으면(Cloudflare 공식 테스트 키 포함) 환경과 무관하게 항상 실제 Cloudflare
//   검증을 수행하므로, production에서 이 우회 경로가 활성화될 방법이 없다.
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const VERIFY_TIMEOUT_MS = 5000
const EXPECTED_ACTION = 'register'
const GENERIC_FAILURE_MESSAGE = '보안 확인에 실패했습니다. 다시 시도해주세요.'
const TEMPORARY_ERROR_MESSAGE = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'

export type CaptchaVerification =
  | { verified: true }
  | { verified: false; status: 400 | 500; body: { error: string } }

interface TurnstileSiteverifyResponse {
  success: boolean
  action?: string
  'error-codes'?: string[]
}

function isTurnstileSiteverifyResponse(value: unknown): value is TurnstileSiteverifyResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { success?: unknown }).success === 'boolean'
  )
}

// token 원문은 어떤 로그 호출에도 넘기지 않는다(요청 body/URLSearchParams에만 담아
// fetch로 직접 전송) — 아래 함수들은 실패 사유만 로그로 남긴다.
export async function verifyCaptchaToken(
  token: string,
  remoteIp: string | null
): Promise<CaptchaVerification> {
  const secret = process.env.TURNSTILE_SECRET_KEY

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        'verifyCaptchaToken: TURNSTILE_SECRET_KEY가 설정되지 않았습니다. production에서는 설정 누락을 우회하지 않습니다.'
      )
      return { verified: false, status: 500, body: { error: '서버 설정 오류입니다.' } }
    }
    console.warn(
      'verifyCaptchaToken: TURNSTILE_SECRET_KEY 환경변수가 없어 development/test 환경에서 CAPTCHA 검증을 건너뜁니다.'
    )
    return { verified: true }
  }

  const params = new URLSearchParams()
  params.set('secret', secret)
  params.set('response', token)
  if (remoteIp) params.set('remoteip', remoteIp)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: controller.signal,
    })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    console.error(
      isTimeout
        ? 'verifyCaptchaToken: Turnstile 검증 요청이 timeout됐습니다.'
        : 'verifyCaptchaToken: Turnstile 요청 네트워크 오류가 발생했습니다.'
    )
    return { verified: false, status: 500, body: { error: TEMPORARY_ERROR_MESSAGE } }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    console.error('verifyCaptchaToken: Turnstile 응답 HTTP 오류', res.status)
    return { verified: false, status: 500, body: { error: TEMPORARY_ERROR_MESSAGE } }
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    console.error('verifyCaptchaToken: Turnstile 응답 JSON 파싱에 실패했습니다.')
    return { verified: false, status: 500, body: { error: TEMPORARY_ERROR_MESSAGE } }
  }

  if (!isTurnstileSiteverifyResponse(json)) {
    console.error('verifyCaptchaToken: Turnstile 응답 schema가 예상과 다릅니다.')
    return { verified: false, status: 500, body: { error: TEMPORARY_ERROR_MESSAGE } }
  }

  if (!json.success) {
    // 공급자 error-codes는 client 응답에는 절대 포함하지 않는다. 서버 로그에는(토큰
    // 원문은 제외하고) 남겨 운영 중 원인 파악(예: invalid-input-secret vs
    // timeout-or-duplicate)에 활용한다.
    console.warn('verifyCaptchaToken: Turnstile 검증 실패', { errorCodes: json['error-codes'] ?? [] })
    return { verified: false, status: 400, body: { error: GENERIC_FAILURE_MESSAGE } }
  }

  // hostname 검증은 적용하지 않는다 — 이 서비스는 schoollove.kr/www.schoollove.kr 등
  // 유효한 프로덕션 호스트가 하나로 고정돼 있지 않아, 잘못 하드코딩하면 정상 트래픽을
  // 오차단할 위험이 action 검증보다 크다고 판단했다(PHASE 9 최종 보고서에 근거 기록).
  // action은 위젯 렌더링 시 고정값('register')으로만 설정되므로 안전하게 검증할 수 있다.
  if (json.action !== EXPECTED_ACTION) {
    console.warn('verifyCaptchaToken: Turnstile action 불일치', {
      expected: EXPECTED_ACTION,
      actual: json.action,
    })
    return { verified: false, status: 400, body: { error: GENERIC_FAILURE_MESSAGE } }
  }

  return { verified: true }
}
