import { after } from 'next/server'
import { FUNNEL_COOKIE, classifyFunnelBrowser, parseFunnelCookie, type FunnelEvent } from './part2Funnel'
import { allowPart2Funnel } from './security/part2FunnelRateLimit'
export function funnelRequestContext(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(FUNNEL_COOKIE+'='))?.slice(FUNNEL_COOKIE.length+1)
  return parseFunnelCookie(value) ?? {source:'direct' as const,browser:classifyFunnelBrowser(request.headers.get('user-agent'))}
}
export async function recordServerFunnel(request: Request,event: FunnelEvent): Promise<void> {
  try {
    if (!await allowPart2Funnel(request)) return
    const context = funnelRequestContext(request)
    const { getSupabaseAdmin } = await import('@/lib/supabase')
    await getSupabaseAdmin().rpc('part2_record_funnel_event',{requested_event:event,requested_source:context.source,requested_browser:context.browser,requested_school_id:null}).abortSignal(AbortSignal.timeout(1500))
  } catch { /* Optional, no identifiers/errors are logged. */ }
}

export function scheduleServerFunnel(request: Request,event: FunnelEvent): void {
  try { after(async()=>{ await recordServerFunnel(request,event) }) } catch { /* No request lifecycle: do not block authentication. */ }
}
