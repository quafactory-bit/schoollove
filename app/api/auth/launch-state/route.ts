import { NextResponse } from 'next/server'
import { getPublicAccountLaunchState, recordPublicAccountEvent } from '@/lib/publicAccountLaunch'

export async function GET() {
  const launch = await getPublicAccountLaunchState()
  await recordPublicAccountEvent('login_page_view', 'account')
  return NextResponse.json({
    state: launch.state,
    registrationEnabled: launch.registrationEnabled,
    emergencyStopped: launch.emergencyStopped,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
