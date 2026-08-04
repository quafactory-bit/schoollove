import { NextResponse } from 'next/server'
import { getPublicAccountLaunchState, recordPublicAccountActivity } from '@/lib/publicAccountLaunch'

export async function GET() {
  const launch = await getPublicAccountLaunchState()
  await recordPublicAccountActivity('login_page_view', 'account')
  return NextResponse.json({
    state: launch.state,
    registrationEnabled: launch.registrationEnabled,
    emergencyStopped: launch.emergencyStopped,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
