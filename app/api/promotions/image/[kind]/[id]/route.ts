import { NextResponse } from 'next/server'
import { isSafePromotionImageUrl } from '@/lib/policy/promotionSafety'
import { resolvePromotionImage } from '@/lib/promotions'

const allowedContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function GET(_request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await context.params
  if (!['sponsored', 'editorial'].includes(kind) || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 })
  const source = await resolvePromotionImage(kind as 'sponsored' | 'editorial', id)
  if (!source || !isSafePromotionImageUrl(source)) return new NextResponse(null, { status: 404 })
  const upstream = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' } }).catch(() => null)
  if (!upstream?.ok) return new NextResponse(null, { status: 502 })
  const contentType = upstream.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? ''
  const contentLength = Number(upstream.headers.get('content-length') ?? 0)
  if (!allowedContentTypes.has(contentType) || (contentLength > 0 && contentLength > 5_000_000)) return new NextResponse(null, { status: 415 })
  const bytes = await upstream.arrayBuffer()
  if (bytes.byteLength > 5_000_000) return new NextResponse(null, { status: 413 })
  return new NextResponse(bytes, {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" },
  })
}
