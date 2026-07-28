import { z } from 'zod'

export const PROMOTION_PLACEMENTS = ['homepage_today', 'school_page', 'region_page', 'content_feed'] as const
export const PROMOTION_REPORT_REASONS = ['impersonation', 'inappropriate', 'misleading', 'privacy', 'illegal', 'minor_risk', 'copyright'] as const

const forbiddenPromotionPattern = /특정\s*사람|사람\s*찾아|첫사랑\s*찾|신상|현재\s*위치|학교\s*공식\s*추천|미성년자\s*(?:인스타|instagram|계정|광고)|재학생\s*(?:인스타|instagram|계정|광고)|도박|불법\s*대출|고수익\s*보장|성인\s*서비스/iu
const directContactPattern = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[A-Za-z]{2,}|(?:\+?82[- .]?)?(?:0\d{1,2}[- .]?)?\d{3,4}[- .]?\d{4}|[\u200B-\u200D\u2060\uFEFF]/u

export function normalizePromotionText(value: string): string {
  return value.normalize('NFKC').replace(/\r\n?/g, '\n').trim()
}

export function isPromotionTextSafe(value: string): boolean {
  return !forbiddenPromotionPattern.test(value) && !directContactPattern.test(value)
}

function safeText(max: number) {
  return z.string().transform(normalizePromotionText).pipe(
    z.string().min(1).max(max).refine(isPromotionTextSafe, '광고 안전 정책에 맞지 않는 문구입니다.')
  )
}

export function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false
    const parts = host.match(/^172\.(\d+)\./)
    if (parts && Number(parts[1]) >= 16 && Number(parts[1]) <= 31) return false
    return value.length <= 500
  } catch { return false }
}

export function isInstagramProfileUrl(value: string): boolean {
  if (!isSafeHttpsUrl(value)) return false
  const url = new URL(value)
  if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) return false
  return /^\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)
}

const promotionImageHosts = new Set(['images.unsplash.com', 'images.pexels.com', 'i.imgur.com'])

export function isSafePromotionImageUrl(value: string): boolean {
  if (!isSafeHttpsUrl(value)) return false
  return promotionImageHosts.has(new URL(value).hostname.toLowerCase())
}

const optionalSafeText = (max: number) => z.string().transform(normalizePromotionText).pipe(z.string().max(max)).optional()

export const PromotionAccountSchema = z.object({
  account_type: z.enum(['personal', 'business']),
  instagram_url: z.string().max(500).refine(isInstagramProfileUrl),
  display_name: safeText(60),
  business_name: optionalSafeText(100),
  business_contact_name: z.string().trim().min(2).max(60).optional(),
  business_registration_reference: z.string().trim().min(4).max(40).optional(),
  business_category: optionalSafeText(60),
}).strict().superRefine((value, ctx) => {
  const fields = [value.business_name, value.business_contact_name, value.business_registration_reference]
  if (value.account_type === 'personal' && fields.some(Boolean)) ctx.addIssue({ code: 'custom', message: '개인 신청에는 사업자 정보를 넣을 수 없습니다.' })
  if (value.account_type === 'business' && fields.some((item) => !item)) ctx.addIssue({ code: 'custom', message: '사업자 검수 정보가 필요합니다.' })
})

export const PromotionRequestSchema = z.object({
  account_id: z.string().uuid(),
  title: safeText(80),
  body: safeText(300),
  image_url: z.string().max(500).refine(isSafePromotionImageUrl),
  landing_url: z.string().max(500).refine(isSafeHttpsUrl),
  requested_placement: z.enum(PROMOTION_PLACEMENTS),
  requested_date: z.string().date(),
  school_id: z.string().uuid().optional(),
  region_code: z.string().regex(/^[A-Za-z0-9_-]{2,30}$/).optional(),
  school_affiliation_claimed: z.boolean().default(false),
  rights_confirmed: z.literal(true),
  adult_and_ownership_confirmed: z.literal(true),
}).strict().superRefine((value, ctx) => {
  if (value.requested_placement === 'school_page' && !value.school_id) ctx.addIssue({ code: 'custom', path: ['school_id'], message: '학교가 필요합니다.' })
  if (value.requested_placement === 'region_page' && !value.region_code) ctx.addIssue({ code: 'custom', path: ['region_code'], message: '지역이 필요합니다.' })
})

export const PromotionReportSchema = z.object({
  placement_id: z.string().uuid(),
  reason_code: z.enum(PROMOTION_REPORT_REASONS),
}).strict()

export const PromotionAdminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify_account'), verification_id: z.string().uuid(), verification_code: z.string().min(6).max(40) }).strict(),
  z.object({ action: z.enum(['changes_requested', 'rejected']), request_id: z.string().uuid(), reason_code: z.enum(['creative', 'ownership', 'business', 'safety', 'minor_risk', 'impersonation', 'illegal', 'other']), note: z.string().max(500).optional() }).strict(),
  z.object({ action: z.literal('payment_confirmed'), request_id: z.string().uuid(), internal_reference: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal('scheduled'), request_id: z.string().uuid(), starts_at: z.string().datetime(), ends_at: z.string().datetime() }).strict(),
  z.object({ action: z.enum(['activate', 'pause', 'resume', 'complete', 'cancel', 'refund']), placement_id: z.string().uuid() }).strict(),
])
