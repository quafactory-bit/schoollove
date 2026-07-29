import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { BetaFeedbackSchema } from '@/lib/policy/betaOperations'

const headers={'Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow, noarchive'}

export async function GET(request:NextRequest) {
  const auth=await getAuthenticatedRequestContext(request)
  if(!auth) return NextResponse.json({error:'AUTH_REQUIRED'},{status:401,headers})
  const {data,error}=await auth.client.from('beta_feedback').select('id,program_id,kind,description,page_path,coarse_browser,coarse_device,safe_error_code,status,priority,resolution_code,created_at,updated_at').eq('owner_user_id',auth.user.id).order('created_at',{ascending:false}).limit(50)
  if(error) return NextResponse.json({error:'FEEDBACK_UNAVAILABLE'},{status:500,headers})
  return NextResponse.json({feedback:data??[]},{headers})
}
export async function POST(request:NextRequest) {
  const auth=await getAuthenticatedRequestContext(request)
  if(!auth) return NextResponse.json({error:'AUTH_REQUIRED'},{status:401,headers})
  const parsed=BetaFeedbackSchema.safeParse(await request.json().catch(()=>null))
  if(!parsed.success) return NextResponse.json({error:'INVALID_FEEDBACK'},{status:400,headers})
  const value=parsed.data
  const {data,error}=await auth.client.from('beta_feedback').insert({program_id:value.programId,owner_user_id:auth.user.id,kind:value.kind,description:value.description,page_path:value.pagePath,coarse_browser:value.coarseBrowser??null,coarse_device:value.coarseDevice??null,safe_error_code:value.safeErrorCode??null}).select('id,status,created_at').single()
  if(error) return NextResponse.json({error:'FEEDBACK_NOT_ALLOWED'},{status:403,headers})
  return NextResponse.json({feedback:data},{status:201,headers})
}
