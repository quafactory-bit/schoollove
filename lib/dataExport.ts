import { getSupabaseAdmin } from '@/lib/supabase'
import { csvSafe } from '@/lib/policy/operations'

export async function buildOwnerExport(userId: string) {
  const admin = getSupabaseAdmin()
  const [profile, memberships, classHistories, requests, connections, messages, consents, eligibility, promotionAccounts, promotionRequests, promotionOrders, promotionReports, payments, paymentRefunds, paymentDocuments] = await Promise.all([
    admin.from('private_profiles').select('display_name,instagram_handle,profile_photo_url,introduction,profile_visibility,status,created_at,updated_at').eq('owner_user_id',userId).maybeSingle(),
    admin.from('profile_school_memberships').select('id,school_id,graduation_year,class_number,created_at').eq('owner_user_id',userId),
    admin.from('profile_school_class_histories').select('membership_id,grade_number,class_number,created_at,updated_at').eq('owner_user_id',userId).order('grade_number',{ascending:true}),
    admin.from('connection_requests').select('relationship_type,message,status,sent_at,opened_at,reminder_sent_at,responded_at,cancelled_at').eq('sender_user_id',userId),
    admin.from('connections').select('status,connected_at,disconnected_at,updated_at').or(`user_low_id.eq.${userId},user_high_id.eq.${userId}`),
    admin.from('connection_messages').select('message,sent_at,read_at,hidden_at').eq('sender_user_id',userId),
    admin.from('consent_records').select('consent_type,consented,policy_version,consented_at').eq('user_id',userId),
    admin.from('adult_eligibility_records').select('adult_eligible,verification_method,policy_version,adult_verified_at').eq('user_id',userId).order('adult_verified_at',{ascending:false}).limit(1).maybeSingle(),
    admin.from('promotion_accounts').select('account_kind,instagram_url,display_name,status,verified_at,created_at,updated_at').eq('owner_user_id',userId),
    admin.from('promotion_requests').select('id,promotion_type,title,body,landing_url,requested_placement,requested_date,school_id,region_code,status,submitted_at,updated_at,cancelled_at').eq('owner_user_id',userId),
    admin.from('promotion_commercial_orders').select('id,order_number,request_id,status,subtotal_krw,vat_krw,total_krw,received_amount_krw,refunded_amount_krw,currency,payment_provider,payment_due_at,accepted_at,updated_at').eq('owner_user_id',userId),
    admin.from('promotion_performance_reports').select('order_id,period_start,period_end,placement_type,context_key,impressions,clicks,daily_totals,generated_at').eq('owner_user_id',userId),
    admin.from('payment_transactions').select('id,order_id,provider,provider_payment_id,status,order_number,amount_krw,currency,receipt_reference,paid_at,created_at,updated_at').eq('owner_user_id',userId),
    admin.from('payment_refund_attempts').select('payment_transaction_id,provider,requested_amount_krw,completed_amount_krw,status,requested_at,completed_at,payment_transactions!inner(owner_user_id)').eq('payment_transactions.owner_user_id',userId),
    admin.from('payment_document_requests').select('payment_transaction_id,document_type,status,issued_reference,requested_at,updated_at').eq('owner_user_id',userId),
  ])
  const failed = [profile,memberships,classHistories,requests,connections,messages,consents,eligibility,promotionAccounts,promotionRequests,promotionOrders,promotionReports,payments,paymentRefunds,paymentDocuments].find((value) => value.error)
  if (failed?.error) throw new Error('EXPORT_BUILD_FAILED')
  const exportedMemberships = (memberships.data ?? []).map(({ id, ...membership }) => ({
    ...membership,
    class_history: (classHistories.data ?? [])
      .filter((history) => history.membership_id === id)
      .map(({ membership_id: _membershipId, ...history }) => history),
  }))
  return {
    generatedAt: new Date().toISOString(),
    profile: profile.data ?? null,
    memberships: exportedMemberships,
    sentConnectionRequests: requests.data ?? [],
    connectionStates: connections.data ?? [],
    messagesAuthoredByYou: messages.data ?? [],
    consents: consents.data ?? [],
    adultEligibility: eligibility.data ?? null,
    promotionAccounts: promotionAccounts.data ?? [],
    promotionRequests: promotionRequests.data ?? [],
    promotionOrders: promotionOrders.data ?? [],
    promotionPerformanceReports: promotionReports.data ?? [],
    payments: payments.data ?? [],
    paymentRefunds: paymentRefunds.data ?? [],
    paymentDocumentRequests: paymentDocuments.data ?? [],
    note: 'Other users’ identifiers and private profile fields are intentionally excluded.',
  }
}

export function ownerExportCsv(data: Awaited<ReturnType<typeof buildOwnerExport>>): string {
  const rows: Array<[string,string]> = [
    ['generated_at', data.generatedAt],
    ['profile', JSON.stringify(data.profile)],
    ['memberships', JSON.stringify(data.memberships)],
    ['sent_connection_requests', JSON.stringify(data.sentConnectionRequests)],
    ['connection_states', JSON.stringify(data.connectionStates)],
    ['messages_authored_by_you', JSON.stringify(data.messagesAuthoredByYou)],
    ['consents', JSON.stringify(data.consents)],
    ['adult_eligibility', JSON.stringify(data.adultEligibility)],
    ['promotion_accounts', JSON.stringify(data.promotionAccounts)],
    ['promotion_requests', JSON.stringify(data.promotionRequests)],
    ['promotion_orders', JSON.stringify(data.promotionOrders)],
    ['promotion_performance_reports', JSON.stringify(data.promotionPerformanceReports)],
    ['payments', JSON.stringify(data.payments)],
    ['payment_refunds', JSON.stringify(data.paymentRefunds)],
    ['payment_document_requests', JSON.stringify(data.paymentDocumentRequests)],
  ]
  return ['section,value', ...rows.map(([section,value]) => `${csvSafe(section)},${csvSafe(value)}`)].join('\r\n')
}
