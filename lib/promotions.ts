import 'server-only'

import { createHash, createHmac, randomBytes } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'

type PromotionContext = {
  placement: 'homepage_today' | 'school_page' | 'region_page' | 'content_feed'
  schoolId?: string | null
  regionCode?: string | null
}

export type PublicPromotion = {
  placementId: string
  kind: 'sponsored' | 'editorial'
  label: '스폰서드' | '오늘의 발견'
  accountName: string
  title: string
  body: string
  imageUrl: string
  clickHref: string
}

function firstRow(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') return { id: value }
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

export function makeVerificationCode() {
  return `SL-${randomBytes(5).toString('hex').toUpperCase()}`
}

export function hashVerificationCode(code: string) {
  return createHash('sha256').update(code.normalize('NFKC').trim()).digest('hex')
}

export function getMetricDayKst(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function makeMetricSessionHash(input: { ip: string; userAgent: string; dayKst: string }) {
  const secret = process.env.PROMOTION_METRICS_HASH_SECRET
  if (!secret || secret.length < 32) return null
  return createHmac('sha256', secret)
    .update(`${input.dayKst}\n${input.ip}\n${input.userAgent}`)
    .digest('hex')
}

export async function createPromotionAccount(userId: string, values: {
  account_type: string
  instagram_url: string
  display_name: string
  business_name?: string
  business_contact_name?: string
  business_registration_reference?: string
  business_category?: string
}) {
  const { data, error } = await getSupabaseAdmin().rpc('create_promotion_account', {
    actor_user_id: userId,
    requested_type: values.account_type,
    requested_instagram_url: values.instagram_url,
    requested_display_name: values.display_name,
    requested_business_name: values.business_name ?? null,
    requested_business_contact_name: values.business_contact_name ?? null,
    requested_business_reference: values.business_registration_reference ?? null,
    requested_business_category: values.business_category ?? null,
  })
  return error ? null : firstRow(data)
}

export async function issuePromotionVerification(userId: string, accountId: string) {
  const code = makeVerificationCode()
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  const { data, error } = await getSupabaseAdmin().rpc('issue_promotion_verification', {
    actor_user_id: userId,
    target_account_id: accountId,
    requested_code_hash: hashVerificationCode(code),
    requested_expires_at: expiresAt,
  })
  if (error) return null
  return { verification: firstRow(data), code, expiresAt }
}

export async function submitPromotionRequest(userId: string, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().rpc('submit_promotion_request', {
    actor_user_id: userId,
    target_account_id: values.account_id,
    requested_title: values.title,
    requested_body: values.body,
    requested_image_url: values.image_url,
    requested_landing_url: values.landing_url,
    requested_placement: values.requested_placement,
    requested_slot_date: values.requested_date,
    requested_school_id: values.school_id ?? null,
    requested_region_code: values.region_code ?? null,
    claimed_school_affiliation: values.school_affiliation_claimed ?? false,
  })
  return error ? null : firstRow(data)
}

export async function revisePromotionRequest(userId: string, requestId: string, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().rpc('revise_own_promotion_request', {
    actor_user_id: userId, target_request_id: requestId, requested_title: values.title,
    requested_body: values.body, requested_image_url: values.image_url, requested_landing_url: values.landing_url,
  })
  return !error && data === true
}

export async function cancelPromotionRequest(userId: string, requestId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('cancel_own_promotion_request', { actor_user_id: userId, target_request_id: requestId })
  return !error && data === true
}

export async function getPromotionOwnerState(userId: string) {
  const admin = getSupabaseAdmin()
  const [accounts, requests] = await Promise.all([
    admin.from('promotion_accounts')
      .select('id,account_type,instagram_url,display_name,business_name,status,verified_at,created_at')
      .eq('owner_user_id', userId).order('created_at', { ascending: false }),
    admin.from('promotion_requests')
      .select('id,account_id,title,requested_placement,requested_date,status,submitted_at,promotion_orders(amount_krw,currency,status,confirmed_at),promotion_placements(id,starts_at,ends_at,status)')
      .eq('owner_user_id', userId).order('submitted_at', { ascending: false }),
  ])
  if (accounts.error || requests.error) return null

  const requestRows = requests.data ?? []
  const requestIds = requestRows.map((row) => row.id)
  const [impressions, clicks] = requestIds.length ? await Promise.all([
    admin.from('promotion_impressions').select('placement_id,promotion_placements!inner(request_id)').in('promotion_placements.request_id', requestIds),
    admin.from('promotion_clicks').select('placement_id,promotion_placements!inner(request_id)').in('promotion_placements.request_id', requestIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }]
  if (impressions.error || clicks.error) return null
  const counts = new Map<string, { impressions: number; clicks: number }>()
  for (const row of impressions.data ?? []) {
    const requestId = (Array.isArray(row.promotion_placements) ? row.promotion_placements[0] : row.promotion_placements)?.request_id
    if (requestId) counts.set(requestId, { impressions: (counts.get(requestId)?.impressions ?? 0) + 1, clicks: counts.get(requestId)?.clicks ?? 0 })
  }
  for (const row of clicks.data ?? []) {
    const requestId = (Array.isArray(row.promotion_placements) ? row.promotion_placements[0] : row.promotion_placements)?.request_id
    if (requestId) counts.set(requestId, { impressions: counts.get(requestId)?.impressions ?? 0, clicks: (counts.get(requestId)?.clicks ?? 0) + 1 })
  }
  return { accounts: accounts.data ?? [], requests: requestRows.map((row) => ({ ...row, metrics: counts.get(row.id) ?? { impressions: 0, clicks: 0 } })) }
}

export async function getPublicPromotion(context: PromotionContext): Promise<PublicPromotion | null> {
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()
  let query = admin.from('promotion_placements')
    .select('id,request_id,placement_type,context_key,starts_at,ends_at,status,promotion_requests!inner(id,title,body,landing_url,status,promotion_accounts!inner(display_name,status),promotion_assets!inner(image_url,review_status))')
    .eq('placement_type', context.placement).eq('status', 'active')
    .lte('starts_at', now).gt('ends_at', now).eq('promotion_requests.status', 'active')
    .eq('promotion_requests.promotion_accounts.status', 'verified')
    .eq('promotion_requests.promotion_assets.review_status', 'approved').limit(1)
  if (context.placement === 'school_page') query = query.eq('context_key', context.schoolId ? `school:${context.schoolId}` : '__none__')
  if (context.placement === 'region_page') query = query.eq('context_key', context.regionCode ? `region:${context.regionCode}` : '__none__')
  const { data, error } = await query.maybeSingle()
  if (!error && data) {
    const request = Array.isArray(data.promotion_requests) ? data.promotion_requests[0] : data.promotion_requests
    const account = Array.isArray(request.promotion_accounts) ? request.promotion_accounts[0] : request.promotion_accounts
    const asset = Array.isArray(request.promotion_assets) ? request.promotion_assets[0] : request.promotion_assets
    return {
      placementId: data.id, kind: 'sponsored', label: '스폰서드', accountName: account.display_name,
      title: request.title, body: request.body, imageUrl: `/api/promotions/image/sponsored/${data.id}`,
      clickHref: `/api/promotions/click/${data.id}`,
    }
  }

  let editorial = admin.from('editorial_features')
    .select('id,title,body,image_url,landing_url,placement_type,context_key,promotion_accounts!inner(display_name,status)')
    .eq('status', 'active').eq('placement_type', context.placement).eq('promotion_accounts.status', 'verified')
    .lte('starts_at', now).gt('ends_at', now).limit(1)
  if (context.placement === 'school_page') editorial = editorial.eq('context_key', context.schoolId ? `school:${context.schoolId}` : '__none__')
  if (context.placement === 'region_page') editorial = editorial.eq('context_key', context.regionCode ? `region:${context.regionCode}` : '__none__')
  const result = await editorial.maybeSingle()
  if (result.error || !result.data) return null
  const editorialAccount = Array.isArray(result.data.promotion_accounts) ? result.data.promotion_accounts[0] : result.data.promotion_accounts
  return {
    placementId: result.data.id, kind: 'editorial', label: '오늘의 발견', accountName: editorialAccount.display_name,
    title: result.data.title, body: result.data.body, imageUrl: `/api/promotions/image/editorial/${result.data.id}`,
    clickHref: result.data.landing_url,
  }
}

export async function resolvePromotionImage(kind: 'sponsored' | 'editorial', id: string) {
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()
  if (kind === 'sponsored') {
    const { data, error } = await admin.from('promotion_placements')
      .select('id,status,starts_at,ends_at,promotion_requests!inner(status,promotion_assets!inner(image_url,review_status))')
      .eq('id', id).eq('status', 'active').lte('starts_at', now).gt('ends_at', now)
      .eq('promotion_requests.status', 'active').eq('promotion_requests.promotion_assets.review_status', 'approved').maybeSingle()
    if (error || !data) return null
    const request = Array.isArray(data.promotion_requests) ? data.promotion_requests[0] : data.promotion_requests
    const asset = Array.isArray(request.promotion_assets) ? request.promotion_assets[0] : request.promotion_assets
    return asset?.image_url ?? null
  }
  const { data, error } = await admin.from('editorial_features').select('image_url')
    .eq('id', id).eq('status', 'active').lte('starts_at', now).gt('ends_at', now).maybeSingle()
  return error ? null : data?.image_url ?? null
}

export async function recordPromotionMetric(kind: 'impression' | 'click', input: {
  placementId: string; sessionHash: string; dayKst: string; isBot: boolean; isAdmin: boolean
}) {
  const functionName = kind === 'impression' ? 'record_promotion_impression' : 'record_promotion_click'
  const { data, error } = await getSupabaseAdmin().rpc(functionName, {
    target_placement_id: input.placementId, safe_session_hash: input.sessionHash,
    safe_event_date: input.dayKst, is_bot: input.isBot, is_admin_view: input.isAdmin,
  })
  return !error && Boolean(data)
}

export async function resolvePromotionClick(placementId: string) {
  const now = new Date().toISOString()
  const { data, error } = await getSupabaseAdmin().from('promotion_placements')
    .select('id,status,starts_at,ends_at,promotion_requests!inner(landing_url,status)')
    .eq('id', placementId).eq('status', 'active').lte('starts_at', now).gt('ends_at', now)
    .eq('promotion_requests.status', 'active').maybeSingle()
  if (error || !data) return null
  const request = Array.isArray(data.promotion_requests) ? data.promotion_requests[0] : data.promotion_requests
  return request?.landing_url ?? null
}

export async function reportPromotion(userId: string, placementId: string, reason: string) {
  const { data, error } = await getSupabaseAdmin().rpc('report_public_promotion', {
    actor_user_id: userId, target_placement_id: placementId, report_reason: reason,
  })
  return !error && data === true
}

export async function getAdminPromotionState() {
  const admin = getSupabaseAdmin()
  const [accounts, requests, reports] = await Promise.all([
    admin.from('promotion_accounts').select('id,account_type,instagram_url,display_name,business_name,status,created_at,promotion_account_verifications(id,expires_at,used_at,verified_at)').order('created_at', { ascending: false }).limit(200),
    admin.from('promotion_requests').select('id,account_id,title,body,landing_url,requested_placement,requested_date,school_id,region_code,status,submitted_at,promotion_assets(id,image_url,review_status),promotion_orders(id,amount_krw,status),promotion_placements(id,starts_at,ends_at,status)').order('submitted_at', { ascending: false }).limit(200),
    admin.from('promotion_reports').select('id,placement_id,reason_code,status,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(200),
  ])
  if (accounts.error || requests.error || reports.error) return null
  return { accounts: accounts.data ?? [], requests: requests.data ?? [], reports: reports.data ?? [] }
}

export async function applyAdminPromotionAction(action: Record<string, unknown>) {
  const admin = getSupabaseAdmin()
  let call: { data: unknown; error: unknown }
  switch (action.action) {
    case 'verify_account':
      call = await admin.rpc('admin_verify_promotion_account', { target_verification_id: action.verification_id, submitted_code_hash: hashVerificationCode(String(action.verification_code)), admin_actor: 'admin-session' }); break
    case 'changes_requested': case 'rejected':
      call = await admin.rpc('admin_review_promotion_request', { target_request_id: action.request_id, review_action: action.action, review_reason: action.reason_code ?? 'other', review_note: action.note ?? null, admin_actor: 'admin-session', approved_amount_krw: null }); break
    case 'payment_confirmed':
      call = await admin.rpc('admin_confirm_promotion_payment', { target_request_id: action.request_id, payment_reference: action.internal_reference, admin_actor: 'admin-session' }); break
    case 'scheduled':
      call = await admin.rpc('admin_schedule_promotion', { target_request_id: action.request_id, scheduled_starts_at: action.starts_at, scheduled_ends_at: action.ends_at, admin_actor: 'admin-session' }); break
    default:
      call = await admin.rpc('admin_set_promotion_delivery_status', { target_placement_id: action.placement_id, requested_action: action.action, admin_actor: 'admin-session' })
  }
  return !call.error
}
