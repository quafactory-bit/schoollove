import { describe, expect, it } from 'vitest'
import { deriveBrokerSubject } from './subject'
import { SocialBrokerError } from './errors'

const syntheticKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const bytes = (value: string) => Buffer.from(value, 'utf8')

describe('social broker opaque subject', () => {
  it('is deterministic and uses the full base64url HMAC-SHA-256 digest', () => {
    const first = deriveBrokerSubject({
      provider: 'kakao',
      upstreamSubject: bytes('Synthetic Subject +Tag'),
      keyVersion: 'k01',
      key: syntheticKey,
    })
    const second = deriveBrokerSubject({
      provider: 'kakao',
      upstreamSubject: bytes('Synthetic Subject +Tag'),
      keyVersion: 'k01',
      key: syntheticKey,
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^slb:v1:k01:kakao:[A-Za-z0-9_-]{43}$/)
    expect(first).not.toContain('Synthetic Subject +Tag')
  })

  it('separates providers, exact bytes, and key versions without normalization', () => {
    const derive = (provider: 'kakao' | 'naver', subject: string, keyVersion = 'k01') =>
      deriveBrokerSubject({ provider, upstreamSubject: bytes(subject), keyVersion, key: syntheticKey })

    expect(derive('kakao', 'Same')).not.toBe(derive('naver', 'Same'))
    expect(derive('kakao', 'Same')).not.toBe(derive('kakao', 'same'))
    expect(derive('kakao', ' value')).not.toBe(derive('kakao', 'value'))
    expect(derive('kakao', 'e\u0301')).not.toBe(derive('kakao', '\u00e9'))
    expect(derive('kakao', 'Same', 'k01')).not.toBe(derive('kakao', 'Same', 'k02'))
  })

  it('rejects malformed providers, empty subjects, invalid versions, and short keys', () => {
    const attempt = (override: Record<string, unknown>) => () => deriveBrokerSubject({
      provider: 'kakao',
      upstreamSubject: bytes('subject'),
      keyVersion: 'k01',
      key: syntheticKey,
      ...override,
    } as never)

    expect(attempt({ provider: 'github' })).toThrowError(new SocialBrokerError('INVALID_PROVIDER'))
    expect(attempt({ upstreamSubject: new Uint8Array() })).toThrowError(new SocialBrokerError('INVALID_SUBJECT'))
    expect(attempt({ keyVersion: 'production' })).toThrowError(new SocialBrokerError('INVALID_KEY_VERSION'))
    expect(attempt({ key: new Uint8Array(16) })).toThrowError(new SocialBrokerError('INVALID_KEY'))
  })
})
