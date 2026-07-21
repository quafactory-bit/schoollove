'use client'

// PHASE 9 — PUBLIC WRITE CAPTCHA PROTECTION
// PHASE 9 COMPLETION PATCH — TURNSTILE SEQUENTIAL TOKEN LIFECYCLE
// Cloudflare Turnstile client 위젯. app/submit/page.tsx에서만 렌더한다 — 공급자 스크립트를
// 전역 layout에 두지 않고 필요한 페이지에서만 로드한다.
//
// app/submit/registerPeople.ts는 사람을 한 명씩 순차로 POST /api/profiles 호출한다
// (다중 등록은 docs/design-package-v1.0/07-register-flow.md §3에서 FROZEN된 핵심
// 기능이라 배치 API로 바꾸지 않았다). Turnstile 토큰은 1회용이라(공급자 검증 계약,
// lib/security/captcha.ts는 이 계약을 그대로 따르고 별도 재사용 캐시를 두지 않는다)
// 같은 토큰을 여러 요청에 재사용할 수 없다. 그래서 이 컴포넌트는 requestNextToken()을
// 노출해, 배치의 첫 사람은 위젯이 이미 받아둔 토큰을 그대로 쓰고, 두 번째 사람부터는
// reset()+execute()로 새 토큰을 다시 받는다.
//
// PHASE 9 COMPLETION PATCH — 원래 구현은 turnstile.render()의 render option에 execution을
// 아예 지정하지 않아 공급자 기본값인 execution:'render'(렌더 즉시 자동 실행)로 동작하면서,
// 두 번째 토큰부터는 execution:'execute'(수동 실행) 전용 API인 execute()를 호출하고
// 있었다 — 두 계약이 섞여 있어 실제 동작이 공식 문서 기준으로 불명확했다. 이번 패치는
// script URL에 ?render=explicit을 붙이고, render option에 execution:'execute'를 명시해
// "렌더는 위젯만 그리고, 모든 challenge(첫 토큰 포함)는 execute()로만 시작한다"는 단일
// 계약으로 고정한다 — 렌더 직후 별도로 execute()를 한 번 더 호출해 첫 토큰도 명시적으로
// 받는다(자동 실행에 의존하지 않음).
//
// PHASE 9 FINAL MICRO PATCH — INTERACTIVE CHALLENGE TIMEOUT SAFETY
// 공급자가 공식적으로 제공하는 'timeout-callback'(challenge 자체가 provider 쪽에서
// 시간 초과됐을 때 호출됨)을 반영한다. 이전에는 이 콜백이 없어 provider가 이미
// 실패로 판정한 challenge를 우리 쪽에서 인지하지 못했다. 또한 자체 watchdog
// (CALLBACK_TIMEOUT_MS)이 15초로, 실제 사용자가 interactive challenge(체크박스/퍼즐)를
// 푸는 데 걸릴 수 있는 정상적인 시간보다 짧아 정상 사용자를 먼저 실패시킬 위험이
// 있었다 — 120초로 늘려 "callback 자체가 영구히 오지 않는 비정상 상황"만 방어하는
// 진짜 비상 안전장치로 재정의했다(provider의 timeout-callback이 정상적인 시간 초과
// 처리를 담당).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      execute: (widgetId?: string, options?: Record<string, unknown>) => void
      remove: (widgetId?: string) => void
    }
  }
}

export type CaptchaStatus = 'loading' | 'ready' | 'expired' | 'error' | 'timeout'

export interface CaptchaWidgetHandle {
  // 다음 등록 요청에 쓸 새 토큰을 반환한다. 아직 소비되지 않은 토큰이 있으면(배치의
  // 첫 사람) 그대로 반환하고, 없으면 위젯을 reset+execute해 새로 받는다. 위젯이 아직
  // 준비되지 않았거나, 이미 진행 중인 요청이 있거나, callback이 일정 시간 내에 오지
  // 않으면 reject한다.
  requestNextToken: () => Promise<string>
}

interface Props {
  siteKey: string
  onStatusChange?: (status: CaptchaStatus) => void
}

// callback이 이 시간 안에 오지 않으면 client-side에서 포기하고 reject한다 — 다만 이제는
// "정상적인 시간 초과 처리"가 아니라 "callback 자체가 영구히 오지 않는 비정상 상황"만
// 잡아내는 최후의 비상 안전장치다. 정상적인 시간 초과는 provider의 'timeout-callback'이
// 먼저 처리한다. interactive challenge(체크박스/퍼즐)를 실제 사용자가 푸는 데 15초보다
// 오래 걸릴 수 있어(특히 모바일) 15초는 너무 짧았다 — 120초로 늘려 정상 사용자를
// 이 자체 timer가 먼저 실패시키지 않도록 한다.
const CALLBACK_TIMEOUT_MS = 120_000

type PendingRequest = {
  resolve: (token: string) => void
  reject: (err: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const CaptchaWidget = forwardRef<CaptchaWidgetHandle, Props>(function CaptchaWidget(
  { siteKey, onStatusChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)
  // 소비되지 않은 토큰과 "대기 중인 requestNextToken() 호출" 둘 다 ref로만 관리한다
  // (렌더링에 영향을 주지 않는 순수 내부 상태 — status만 실제로 화면에 쓰인다). state로
  // 두면 useImperativeHandle의 클로저가 최신 값을 참조하는지 의존성 배열에 기대야 하는데,
  // ref는 그 문제 자체가 없어 더 단순하고 안전하다.
  const availableTokenRef = useRef<string | null>(null)
  const pendingRef = useRef<PendingRequest | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [status, setStatus] = useState<CaptchaStatus>('loading')

  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  // 대기 중인 Promise가 있으면 정리하고(clearTimeout 포함) 정확히 한 번만 resolve/reject한다.
  // 여러 콜백·타임아웃·unmount 경로가 동시에 같은 pending을 건드릴 수 있으므로, 이 함수를
  // 거치지 않고 pendingRef를 직접 조작하는 곳이 없게 한다 — 이중 settle을 구조적으로 막는다.
  function settlePending(settle: (pending: PendingRequest) => void) {
    const pending = pendingRef.current
    if (!pending) return
    clearTimeout(pending.timeoutId)
    pendingRef.current = null
    settle(pending)
  }

  useEffect(() => {
    if (!scriptLoaded || !window.turnstile || !containerRef.current || widgetIdRef.current) return

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: 'register',
      execution: 'execute',
      size: 'flexible',
      callback: (token: string) => {
        availableTokenRef.current = token
        setStatus('ready')
        settlePending((p) => p.resolve(token))
      },
      'error-callback': () => {
        availableTokenRef.current = null
        setStatus('error')
        settlePending((p) => p.reject(new Error('captcha-error')))
      },
      'expired-callback': () => {
        availableTokenRef.current = null
        setStatus('expired')
        settlePending((p) => p.reject(new Error('captcha-expired')))
      },
      // 공급자가 challenge 자체를 시간 초과로 판정했을 때 호출된다(우리 쪽 자체 watchdog과
      // 별개 — 이것이 "정상적인" 시간 초과 처리 경로다). error-callback/expired-callback과
      // 동일하게 settlePending()을 거쳐 정확히 한 번만 정리한다.
      'timeout-callback': () => {
        availableTokenRef.current = null
        setStatus('timeout')
        settlePending((p) => p.reject(new Error('captcha-provider-timeout')))
      },
    })

    // execution:'execute'는 render()만으로 challenge를 시작하지 않는다 — 첫 토큰도
    // 명시적으로 execute()를 호출해야 콜백이 온다(공식 계약, §3).
    window.turnstile.execute(widgetIdRef.current)

    return () => {
      settlePending((p) => p.reject(new Error('captcha-unmounted')))
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = undefined
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, siteKey])

  useImperativeHandle(
    ref,
    () => ({
      requestNextToken: () => {
        return new Promise<string>((resolve, reject) => {
          if (availableTokenRef.current) {
            const token = availableTokenRef.current
            availableTokenRef.current = null
            resolve(token)
            return
          }
          if (!window.turnstile || !widgetIdRef.current) {
            reject(new Error('captcha-not-ready'))
            return
          }
          // 이미 진행 중인 요청이 있으면 두 번째 호출을 즉시 reject한다 — 첫 번째
          // 요청의 resolver를 덮어써서 잃어버리는 대신, 명확하게 구분되는 오류로
          // 실패시킨다(§4 "resolver 덮어쓰기가 발생하지 않음").
          if (pendingRef.current) {
            reject(new Error('captcha-already-pending'))
            return
          }
          const timeoutId = setTimeout(() => {
            pendingRef.current = null
            reject(new Error('captcha-timeout'))
            // 자체 watchdog(비정상 상황 전용, §3)이 발동했다는 것은 callback이 영구히
            // 오지 않는다고 판단했다는 뜻이다 — 지금 진행 중이던 challenge를 reset해
            // 두어, 이후 아주 늦게 도착하는 callback이 있더라도(그때는 pendingRef가 이미
            // 비어 있어 settlePending은 no-op이지만) 위젯을 깨끗한 상태로 되돌려 다음
            // requestNextToken() 호출이 혼란 없이 새 challenge를 시작할 수 있게 한다.
            // execute()는 다시 호출하지 않는다 — 자동 재시도/무한 retry를 만들지 않기
            // 위함이며, 다음 실제 요청이 올 때 그 호출이 스스로 execute()를 한다.
            if (window.turnstile && widgetIdRef.current) {
              window.turnstile.reset(widgetIdRef.current)
            }
          }, CALLBACK_TIMEOUT_MS)
          pendingRef.current = { resolve, reject, timeoutId }
          window.turnstile.reset(widgetIdRef.current)
          window.turnstile.execute(widgetIdRef.current)
        })
      },
    }),
    []
  )

  function retryChallenge() {
    if (!window.turnstile || !widgetIdRef.current || pendingRef.current) return
    availableTokenRef.current = null
    setStatus('loading')
    window.turnstile.reset(widgetIdRef.current)
    window.turnstile.execute(widgetIdRef.current)
  }

  return (
    <div>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setStatus('error')}
      />
      <div ref={containerRef} />
      {status === 'loading' && (
        <p className="text-xs text-neutral-400">보안 확인을 불러오는 중…</p>
      )}
      {status === 'expired' && (
        <p className="text-xs text-amber-600">보안 확인이 만료됐어요. 다시 확인해주세요.</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-500">보안 확인을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.</p>
      )}
      {status === 'timeout' && (
        <p className="text-xs text-amber-600">보안 확인 시간이 초과됐어요. 다시 시도해주세요.</p>
      )}
      {(status === 'expired' || status === 'error' || status === 'timeout') && (
        <button
          type="button"
          onClick={retryChallenge}
          className="mt-2 text-xs font-medium text-neutral-600 underline underline-offset-2"
        >
          보안 확인 다시 시도
        </button>
      )}
    </div>
  )
})

export default CaptchaWidget
