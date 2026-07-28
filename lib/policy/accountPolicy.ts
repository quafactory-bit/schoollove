export const ACCOUNT_POLICY_VERSION = 'phase10b-2026-07-28'

export const REQUIRED_CONSENT_TYPES = [
  'terms',
  'privacy_collection',
  'adult_confirmation',
  'private_by_default',
] as const

export const OPTIONAL_CONSENT_TYPES = [
  'instagram_publication',
  'marketing',
  'today_instagram_promotion',
] as const

export type RequiredConsentType = (typeof REQUIRED_CONSENT_TYPES)[number]
export type OptionalConsentType = (typeof OPTIONAL_CONSENT_TYPES)[number]
export type ConsentType = RequiredConsentType | OptionalConsentType

export function hasAllRequiredConsents(consents: Iterable<string>): boolean {
  const present = new Set(consents)
  return REQUIRED_CONSENT_TYPES.every((type) => present.has(type))
}
