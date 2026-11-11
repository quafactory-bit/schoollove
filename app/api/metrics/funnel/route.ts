import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { CLIENT_FUNNEL_EVENTS,FUNNEL_COOKIE,FUNNEL_SOURCES,FUNNEL_TTL_SECONDS,classifyFunnelBrowser } from '@/lib/part2Funnel'
import { getSupabaseAdmin } from '@/lib/supabase'
import { allowPart2Funnel } from '@/lib/security/part2FunnelRateLimit'
const Schema = z.object({event:z.enum(CLIENT_FUNNEL_EVENTS),source:z.enum(FUNNEL_SOURCES),schoolId:z.string().uuid().optional()}).strict().superRefine((v,c)=>{
  if (['school_result_selected','school_detail_viewed','cohort_link_share_clicked'].includes(v.event) !== Boolean(v.schoolId)) c.addIssue({code:z.ZodIssueCode.custom,message:'school context required only for school events'})
})
export async function POST(request: NextRequest) {
  const headers = {'Cache-Control':'no-store'}
  if (request.headers.get('origin') !== request.nextUrl.origin || request.headers.get('sec-fetch-site') === 'cross-site') return new NextResponse(null,{status:403,headers})
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length') || 0)>1024) return new NextResponse(null,{status:400,headers})
  if (!await allowPart2Funnel(request)) return new NextResponse(null,{status:429,headers})
  const text = await request.text().catch(()=> '')
  if (text.length>1024) return new NextResponse(null,{status:400,headers})
  let body:unknown
  try { body=JSON.parse(text) } catch { return new NextResponse(null,{status:400,headers}) }
  const parsed=Schema.safeParse(body)
  if (!parsed.success) return new NextResponse(null,{status:400,headers})
  const browser=classifyFunnelBrowser(request.headers.get('user-agent'))
  let recorded=false
  try {
    const result=await getSupabaseAdmin().rpc('part2_record_funnel_event',{requested_event:parsed.data.event,requested_source:parsed.data.source,requested_browser:browser,requested_school_id:parsed.data.schoolId??null}).abortSignal(AbortSignal.timeout(1500))
    recorded=!result.error && result.data===true
  } catch { /* No error payload or submitted values are logged. */ }
  const response=new NextResponse(null,{status:recorded?204:503,headers})
  if (recorded) response.cookies.set(FUNNEL_COOKIE,['1',parsed.data.source,browser].join('.'),{httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:',path:'/',maxAge:FUNNEL_TTL_SECONDS})
  return response
}
