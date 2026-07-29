import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { isSyntheticModeAllowed, syntheticBetaScenario } from '@/lib/policy/betaOperations'

export async function GET(request:NextRequest) {
  if(!isSyntheticModeAllowed()) return NextResponse.json({error:'NOT_FOUND'},{status:404,headers:{'Cache-Control':'private, no-store'}})
  if(!(await requireAdminSession(request))) return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'Cache-Control':'private, no-store'}})
  return NextResponse.json(syntheticBetaScenario,{headers:{'Cache-Control':'private, no-store, max-age=0','X-Synthetic-Data':'true','X-Robots-Tag':'noindex, nofollow, noarchive'}})
}
