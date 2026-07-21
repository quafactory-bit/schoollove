import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyCaptchaToken } from './captcha'

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret-key')
  vi.stubEnv('NODE_ENV', 'test')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('verifyCaptchaToken — 정상 verification', () => {
  it('success:true → verified:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, action: 'register' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyCaptchaToken('good-token', '1.2.3.4')

    expect(result).toEqual({ verified: true })
  })

  it('올바른 endpoint(challenges.cloudflare.com/turnstile/v0/siteverify)만 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, action: 'register' }))
    vi.stubGlobal('fetch', fetchMock)

    await verifyCaptchaToken('good-token', '1.2.3.4')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(TURNSTILE_URL)
  })

  it('secret과 response(token)를 body로 전송한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, action: 'register' }))
    vi.stubGlobal('fetch', fetchMock)

    await verifyCaptchaToken('good-token', '1.2.3.4')

    const [, init] = fetchMock.mock.calls[0]
    const body = init.body as URLSearchParams
    expect(body.get('secret')).toBe('test-secret-key')
    expect(body.get('response')).toBe('good-token')
  })

  it('remoteIp가 주어지면 remoteip로 전달한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, action: 'register' }))
    vi.stubGlobal('fetch', fetchMock)

    await verifyCaptchaToken('good-token', '9.9.9.9')

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams
    expect(body.get('remoteip')).toBe('9.9.9.9')
  })

  it('remoteIp가 null이면 remoteip 파라미터 자체를 보내지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, action: 'register' }))
    vi.stubGlobal('fetch', fetchMock)

    await verifyCaptchaToken('good-token', null)

    const body = fetchMock.mock.calls[0][1].body as URLSearchParams
    expect(body.has('remoteip')).toBe(false)
  })

  it('action이 register와 일치하면 통과한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, action: 'register' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyCaptchaToken('good-token', '1.2.3.4')

    expect(result).toEqual({ verified: true })
  })
})

describe('verifyCaptchaToken — 검증 실패', () => {
  it('success:false → verified:false, status 400, 공급자 원문 미노출', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyCaptchaToken('bad-token', '1.2.3.4')

    expect(result.verified).toBe(false)
    if (!result.verified) {
      expect(result.status).toBe(400)
      expect(result.body.error).not.toContain('invalid-input-response')
    }
  })

  it('action이 register와 다르면 verified:false, status 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, action: 'other-action' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyCaptchaToken('token', '1.2.3.4')

    expect(result).toEqual({ verified: false, status: 400, body: { error: expect.any(String) } })
  })

  it('success:true여도 action이 누락되면 verified:false, status 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyCaptchaToken('token', '1.2.3.4')

    expect(result).toEqual({ verified: false, status: 400, body: { error: expect.any(String) } })
  })
})

describe('verifyCaptchaToken — secret 누락 정책', () => {
  it('production에서 secret 누락 → verified:false, status 500, fetch 미호출(fail-closed)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await verifyCaptchaToken('any-token', '1.2.3.4')

    expect(result).toEqual({ verified: false, status: 500, body: { error: '서버 설정 오류입니다.' } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('development에서 secret 누락 → verified:true(우회), fetch 미호출, 경고 로그', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    vi.stubEnv('NODE_ENV', 'development')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await verifyCaptchaToken('any-token', '1.2.3.4')

    expect(result).toEqual({ verified: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(consoleWarnSpy).toHaveBeenCalled()
    consoleWarnSpy.mockRestore()
  })

  it('test 환경에서 secret 누락 → verified:true(우회), fetch 미호출', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    vi.stubEnv('NODE_ENV', 'test')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await verifyCaptchaToken('any-token', '1.2.3.4')

    expect(result).toEqual({ verified: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('secret이 설정돼 있으면(공식 테스트 키 포함) production에서도 항상 실제 검증을 수행한다(우회 아님)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA')
    vi.stubEnv('NODE_ENV', 'production')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, action: 'register' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyCaptchaToken('any-token', '1.2.3.4')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ verified: true })
  })
})

describe('verifyCaptchaToken — 공급자 오류 방어(fail-closed)', () => {
  it('네트워크 오류(fetch reject) → verified:false, status 500', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await verifyCaptchaToken('token', '1.2.3.4')

    expect(result).toEqual({ verified: false, status: 500, body: { error: expect.any(String) } })
  })

  it('timeout(5초 초과) → verified:false, status 500', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal
        signal.addEventListener('abort', () => {
          const err = new Error('This operation was aborted')
          err.name = 'AbortError'
          reject(err)
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const promise = verifyCaptchaToken('token', '1.2.3.4')
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    expect(result).toEqual({ verified: false, status: 500, body: { error: expect.any(String) } })
  })

  it('HTTP 오류(res.ok=false) → verified:false, status 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 503))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await verifyCaptchaToken('token', '1.2.3.4')

    expect(result).toEqual({ verified: false, status: 500, body: { error: expect.any(String) } })
  })

  it('잘못된 JSON(res.json() throw) → verified:false, status 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await verifyCaptchaToken('token', '1.2.3.4')

    expect(result).toEqual({ verified: false, status: 500, body: { error: expect.any(String) } })
  })

  it('응답 schema가 예상과 다름(success 필드 없음) → verified:false, status 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await verifyCaptchaToken('token', '1.2.3.4')

    expect(result).toEqual({ verified: false, status: 500, body: { error: expect.any(String) } })
  })

  it('success 필드가 boolean이 아님 → verified:false, status 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: 'yes' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await verifyCaptchaToken('token', '1.2.3.4')

    expect(result).toEqual({ verified: false, status: 500, body: { error: expect.any(String) } })
  })
})

describe('verifyCaptchaToken — 로그에 원문을 남기지 않는다', () => {
  it('token 원문이 console.error/warn 호출 인자 어디에도 나타나지 않는다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] }))
    vi.stubGlobal('fetch', fetchMock)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const SECRET_TOKEN = 'super-secret-turnstile-response-token-abc123'
    await verifyCaptchaToken(SECRET_TOKEN, '1.2.3.4')

    const allCallArgs = JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls])
    expect(allCallArgs).not.toContain(SECRET_TOKEN)
  })

  it('secret 원문이 console.error/warn 호출 인자 어디에도 나타나지 않는다', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'super-secret-key-value-xyz')
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await verifyCaptchaToken('token', '1.2.3.4')

    const allCallArgs = JSON.stringify(errorSpy.mock.calls)
    expect(allCallArgs).not.toContain('super-secret-key-value-xyz')
  })
})
