import { z } from 'zod'
import { PROMOTION_PLACEMENTS } from '@/lib/policy/promotionSafety'

const operationKey = z.string().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/)
const safeAdminText = z.string().trim().min(1).max(500)

export const PromotionOwnerOperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('quote_response'), quote_id: z.string().uuid(), response: z.enum(['accept', 'reject']), idempotency_key: operationKey }).strict(),
  z.object({ action: z.literal('payment_notice'), order_id: z.string().uuid(), declared_amount_krw: z.number().int().min(1).max(100000000), idempotency_key: operationKey }).strict(),
  z.object({ action: z.literal('cancellation_request'), order_id: z.string().uuid(), reason_code: z.enum(['changed_mind', 'schedule', 'creative', 'delivery', 'other']), idempotency_key: operationKey }).strict(),
])

export const PromotionProductSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  product_code: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,39}$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  placement_type: z.enum(PROMOTION_PLACEMENTS),
  duration_days: z.number().int().min(1).max(31),
  image_width: z.number().int().min(320).max(4096),
  image_height: z.number().int().min(320).max(4096),
  title_limit: z.number().int().min(20).max(80),
  body_limit: z.number().int().min(50).max(300),
  base_price_krw: z.number().int().min(1000).max(100000000),
  vat_display_mode: z.enum(['included', 'excluded', 'not_applicable']),
  allows_school_targeting: z.boolean(),
  allows_region_targeting: z.boolean(),
  sale_status: z.enum(['draft', 'active', 'paused', 'retired']),
  price_policy_version: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
}).strict().superRefine((value, ctx) => {
  if ((value.placement_type === 'school_page') !== value.allows_school_targeting) ctx.addIssue({ code: 'custom', path: ['allows_school_targeting'], message: '학교 배치 설정이 일치하지 않습니다.' })
  if ((value.placement_type === 'region_page') !== value.allows_region_targeting) ctx.addIssue({ code: 'custom', path: ['allows_region_targeting'], message: '지역 배치 설정이 일치하지 않습니다.' })
})

export const PromotionAdminOperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upsert_product'), product: PromotionProductSchema }).strict(),
  z.object({ action: z.literal('issue_quote'), request_id: z.string().uuid(), product_id: z.string().uuid(), expires_at: z.string().datetime(), note: z.string().max(500).optional() }).strict(),
  z.object({ action: z.literal('confirm_payment'), order_id: z.string().uuid(), submission_id: z.string().uuid(), confirmed_amount_krw: z.number().int().min(1).max(100000000), match_status: z.enum(['exact', 'under', 'partial', 'over']), idempotency_key: operationKey }).strict(),
  z.object({ action: z.literal('decide_cancellation'), cancellation_id: z.string().uuid(), decision: z.enum(['approve', 'reject']), refund_amount_krw: z.number().int().min(0).max(100000000), reason_code: z.enum(['approved', 'already_started', 'delivered', 'policy', 'amount', 'other']) }).strict(),
  z.object({ action: z.literal('confirm_refund'), refund_id: z.string().uuid(), status: z.enum(['partial', 'completed', 'unavailable']), completed_amount_krw: z.number().int().min(0).max(100000000), reason_code: safeAdminText }).strict(),
  z.object({ action: z.literal('schedule'), order_id: z.string().uuid(), starts_at: z.string().datetime(), ends_at: z.string().datetime() }).strict(),
  z.object({ action: z.literal('delivery'), order_id: z.string().uuid(), transition: z.enum(['activate', 'pause', 'resume', 'complete']) }).strict(),
  z.object({ action: z.literal('generate_report'), order_id: z.string().uuid(), period_start: z.string().date(), period_end: z.string().date() }).strict(),
  z.object({ action: z.literal('notification'), notification_id: z.string().uuid(), status: z.enum(['sent', 'failed', 'discarded', 'retry']), error_code: z.string().regex(/^[A-Z0-9_]{2,60}$/).nullable().optional() }).strict(),
])

export type PromotionOwnerOperation = z.infer<typeof PromotionOwnerOperationSchema>
export type PromotionAdminOperation = z.infer<typeof PromotionAdminOperationSchema>
