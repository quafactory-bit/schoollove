import 'server-only'

import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { PromotionAdminOperation, PromotionOwnerOperation } from '@/lib/policy/promotionOperations'
import { createCsv } from '@/lib/csv'

export const hashPromotionOperationKey = (value: string) => createHash('sha256').update(value.normalize('NFKC').trim()).digest('hex')

function firstResult(value: unknown) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function getPromotionOperationsOwnerState(userId: string) {
  const admin = getSupabaseAdmin()
  const [products, quotes, orders, reports, notifications] = await Promise.all([
    admin.from('promotion_products').select('id,product_code,name,description,placement_type,duration_days,image_width,image_height,title_limit,body_limit,base_price_krw,currency,vat_display_mode,allows_school_targeting,allows_region_targeting,price_policy_version,catalog_version').eq('sale_status', 'active').order('name'),
    admin.from('promotion_quotes').select('id,request_id,product_id,quote_number,status,subtotal_krw,vat_krw,total_krw,currency,price_policy_version,product_snapshot,issued_at,expires_at,responded_at').eq('owner_user_id', userId).order('issued_at', { ascending: false }),
    admin.from('promotion_commercial_orders').select('id,order_number,quote_id,request_id,status,subtotal_krw,vat_krw,total_krw,received_amount_krw,refunded_amount_krw,currency,payment_provider,payment_due_at,product_snapshot,price_policy_version,accepted_at,updated_at,promotion_requests(title,body,landing_url,requested_placement,requested_date,promotion_assets(image_url,review_status),promotion_placements(starts_at,ends_at,status)),promotion_order_status_history(from_status,to_status,actor_type,reason_code,created_at),promotion_payment_submissions(id,declared_amount_krw,status,submitted_at,reviewed_at),promotion_payment_confirmations(confirmed_amount_krw,cumulative_amount_krw,match_status,confirmed_at),promotion_cancellation_requests(id,reason_code,status,decision_reason_code,requested_at,decided_at),promotion_refunds(id,status,approved_amount_krw,completed_amount_krw,decision_reason_code,updated_at)').eq('owner_user_id', userId).order('accepted_at', { ascending: false }),
    admin.from('promotion_performance_reports').select('id,order_id,period_start,period_end,placement_type,context_key,impressions,clicks,daily_totals,generated_at').eq('owner_user_id', userId).order('generated_at', { ascending: false }),
    admin.from('promotion_notification_outbox').select('id,event_type,aggregate_type,aggregate_id,payload,status,created_at,processed_at').eq('owner_user_id', userId).order('created_at', { ascending: false }).limit(100),
  ])
  if ([products, quotes, orders, reports, notifications].some((result) => result.error)) return null
  return { products: products.data ?? [], quotes: quotes.data ?? [], orders: orders.data ?? [], reports: reports.data ?? [], notifications: notifications.data ?? [] }
}

export async function applyPromotionOwnerOperation(userId: string, action: PromotionOwnerOperation) {
  const admin = getSupabaseAdmin()
  const key = hashPromotionOperationKey(action.idempotency_key)
  if (action.action === 'quote_response') {
    const result = await admin.rpc('respond_own_promotion_quote', { actor_user_id: userId, target_quote_id: action.quote_id, response_action: action.response, request_key_hash: key })
    return result.error ? null : firstResult(result.data)
  }
  if (action.action === 'payment_notice') {
    const result = await admin.rpc('submit_manual_payment_notice', { actor_user_id: userId, target_order_id: action.order_id, declared_amount: action.declared_amount_krw, request_key_hash: key })
    return result.error ? null : firstResult(result.data)
  }
  const result = await admin.rpc('request_promotion_cancellation', { actor_user_id: userId, target_order_id: action.order_id, requested_reason: action.reason_code, request_key_hash: key })
  return result.error ? null : firstResult(result.data)
}

export async function getPromotionOperationsAdminState(filters?: { status?: string; school?: string; region?: string }) {
  const admin = getSupabaseAdmin()
  let calendar = admin.from('promotion_placements').select('id,request_id,placement_type,context_key,slot_date,starts_at,ends_at,status').order('starts_at').limit(500)
  if (filters?.status) calendar = calendar.eq('status', filters.status)
  if (filters?.school) calendar = calendar.eq('context_key', `school:${filters.school}`)
  if (filters?.region) calendar = calendar.eq('context_key', `region:${filters.region}`)
  const [products, requests, quotes, orders, paymentQueue, cancellations, refunds, outbox, reports, slots] = await Promise.all([
    admin.from('promotion_products').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('promotion_requests').select('id,title,requested_placement,requested_date,status,submitted_at').in('status', ['pending_review', 'changes_requested']).order('submitted_at').limit(200),
    admin.from('promotion_quotes').select('id,request_id,owner_user_id,product_id,quote_number,status,total_krw,price_policy_version,issued_at,expires_at').order('issued_at', { ascending: false }).limit(200),
    admin.from('promotion_commercial_orders').select('id,order_number,request_id,owner_user_id,status,total_krw,received_amount_krw,refunded_amount_krw,payment_due_at,price_policy_version,accepted_at').order('accepted_at', { ascending: false }).limit(200),
    admin.from('promotion_payment_submissions').select('id,order_id,declared_amount_krw,status,submitted_at').eq('status', 'pending_review').order('submitted_at').limit(200),
    admin.from('promotion_cancellation_requests').select('id,order_id,reason_code,status,requested_at').eq('status', 'pending').order('requested_at').limit(200),
    admin.from('promotion_refunds').select('id,order_id,status,approved_amount_krw,completed_amount_krw,decision_reason_code,created_at,updated_at').order('created_at', { ascending: false }).limit(200),
    admin.from('promotion_notification_outbox').select('id,event_type,aggregate_type,aggregate_id,status,attempts,available_at,last_error_code,created_at').in('status', ['pending', 'failed']).order('available_at').limit(200),
    admin.from('promotion_performance_reports').select('id,order_id,period_start,period_end,placement_type,context_key,impressions,clicks,generated_at').order('generated_at', { ascending: false }).limit(200),
    calendar,
  ])
  if ([products, requests, quotes, orders, paymentQueue, cancellations, refunds, outbox, reports, slots].some((result) => result.error)) return null
  return { products: products.data ?? [], requests: requests.data ?? [], quotes: quotes.data ?? [], orders: orders.data ?? [], paymentQueue: paymentQueue.data ?? [], cancellations: cancellations.data ?? [], refunds: refunds.data ?? [], outbox: outbox.data ?? [], reports: reports.data ?? [], calendar: slots.data ?? [] }
}

export async function applyPromotionAdminOperation(action: PromotionAdminOperation) {
  const admin = getSupabaseAdmin()
  const actor = 'admin-session'
  if (action.action === 'upsert_product') {
    const p = action.product
    return admin.rpc('admin_upsert_promotion_product', { target_product_id: p.product_id ?? null, requested_code: p.product_code, requested_name: p.name, requested_description: p.description, requested_placement: p.placement_type, requested_duration_days: p.duration_days, requested_image_width: p.image_width, requested_image_height: p.image_height, requested_title_limit: p.title_limit, requested_body_limit: p.body_limit, requested_base_price_krw: p.base_price_krw, requested_vat_display_mode: p.vat_display_mode, requested_allows_school: p.allows_school_targeting, requested_allows_region: p.allows_region_targeting, requested_sale_status: p.sale_status, requested_price_policy_version: p.price_policy_version, admin_actor: actor })
  }
  if (action.action === 'issue_quote') return admin.rpc('admin_approve_and_quote_promotion_request', { target_request_id: action.request_id, target_product_id: action.product_id, requested_expires_at: action.expires_at, review_note: action.note ?? null, admin_actor: actor })
  if (action.action === 'confirm_payment') return admin.rpc('admin_confirm_manual_payment', { target_order_id: action.order_id, target_submission_id: action.submission_id, confirmed_amount: action.confirmed_amount_krw, requested_match_status: action.match_status, request_key_hash: hashPromotionOperationKey(action.idempotency_key), admin_actor: actor })
  if (action.action === 'decide_cancellation') return admin.rpc('admin_decide_promotion_cancellation', { target_cancellation_id: action.cancellation_id, decision: action.decision, refund_amount: action.refund_amount_krw, decision_reason: action.reason_code, admin_actor: actor })
  if (action.action === 'confirm_refund') return admin.rpc('admin_confirm_promotion_refund', { target_refund_id: action.refund_id, requested_status: action.status, completed_amount: action.completed_amount_krw, decision_reason: action.reason_code, admin_actor: actor })
  if (action.action === 'schedule') return admin.rpc('admin_schedule_promotion_order', { target_order_id: action.order_id, scheduled_starts_at: action.starts_at, scheduled_ends_at: action.ends_at, admin_actor: actor })
  if (action.action === 'delivery') return admin.rpc('admin_set_promotion_order_delivery', { target_order_id: action.order_id, requested_action: action.transition, admin_actor: actor })
  if (action.action === 'generate_report') return admin.rpc('admin_generate_promotion_report', { target_order_id: action.order_id, requested_start: action.period_start, requested_end: action.period_end, admin_actor: actor })
  return admin.rpc('admin_update_promotion_notification', { target_notification_id: action.notification_id, requested_status: action.status, safe_error_code: action.error_code ?? null, admin_actor: actor })
}

export async function createOwnerPerformanceCsv(userId: string) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('promotion_performance_reports').select('period_start,period_end,placement_type,context_key,impressions,clicks').eq('owner_user_id', userId).order('period_start')
  if (error) return null
  return createCsv(['기간 시작', '기간 종료', '배치', '문맥', '노출', '클릭', 'CTR'], (data ?? []).map((row) => [row.period_start, row.period_end, row.placement_type, row.context_key, row.impressions, row.clicks, row.impressions ? ((row.clicks / row.impressions) * 100).toFixed(2) : '0.00']))
}

export async function createAdminCalendarCsv(filters?: { status?: string; school?: string; region?: string }) {
  const state = await getPromotionOperationsAdminState(filters)
  if (!state) return null
  return createCsv(['KST 날짜', '배치', '문맥', '시작', '종료', '상태'], state.calendar.map((row) => [row.slot_date, row.placement_type, row.context_key, row.starts_at, row.ends_at, row.status]))
}
