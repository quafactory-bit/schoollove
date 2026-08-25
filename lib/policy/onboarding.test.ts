import { describe, expect, it } from 'vitest'
import { OnboardingQuerySchema } from './onboarding'

describe('limited launch onboarding policy', () => {
  it('allows only coarse non-identifying acquisition sources', () => {
    expect(OnboardingQuerySchema.parse({ source: 'organic_social' })).toEqual({ source: 'organic_social' })
    expect(OnboardingQuerySchema.safeParse({ source: 'instagram:@person' }).success).toBe(false)
  })
})
