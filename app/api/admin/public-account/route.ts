import { NextRequest,NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getPublicAccountAdminState } from '@/lib/publicAccountLaunch'

const MutationSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('set_state'),state:z.enum(['closed','internal_test','ready','open','emergency_stopped']),reason:z.string().regex(/^[A-Z0-9_]{2,60}$/)}).strict(),
  z.object({action:z.literal('complete_deletion'),requestId:z.string().uuid(),reason:z.string().regex(/^[A-Z0-9_]{2,60}$/)}).strict(),
])

export async function GET(request:NextRequest){
  if(!(await requireAdminSession(request)))return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401})
  try{return NextResponse.json(await getPublicAccountAdminState(),{headers:{'Cache-Control':'private, no-store'}})}
  catch{return NextResponse.json({error:'PUBLIC_ACCOUNT_ADMIN_STATE_UNAVAILABLE'},{status:503})}
}

export async function PATCH(request:NextRequest){
  if(!(await requireAdminSession(request)))return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401})
  const parsed=MutationSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success)return NextResponse.json({error:'INVALID_PUBLIC_ACCOUNT_OPERATION'},{status:400})
  const admin=getSupabaseAdmin()
  const operation=parsed.data.action==='set_state'
    ? await admin.rpc('admin_set_public_account_launch_state',{requested_state:parsed.data.state,requested_reason:parsed.data.reason,admin_actor:'admin_console'})
    : await admin.rpc('admin_complete_public_account_deletion',{target_request_id:parsed.data.requestId,requested_reason:parsed.data.reason,admin_actor:'admin_console'})
  if(operation.error||operation.data!==true)return NextResponse.json({error:'PUBLIC_ACCOUNT_OPERATION_REJECTED'},{status:409})
  return NextResponse.json({ok:true})
}
