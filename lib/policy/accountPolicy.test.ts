import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_POLICY_VERSION,
  REQUIRED_CONSENT_TYPES,
  hasAllRequiredConsents,
} from './accountPolicy'

describe('PHASE 10B account policy', () => {
  it('필수 동의 네 종류를 독립적으로 요구한다', () => {
    expect(REQUIRED_CONSENT_TYPES).toEqual([
      'terms',
      'privacy_collection',
      'adult_confirmation',
      'private_by_default',
    ])
    expect(ACCOUNT_POLICY_VERSION).toBe('phase10b-2026-07-28')
  })

  it('필수 동의가 하나라도 빠지면 false다', () => {
    expect(hasAllRequiredConsents(REQUIRED_CONSENT_TYPES)).toBe(true)
    expect(hasAllRequiredConsents(REQUIRED_CONSENT_TYPES.slice(0, 3))).toBe(false)
  })
})
