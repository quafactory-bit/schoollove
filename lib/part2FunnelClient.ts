'use client'
import { FUNNEL_TTL_SECONDS, UUID_PATTERN, incomingFunnelSource, type FunnelSource } from './part2Funnel'
import type { CLIENT_FUNNEL_EVENTS } from './part2Funnel'
type ClientEvent = (typeof CLIENT_FUNNEL_EVENTS)[number]
const KEY = 'sl_p2_visit'
type Context = {source:FunnelSource;until:number;landed:boolean}
let memory: Context | null = null
function context(): Context {
  const now = Date.now()
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) || 'null')
    if (raw && Object.keys(raw).sort().join(',') === 'landed,source,until' && ['direct','instagram','threads','share','other'].includes(raw.source) && Number.isSafeInteger(raw.until) && raw.until > now && raw.until <= now+FUNNEL_TTL_SECONDS*1000 && typeof raw.landed === 'boolean') memory = raw
  } catch { /* Optional storage. */ }
  if (!memory || memory.until <= now) memory = {source:incomingFunnelSource(window.location.href,document.referrer),until:now+FUNNEL_TTL_SECONDS*1000,landed:false}
  return memory
}
function save(value: Context) {
  memory = value
  try { window.sessionStorage.setItem(KEY,JSON.stringify(value)) } catch { /* Same-tab memory fallback. */ }
}
export function sendFunnelEvent(event: ClientEvent, schoolId?: string): void {
  try {
    if (typeof window === 'undefined' || (schoolId && !UUID_PATTERN.test(schoolId))) return
    const current = context(); save(current)
    // Exactly this payload: no text input, URL, graduation year, UA or identity.
    void fetch('/api/metrics/funnel',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({event,source:current.source,...(schoolId?{schoolId}: {})})}).catch(()=>undefined)
  } catch { /* Measurement must never block navigation or sharing. */ }
}
export function sendLandingOnce(): void {
  try {
    const current = context()
    if (current.landed) return
    save({...current,landed:true})
    sendFunnelEvent('landing_view')
  } catch { /* Optional measurement. */ }
}
