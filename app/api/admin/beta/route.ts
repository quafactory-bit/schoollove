import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { applyControlledBetaAction, getControlledBetaState } from '@/lib/betaOperations'
import { BetaAdminActionSchema } from '@/lib/policy/betaOperations'

const privateHeaders={'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow, noarchive'}

export async function GET(request:NextRequest) {
  if(!(await requireAdminSession(request))) return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:privateHeaders})
  try { return NextResponse.json(await getControlledBetaState(),{headers:privateHeaders}) }
  catch { return NextResponse.json({error:'BETA_OPERATIONS_UNAVAILABLE'},{status:500,headers:privateHeaders}) }
}
export async function PATCH(request:NextRequest) {
  if(!(await requireAdminSession(request))) return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:privateHeaders})
  const parsed=BetaAdminActionSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success) return NextResponse.json({error:'INVALID_BETA_OPERATION'},{status:400,headers:privateHeaders})
  try { return NextResponse.json(await applyControlledBetaAction(parsed.data),{headers:privateHeaders}) }
  catch(error) { const code=error instanceof Error && /^[A-Z0-9_]{2,60}$/.test(error.message)?error.message:'BETA_OPERATION_REJECTED';return NextResponse.json({error:code},{status:409,headers:privateHeaders}) }
}
