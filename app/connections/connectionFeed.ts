export type RequestItem = { id: string; senderName?: string; relationshipType: string; message?: string; status: string; sentAt: string; reminder?: boolean; reminderCount?: number; school?: { schoolName: string; graduationYear: number } | null }
export type ConnectionItem = { id: string; displayName: string; status: string; connectedAt: string }
export type NotificationItem = { id: string; type: 'request_received' | 'request_reminded' | 'request_accepted'; createdAt: string; read: boolean }

export async function loadConnectionFeed() {
  const responses = await Promise.all([fetch('/api/connections/requests'), fetch('/api/connections'), fetch('/api/connections/notifications')])
  if (responses.some((response) => !response.ok)) throw new Error('CONNECTION_LOAD_FAILED')
  const [requestsData, connectionsData, notificationsData] = await Promise.all(responses.map((response) => response.json()))
  return {
    received: (requestsData.received ?? []) as RequestItem[],
    sent: (requestsData.sent ?? []) as RequestItem[],
    connections: (connectionsData.connections ?? []) as ConnectionItem[],
    notifications: (notificationsData.notifications ?? []) as NotificationItem[],
  }
}
