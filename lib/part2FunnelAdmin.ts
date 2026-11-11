import { getSupabaseAdmin } from '@/lib/supabase'
import { buildFunnelFeedback,type FunnelRow } from './part2FunnelReport'
export async function loadFunnelFeedback(now=new Date()) {
  const result=await getSupabaseAdmin().rpc('part2_get_funnel_snapshot').abortSignal(AbortSignal.timeout(5000))
  if(result.error||!Array.isArray(result.data)||result.data.length>20000)throw new Error('FUNNEL_DATA_UNAVAILABLE')
  return buildFunnelFeedback(result.data as FunnelRow[],now)
}
