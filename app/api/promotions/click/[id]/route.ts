import { NextRequest, NextResponse } from 'next/server'
import { getMetricDayKst, makeMetricSessionHash, recordPromotionMetric, resolvePromotionClick } from '@/lib/promotions'
import { isSafeHttpsUrl } from '@/lib/policy/promotionSafety'

const isBotAgent = (value: string) => /bot|crawler|spider|preview|headless/i.test(value)

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 })
  const landingUrl = await resolvePromotionClick(id)
  if (!landingUrl || !isSafeHttpsUrl(landingUrl)) return new NextResponse(null, { status: 404 })
  const dayKst = getMetricDayKst()
  const userAgent = request.headers.get('user-agent') ?? ''
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const sessionHash = makeMetricSessionHash({ ip, userAgent, dayKst })
  if (sessionHash) await recordPromotionMetric('click', { placementId: id, sessionHash, dayKst, isBot: isBotAgent(userAgent), isAdmin: false })
  return NextResponse.redirect(landingUrl, 302)
}
