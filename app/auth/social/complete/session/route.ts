import { scheduleServerFunnel } from '@/lib/part2FunnelServer'
import { completeSocialSession } from '@/lib/auth/social-broker/preview-recovery-http'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const response = await completeSocialSession(request)
  if (response.status === 200) scheduleServerFunnel(request, 'google_login_completed')
  return response
}
