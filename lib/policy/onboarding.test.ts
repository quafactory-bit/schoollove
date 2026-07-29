import { describe, expect, it } from 'vitest'
import { OnboardingQuerySchema, safeLoginDestination } from './onboarding'

describe('limited launch onboarding policy', () => {
  it('allows only coarse non-identifying acquisition sources', () => {
    expect(OnboardingQuerySchema.parse({ source: 'organic_social' })).toEqual({ source: 'organic_social' })
    expect(OnboardingQuerySchema.safeParse({ source: 'instagram:@person' }).success).toBe(false)
  })

  it('keeps login redirects on the two approved private account paths', () => {
    expect(safeLoginDestination('/onboarding')).toBe('/onboarding')
    expect(safeLoginDestination('//example.com')).toBe('/account')
    expect(safeLoginDestination('/admin')).toBe('/account')
  })
})
