import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 이 저장소는 RTL/jsdom을 쓰지 않으므로(app/page.test.ts와 동일한 이유) 소스 텍스트로
// PHASE 9 / PHASE 9 COMPLETION PATCH CAPTCHA 위젯 계약을 확인한다. 실제 검증 네트워크
// 동작은 lib/security/captcha.test.ts가, 등록 흐름 통합은
// app/api/profiles/route.test.ts / app/submit/registerPeople.test.ts가 담당한다.
const SOURCE = readFileSync(join(process.cwd(), 'components', 'CaptchaWidget.tsx'), 'utf-8')

describe('CaptchaWidget — 공급자 스크립트는 이 컴포넌트에서만, explicit 모드로 로드된다', () => {
  it('script URL에 ?render=explicit을 사용한다', () => {
    expect(SOURCE).toMatch(/https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/)
  })

  it('next/script의 lazyOnload 전략을 사용한다(전역 layout에 두지 않고 필요한 페이지에서만 로드)', () => {
    expect(SOURCE).toMatch(/strategy="lazyOnload"/)
  })

  it('turnstile.render()를 명시적으로 호출한다', () => {
    expect(SOURCE).toMatch(/window\.turnstile\.render\(containerRef\.current, \{/)
  })
})

describe('CaptchaWidget — PHASE 9 COMPLETION PATCH: 고정 execution 계약', () => {
  it("render option에 execution: 'execute'를 명시한다(공급자 기본값 'render' 사용 금지)", () => {
    expect(SOURCE).toMatch(/execution: 'execute'/)
  })

  it("action: 'register'를 명시한다(서버 검증과 일치해야 함)", () => {
    expect(SOURCE).toMatch(/action: 'register'/)
  })

  it("모바일 대응을 위해 size: 'flexible'을 사용한다", () => {
    expect(SOURCE).toMatch(/size: 'flexible'/)
  })

  it('render 직후 첫 challenge도 명시적으로 execute()를 호출한다(execute 모드는 자동 실행하지 않음)', () => {
    const renderIndex = SOURCE.indexOf('window.turnstile.render(containerRef.current')
    const firstExecuteIndex = SOURCE.indexOf('window.turnstile.execute(widgetIdRef.current)')
    expect(renderIndex).toBeGreaterThan(-1)
    expect(firstExecuteIndex).toBeGreaterThan(renderIndex)
  })
})

describe('CaptchaWidget — 비밀 키를 참조하지 않는다', () => {
  it('TURNSTILE_SECRET_KEY 문자열이 존재하지 않는다', () => {
    expect(SOURCE).not.toMatch(/TURNSTILE_SECRET_KEY/)
  })

  it('공개 sitekey는 prop(siteKey)으로만 받는다(하드코딩 없음)', () => {
    expect(SOURCE).toMatch(/sitekey: siteKey/)
  })
})

describe('CaptchaWidget — 토큰을 URL/storage/로그에 기록하지 않는다', () => {
  it('localStorage/sessionStorage/location을 사용하지 않는다', () => {
    expect(SOURCE).not.toMatch(/localStorage/)
    expect(SOURCE).not.toMatch(/sessionStorage/)
    expect(SOURCE).not.toMatch(/location\.(href|search)/)
  })

  it('console.log/warn/error 호출이 토큰 변수를 인자로 넘기지 않는다(콘솔 호출 자체가 없음)', () => {
    expect(SOURCE).not.toMatch(/console\.(log|warn|error)/)
  })

  it('토큰은 ref(availableTokenRef)에만 보관한다(state로 렌더 트리에 노출하지 않음)', () => {
    expect(SOURCE).toMatch(/const availableTokenRef = useRef<string \| null>\(null\)/)
  })
})

describe('CaptchaWidget — PHASE 9 COMPLETION PATCH: Promise/오류 안전성', () => {
  it('settlePending 헬퍼를 통해서만 pending을 해소한다(이중 settle 방지)', () => {
    expect(SOURCE).toMatch(/function settlePending\(/)
    expect(SOURCE).toMatch(/clearTimeout\(pending\.timeoutId\)/)
  })

  it('error-callback은 pending Promise를 reject한다', () => {
    expect(SOURCE).toMatch(/'error-callback': \(\) => \{[\s\S]*?settlePending\(\(p\) => p\.reject\(new Error\('captcha-error'\)\)\)/)
  })

  it('expired-callback은 토큰을 제거하고 pending Promise를 reject한다', () => {
    expect(SOURCE).toMatch(/'expired-callback': \(\) => \{[\s\S]*?availableTokenRef\.current = null[\s\S]*?settlePending\(\(p\) => p\.reject\(new Error\('captcha-expired'\)\)\)/)
  })

  it('unmount(cleanup)에서 pending Promise를 reject하고 위젯을 remove한다', () => {
    expect(SOURCE).toMatch(/return \(\) => \{\s*settlePending\(\(p\) => p\.reject\(new Error\('captcha-unmounted'\)\)\)/)
    expect(SOURCE).toMatch(/window\.turnstile\.remove\(widgetIdRef\.current\)/)
  })

  it('이미 pending 요청이 있으면 새 요청은 resolver를 덮어쓰지 않고 즉시 reject한다', () => {
    expect(SOURCE).toMatch(/if \(pendingRef\.current\) \{\s*reject\(new Error\('captcha-already-pending'\)\)/)
  })

  it('아직 소비되지 않은 토큰이 있으면 재실행 없이 그대로 반환하고 즉시 소비한다', () => {
    expect(SOURCE).toMatch(/if \(availableTokenRef\.current\) \{/)
    expect(SOURCE).toMatch(/availableTokenRef\.current = null/)
  })

  it('소비된 토큰이 없으면 reset 후 execute로 새 토큰을 요청한다(요청 시작 시점의 reset+execute)', () => {
    expect(SOURCE).toMatch(
      /pendingRef\.current = \{ resolve, reject, timeoutId \}\s*\n\s*window\.turnstile\.reset\(widgetIdRef\.current\)\s*\n\s*window\.turnstile\.execute\(widgetIdRef\.current\)/
    )
  })
})

describe('CaptchaWidget — PHASE 9 FINAL MICRO PATCH: interactive challenge timeout 안전성', () => {
  it("CaptchaStatus에 'timeout'이 추가되어 있다", () => {
    expect(SOURCE).toMatch(/export type CaptchaStatus = 'loading' \| 'ready' \| 'expired' \| 'error' \| 'timeout'/)
  })

  it("공급자 공식 'timeout-callback'을 render option에 등록한다", () => {
    expect(SOURCE).toMatch(/'timeout-callback': \(\) => \{/)
  })

  it('timeout-callback은 토큰을 제거하고, status를 timeout으로 바꾸고, pending Promise를 reject한다', () => {
    expect(SOURCE).toMatch(
      /'timeout-callback': \(\) => \{\s*availableTokenRef\.current = null\s*setStatus\('timeout'\)\s*settlePending\(\(p\) => p\.reject\(new Error\('captcha-provider-timeout'\)\)\)/
    )
  })

  it('timeout 상태에 대한 재시도 안내 문구가 있다', () => {
    expect(SOURCE).toMatch(/보안 확인 시간이 초과됐어요/)
  })

  it('자체 watchdog(CALLBACK_TIMEOUT_MS)은 15000이 아니며 120초 이상이다', () => {
    const match = SOURCE.match(/const CALLBACK_TIMEOUT_MS = ([\d_]+)/)
    expect(match).not.toBeNull()
    const value = Number(match![1].replace(/_/g, ''))
    expect(value).not.toBe(15000)
    expect(value).toBeGreaterThanOrEqual(120000)
  })

  it('자체 watchdog이 발동하면 pending을 reject하고 위젯을 reset하되, execute를 다시 호출하지 않는다(자동 재시도 금지)', () => {
    const watchdogMatch = SOURCE.match(
      /const timeoutId = setTimeout\(\(\) => \{([\s\S]*?)\}, CALLBACK_TIMEOUT_MS\)/
    )
    expect(watchdogMatch).not.toBeNull()
    const watchdogBody = watchdogMatch![1]
    expect(watchdogBody).toMatch(/pendingRef\.current = null/)
    expect(watchdogBody).toMatch(/reject\(new Error\('captcha-timeout'\)\)/)
    expect(watchdogBody).toMatch(/window\.turnstile\.reset\(widgetIdRef\.current\)/)
    expect(watchdogBody).not.toMatch(/\.execute\(/)
  })

  it('error/expired/timeout/unmount 네 경로 모두 settlePending()을 통해서만 정리한다(단일 정리 경로)', () => {
    const settleSites = SOURCE.match(/settlePending\(\(p\) => p\.(resolve|reject)\([^)]*\)\)/g) ?? []
    // callback(resolve) + error-callback + expired-callback + timeout-callback + unmount cleanup = 5곳
    expect(settleSites.length).toBe(5)
  })
})

describe('CaptchaWidget — 배치 등록을 위한 requestNextToken', () => {
  it('imperative handle로 requestNextToken을 노출한다', () => {
    expect(SOURCE).toMatch(/requestNextToken: \(\) => \{/)
    expect(SOURCE).toMatch(/useImperativeHandle\(/)
  })
})

describe('CaptchaWidget — 실패 상태 복구', () => {
  it('만료·오류·timeout 상태에서는 사용자가 새 challenge를 요청할 수 있다', () => {
    expect(SOURCE).toMatch(/status === 'expired' \|\| status === 'error' \|\| status === 'timeout'/)
    expect(SOURCE).toMatch(/onClick={retryChallenge}/)
    expect(SOURCE).toMatch(/보안 확인 다시 시도/)
  })

  it('재시도는 이전 토큰을 제거하고 reset 후 execute한다', () => {
    expect(SOURCE).toMatch(
      /function retryChallenge\(\) \{[\s\S]*?availableTokenRef\.current = null[\s\S]*?setStatus\('loading'\)[\s\S]*?window\.turnstile\.reset\(widgetIdRef\.current\)[\s\S]*?window\.turnstile\.execute\(widgetIdRef\.current\)/
    )
  })
})
