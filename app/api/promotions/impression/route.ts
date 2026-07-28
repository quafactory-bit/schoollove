import { NextRequest, NextResponse } from 'next/server'
import { getMetricDayKst, makeMetricSessionHash, recordPromotionMetric } from '@/lib/promotions'

const isBotAgent = (value: string) => /bot|crawler|spider|preview|headless/i.test(value)

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { placement_id?: unknown } | null
  if (!body || typeof body.placement_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.placement_id)) {
    return NextResponse.json({ recorded: false }, { status: 400 })
  }
  const dayKst = getMetricDayKst()
  const userAgent = request.headers.get('user-agent') ?? ''
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const sessionHash = makeMetricSessionHash({ ip, userAgent, dayKst })
  if (!sessionHash) return NextResponse.json({ recorded: false }, { status: 503 })
  const recorded = await recordPromotionMetric('impression', { placementId: body.placement_id, sessionHash, dayKst, isBot: isBotAgent(userAgent), isAdmin: false })
  return NextResponse.json({ recorded })
}
