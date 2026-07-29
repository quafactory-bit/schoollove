import { z } from 'zod'

export const onboardingSources = [
  'direct', 'organic_social', 'creator', 'community', 'referral', 'paid_social', 'unknown',
] as const

export type OnboardingSource = typeof onboardingSources[number]

export const OnboardingSourceSchema = z.enum(onboardingSources)
export const OnboardingQuerySchema = z.object({ source: OnboardingSourceSchema.default('unknown') })

export function safeLoginDestination(value: string | null): '/account' | '/onboarding' {
  return value === '/onboarding' ? '/onboarding' : '/account'
}
