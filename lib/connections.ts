import { getSupabaseAdmin } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import { maskDisplayName } from '@/lib/policy/connectionSafety'

type RpcRow = Record<string, unknown>

function firstRpcRow(data: unknown): RpcRow | null {
  if (Array.isArray(data)) return (data[0] as RpcRow | undefined) ?? null
  return data && typeof data === 'object' ? data as RpcRow : null
}

export async function findExactConnectionMatch(input: {
  userId: string
  schoolId: string
  graduationYear: number
  exactName: string
}) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.rpc('find_exact_private_profile_match', {
    actor_user_id: input.userId,
    target_school_id: input.schoolId,
    target_graduation_year: input.graduationYear,
    exact_display_name: input.exactName,
  })
  if (error) return null
  const row = firstRpcRow(data)
  if (!row || typeof row.match_state !== 'string') return null
  return {
    state: row.match_state,
    matchToken: typeof row.match_token === 'string' ? row.match_token : null,
  }
}

export async function findExactClassConnectionMatch(input: {
  userId: string
  schoolId: string
  graduationYear: number
  gradeNumber: number
  classNumber: number
  exactName: string
}) {
  const { data, error } = await getSupabaseAdmin().rpc('find_exact_private_profile_class_match', {
    actor_user_id: input.userId,
    target_school_id: input.schoolId,
    target_graduation_year: input.graduationYear,
    target_grade_number: input.gradeNumber,
    target_class_number: input.classNumber,
    exact_display_name: input.exactName,
  })
  if (error) return null
  const row = firstRpcRow(data)
  if (!row || typeof row.match_state !== 'string') return null
  return {
    state: row.match_state,
    matchToken: typeof row.match_token === 'string' ? row.match_token : null,
  }
}

export async function createConnectionRequest(input: {
  userId: string
  matchToken: string
  relationshipType: string
  message: string
}) {
  const { data, error } = await getSupabaseAdmin().rpc('create_connection_request', {
    actor_user_id: input.userId,
    opaque_match_token: input.matchToken,
    request_relationship: input.relationshipType,
    request_message: input.message,
  })
  if (error) return null
  const row = firstRpcRow(data)
  return row ? {
    created: row.created === true,
    requestId: typeof row.request_id === 'string' ? row.request_id : null,
    state: typeof row.request_state === 'string' ? row.request_state : 'unavailable',
  } : null
}

export async function remindConnectionRequest(userId: string, requestId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('remind_connection_request', {
    actor_user_id: userId,
    target_request_id: requestId,
  })
  return !error && data === true
}

export async function cancelConnectionRequest(userId: string, requestId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('cancel_connection_request', {
    actor_user_id: userId,
    target_request_id: requestId,
  })
  return !error && data === true
}

export async function respondConnectionRequest(input: {
  userId: string
  requestId: string
  action: string
  reasonCode?: string
}) {
  const { data, error } = await getSupabaseAdmin().rpc('respond_connection_request', {
    actor_user_id: input.userId,
    target_request_id: input.requestId,
    response_action: input.action,
    report_reason_code: input.reasonCode ?? null,
  })
  if (error) return null
  const row = firstRpcRow(data)
  return row ? {
    handled: row.handled === true,
    connectionId: typeof row.connection_id === 'string' ? row.connection_id : null,
    state: typeof row.request_state === 'string' ? row.request_state : 'unavailable',
  } : null
}

type RequestRow = {
  id: string
  sender_user_id: string
  receiver_user_id: string
  target_school_membership_id: string | null
  relationship_type: string
  message: string
  status: string
  sent_at: string
  opened_at: string | null
  reminder_sent_at: string | null
  reminder_count: number
}

export async function getConnectionRequests(userId: string) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('connection_requests')
    .select('id,sender_user_id,receiver_user_id,target_school_membership_id,relationship_type,message,status,sent_at,opened_at,reminder_sent_at,reminder_count')
    .or(`sender_user_id.eq.${userId},receiver_user_id.eq.${userId}`)
    .order('sent_at', { ascending: false })
    .limit(100)
  if (error) return null
  const rows = (data ?? []) as RequestRow[]
  const incoming = rows.filter((row) => row.receiver_user_id === userId)
  const senderIds = [...new Set(incoming.map((row) => row.sender_user_id))]
  const membershipIds = [...new Set(incoming
    .map((row) => row.target_school_membership_id)
    .filter((id): id is string => typeof id === 'string'))]

  const [profilesResult, membershipsResult] = await Promise.all([
    senderIds.length ? admin.from('private_profiles').select('owner_user_id,display_name').in('owner_user_id', senderIds) : Promise.resolve({ data: [], error: null }),
    membershipIds.length ? admin.from('profile_school_memberships').select('id,graduation_year,school_id').in('id', membershipIds) : Promise.resolve({ data: [], error: null }),
  ])
  // Auxiliary display lookups must never hide an owned pending request and its
  // receiver safety actions. Fail closed to masked/missing display metadata.
  const profileRows = profilesResult.error ? [] : profilesResult.data ?? []
  const names = new Map(profileRows.map((row: { owner_user_id: string; display_name: string }) => [row.owner_user_id, maskDisplayName(row.display_name)]))
  const membershipRows = (membershipsResult.error ? [] : membershipsResult.data ?? []) as Array<{ id: string; graduation_year: number; school_id: string }>
  const schoolIds = [...new Set(membershipRows.map((row) => row.school_id))]
  const schoolsResult = schoolIds.length
    ? await admin.from('schools').select('id,school_name').in('id', schoolIds)
    : { data: [], error: null }
  const schoolRows = schoolsResult.error ? [] : schoolsResult.data ?? []
  const schoolNames = new Map(schoolRows.map((row: { id: string; school_name: string }) => [row.id,row.school_name]))
  const memberships = new Map(membershipRows.map((row) => [row.id, {
    schoolName: schoolNames.get(row.school_id) ?? '학교', graduationYear: row.graduation_year,
  }]))

  return {
    received: incoming.map((row) => ({
      id: row.id,
      senderName: names.get(row.sender_user_id) ?? '알 수 없는 사용자',
      relationshipType: row.relationship_type,
      message: row.message,
      status: row.status,
      sentAt: row.sent_at,
      reminder: row.reminder_count === 1,
      school: row.target_school_membership_id
        ? memberships.get(row.target_school_membership_id) ?? null
        : null,
    })),
    sent: rows.filter((row) => row.sender_user_id === userId).map((row) => ({
      id: row.id,
      relationshipType: row.relationship_type,
      status: row.status,
      sentAt: row.sent_at,
      reminderSentAt: row.reminder_sent_at,
      reminderCount: row.reminder_count,
    })),
  }
}

type ConnectionRow = {
  id: string
  user_low_id: string
  user_high_id: string
  status: string
  connected_at: string
}

export async function getConnections(userId: string) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('connections')
    .select('id,user_low_id,user_high_id,status,connected_at')
    .or(`user_low_id.eq.${userId},user_high_id.eq.${userId}`)
    .order('connected_at', { ascending: false })
    .limit(100)
  if (error) return null
  const rows = (data ?? []) as ConnectionRow[]
  const counterpartIds = [...new Set(rows.map((row) => row.user_low_id === userId ? row.user_high_id : row.user_low_id))]
  const profiles = counterpartIds.length
    ? await admin.from('private_profiles').select('owner_user_id,display_name').in('owner_user_id', counterpartIds)
    : { data: [], error: null }
  if (profiles.error) return null
  const names = new Map((profiles.data ?? []).map((row: { owner_user_id: string; display_name: string }) => [row.owner_user_id, row.display_name]))
  return rows.map((row) => {
    const otherId = row.user_low_id === userId ? row.user_high_id : row.user_low_id
    return { id: row.id, displayName: names.get(otherId) ?? '연결된 사용자', status: row.status, connectedAt: row.connected_at }
  })
}

export async function getConnectionDetail(userId: string, connectionId: string) {
  const admin = getSupabaseAdmin()
  const { data: connection, error } = await admin.from('connections')
    .select('id,user_low_id,user_high_id,status,connected_at')
    .eq('id', connectionId).maybeSingle()
  const row = connection as ConnectionRow | null
  if (error || !row || ![row.user_low_id, row.user_high_id].includes(userId)) return null
  const otherId = row.user_low_id === userId ? row.user_high_id : row.user_low_id
  const { data: profile, error: profileError } = await admin.from('private_profiles')
    .select('display_name')
    .eq('owner_user_id', otherId)
    .maybeSingle()
  if (profileError) return null
  return {
    id: row.id,
    status: row.status,
    displayName: typeof profile?.display_name === 'string' ? profile.display_name : '연결된 사용자',
  }
}

type InstagramPermissionRow = {
  grantor_user_id: string
  grantee_user_id: string
}

export type ConnectionInstagramState = {
  instagramHandle: string | null
  myInstagramConfigured: boolean
  myInstagramVisible: boolean
}

export async function getConnectionInstagramState(
  userId: string,
  connectionId: string,
): Promise<ConnectionInstagramState | null> {
  const admin = getSupabaseAdmin()
  const { data: connection, error } = await admin.from('connections')
    .select('id,user_low_id,user_high_id,status')
    .eq('id', connectionId)
    .maybeSingle()
  const row = connection as ConnectionRow | null
  if (error || !row || row.status !== 'active' || ![row.user_low_id, row.user_high_id].includes(userId)) return null

  const otherId = row.user_low_id === userId ? row.user_high_id : row.user_low_id
  const [ownProfileResult, permissionResult, blockResult] = await Promise.all([
    admin.from('private_profiles')
      .select('instagram_handle')
      .eq('owner_user_id', userId)
      .maybeSingle(),
    admin.from('connection_instagram_permissions')
      .select('grantor_user_id,grantee_user_id')
      .eq('connection_id', connectionId)
      .eq('status', 'active'),
    admin.from('user_blocks')
      .select('id')
      .or(`and(blocker_user_id.eq.${userId},blocked_user_id.eq.${otherId}),and(blocker_user_id.eq.${otherId},blocked_user_id.eq.${userId})`)
      .limit(1),
  ])
  if (ownProfileResult.error || permissionResult.error || blockResult.error || (blockResult.data?.length ?? 0) > 0) return null

  const permissions = (permissionResult.data ?? []) as InstagramPermissionRow[]
  const myInstagramVisible = permissions.some((permission) => (
    permission.grantor_user_id === userId && permission.grantee_user_id === otherId
  ))
  const counterpartGranted = permissions.some((permission) => (
    permission.grantor_user_id === otherId && permission.grantee_user_id === userId
  ))
  const ownHandle = (ownProfileResult.data as { instagram_handle?: string | null } | null)?.instagram_handle
  let instagramHandle: string | null = null

  // Do not even read the counterpart handle until their directed grant exists.
  if (counterpartGranted) {
    const { data: counterpartProfile, error: counterpartProfileError } = await admin.from('private_profiles')
      .select('instagram_handle')
      .eq('owner_user_id', otherId)
      .maybeSingle()
    if (counterpartProfileError) return null
    const grantedHandle = (counterpartProfile as { instagram_handle?: string | null } | null)?.instagram_handle
    instagramHandle = typeof grantedHandle === 'string' && grantedHandle.trim().length > 0 ? grantedHandle : null
  }

  return {
    instagramHandle,
    myInstagramConfigured: typeof ownHandle === 'string' && ownHandle.trim().length > 0,
    myInstagramVisible,
  }
}

export async function getConversation(userId: string, connectionId: string) {
  const admin = getSupabaseAdmin()
  const { data: connection, error } = await admin.from('connections')
    .select('id,user_low_id,user_high_id,status,connected_at')
    .eq('id', connectionId).maybeSingle()
  const row = connection as ConnectionRow | null
  if (error || !row || ![row.user_low_id, row.user_high_id].includes(userId)) return null
  const otherId = row.user_low_id === userId ? row.user_high_id : row.user_low_id
  const [messagesResult, profileResult, permissionResult] = await Promise.all([
    admin.from('connection_messages').select('id,sender_user_id,message,sent_at,read_at,hidden_at').eq('connection_id', connectionId).order('sent_at', { ascending: true }).limit(200),
    admin.from('private_profiles').select('display_name,instagram_handle').eq('owner_user_id', otherId).maybeSingle(),
    admin.from('connection_instagram_permissions').select('id').eq('connection_id', connectionId).eq('grantor_user_id', otherId).eq('grantee_user_id', userId).eq('status', 'active').limit(1),
  ])
  if (messagesResult.error || profileResult.error || permissionResult.error) return null
  const otherProfile = profileResult.data as { display_name?: string; instagram_handle?: string | null } | null
  return {
    id: row.id,
    status: row.status,
    displayName: otherProfile?.display_name ?? '연결된 사용자',
    instagramHandle: (permissionResult.data?.length ?? 0) > 0 ? otherProfile?.instagram_handle ?? null : null,
    messages: (messagesResult.data ?? []).map((message: { id: string; sender_user_id: string; message: string; sent_at: string; read_at: string | null; hidden_at: string | null }) => ({
      id: message.id,
      mine: message.sender_user_id === userId,
      message: message.hidden_at ? '관리자 검토로 숨겨진 메시지입니다.' : message.message,
      sentAt: message.sent_at,
      read: message.read_at !== null,
      hidden: message.hidden_at !== null,
    })),
  }
}

export async function sendConnectionMessage(userId: string, connectionId: string, message: string) {
  const { data, error } = await getSupabaseAdmin().rpc('send_connection_message', {
    actor_user_id: userId, target_connection_id: connectionId, message_text: message,
  })
  return !error && typeof data === 'string' ? data : null
}

export async function markConversationRead(userId: string, connectionId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('mark_connection_messages_read', {
    actor_user_id: userId, target_connection_id: connectionId,
  })
  return !error && typeof data === 'number'
}

export async function disconnectConnection(userId: string, connectionId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('disconnect_connection', {
    actor_user_id: userId, target_connection_id: connectionId,
  })
  return !error && data === true
}

export async function blockConnectionUser(userId: string, connectionId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('block_connection_user', {
    actor_user_id: userId, target_connection_id: connectionId,
  })
  return !error && data === true
}

export async function reportConnectionSafety(input: { userId: string; connectionId: string; messageId?: string; reasonCode: string }) {
  const { data, error } = await getSupabaseAdmin().rpc('report_connection_safety', {
    actor_user_id: input.userId,
    target_connection_id: input.connectionId,
    target_message_id: input.messageId ?? null,
    report_reason_code: input.reasonCode,
  })
  return !error && data === true
}

export async function setInstagramPermission(userId: string, connectionId: string, visible: boolean) {
  const { data, error } = await getSupabaseAdmin().rpc('set_connection_instagram_permission', {
    actor_user_id: userId, target_connection_id: connectionId, make_visible: visible,
  })
  return !error && data === true
}

type ConnectionNotificationRpcRow = {
  id?: unknown
  event_type?: unknown
  created_at?: unknown
  read_at?: unknown
}

export type ConnectionNotification = {
  id: string
  type: 'request_received' | 'request_reminded' | 'request_accepted'
  createdAt: string
  read: boolean
}

function parseConnectionNotification(row: ConnectionNotificationRpcRow): ConnectionNotification | null {
  if (typeof row.id !== 'string' || typeof row.created_at !== 'string') return null
  if (row.event_type !== 'request_received' && row.event_type !== 'request_reminded' && row.event_type !== 'request_accepted') return null
  return { id: row.id, type: row.event_type, createdAt: row.created_at, read: row.read_at !== null }
}

export async function getOwnConnectionNotifications(client: SupabaseClient, requestedLimit = 20) {
  const { data, error } = await client.rpc('get_own_connection_notifications', { requested_limit: requestedLimit })
  if (error || !Array.isArray(data)) return null
  return data
    .map((row) => parseConnectionNotification(row as ConnectionNotificationRpcRow))
    .filter((row): row is ConnectionNotification => row !== null)
}

export async function getOwnConnectionNotificationUnreadCount(client: SupabaseClient) {
  const { data, error } = await client.rpc('get_own_connection_notification_unread_count')
  return !error && typeof data === 'number' && Number.isInteger(data) && data >= 0 ? data : null
}

export async function markOwnConnectionNotificationRead(client: SupabaseClient, notificationId: string) {
  const { data, error } = await client.rpc('mark_own_connection_notification_read', {
    target_notification_id: notificationId,
  })
  return !error && data === true
}

export async function getAdminSafetyReports() {
  const { data, error } = await getSupabaseAdmin().from('safety_reports')
    .select('id,reason_code,status,request_id,connection_id,message_id,created_at,reviewed_at')
    .order('created_at', { ascending: false }).limit(100)
  return error ? null : data ?? []
}

export async function applyAdminConnectionSafetyAction(action: string, reportId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('admin_apply_connection_safety_action', {
    requested_action: action, target_report_id: reportId,
  })
  return !error && data === true
}
