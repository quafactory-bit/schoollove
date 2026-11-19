import { NextRequest,NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { loadFunnelFeedback } from '@/lib/part2FunnelAdmin'
export async function GET(request:NextRequest){
  const headers={'Cache-Control':'private, no-store, max-age=0'}
  if(!await requireAdminSession(request))return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401,headers})
  try{
    const report=await loadFunnelFeedback()
    if(request.nextUrl.searchParams.get('download')==='1')return NextResponse.json(report,{headers:{...headers,'Content-Disposition':'attachment; filename="funnel_feedback_report.json"'}})
    return NextResponse.json(report,{headers})
  }catch{return NextResponse.json({error:'FUNNEL_DATA_UNAVAILABLE'},{status:503,headers})}
}
