import { z } from 'zod'

export const betaFeatureKeys = [
  'account_registration', 'private_profile', 'people_search', 'connection_request',
  'messaging', 'instagram_permission', 'promotion_application', 'promotion_operations',
] as const

export type BetaFeatureKey = typeof betaFeatureKeys[number]

export const BetaInviteRedeemSchema = z.object({ token: z.string().trim().min(24).max(256) })

export const BetaAdminOperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('issue_invite'), programId: z.string().uuid(), email: z.string().email().optional(), domain: z.string().min(3).max(255).optional(), maxUses: z.number().int().min(1).max(1000), expiresAt: z.string().datetime() }),
  z.object({ action: z.literal('review_member'), memberId: z.string().uuid(), status: z.enum(['active','suspended','rejected','withdrawn']), reason: z.string().regex(/^[A-Z0-9_]{2,60}$/) }),
  z.object({ action: z.literal('set_feature'), programId: z.string().uuid().nullable(), userId: z.string().uuid().nullable(), feature: z.enum(betaFeatureKeys), enabled: z.boolean(), reason: z.string().regex(/^[A-Z0-9_]{2,60}$/) }),
  z.object({ action: z.literal('emergency'), programId: z.string().uuid(), disabled: z.boolean(), reason: z.string().regex(/^[A-Z0-9_]{2,60}$/) }),
])

export const DataExportRequestSchema = z.object({ format: z.enum(['json','csv']) })

export function isFutureGraduationYear(year: number, now = new Date()): boolean {
  const currentKstYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now))
  return year > currentKstYear
}

export function csvSafe(value: unknown): string {
  const text = value == null ? '' : String(value)
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${neutralized.replace(/"/g, '""')}"`
}
