import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/api/requireAdmin'
import { buildControlledBetaDailyReport } from '@/lib/betaOperations'

export async function GET(request:NextRequest) {
  if(!(await requireAdminSession(request))) return NextResponse.json({error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'Cache-Control':'private, no-store'}})
  const format=request.nextUrl.searchParams.get('format')==='csv'?'csv':'json'
  try {
    const report=await buildControlledBetaDailyReport(format)
    return new NextResponse(report.body,{headers:{'Content-Type':report.contentType,'Cache-Control':'private, no-store, max-age=0','Content-Disposition':format==='csv'?'attachment; filename="controlled-beta-daily.csv"':'inline','X-Robots-Tag':'noindex, nofollow, noarchive'}})
  } catch { return NextResponse.json({error:'REPORT_UNAVAILABLE'},{status:500,headers:{'Cache-Control':'private, no-store'}}) }
}
