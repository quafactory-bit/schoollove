import { NextRequest, NextResponse } from 'next/server'

const LEGACY_TRACE_WRITE_DISABLED_CODE = 'LEGACY_TRACE_WRITE_PERMANENTLY_DISABLED'

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      error: '기존 공개 흔적 등록은 개인정보 안전 전환으로 종료되었습니다.',
      code: LEGACY_TRACE_WRITE_DISABLED_CODE,
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
