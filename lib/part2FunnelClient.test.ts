import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
let storage:Map<string,string>
let send:ReturnType<typeof vi.fn>
beforeEach(()=>{
 vi.resetModules();storage=new Map();send=vi.fn().mockResolvedValue({status:204});vi.stubGlobal('fetch',send)
 vi.stubGlobal('window',{location:{href:'https://example.invalid/?ref=threads&name=discard'},sessionStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)}})
 vi.stubGlobal('document',{referrer:''})
})
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
describe('minimal same-tab measurement context',()=>{
 it('emits only fixed codes/public school ID, and sends landing once',async()=>{
  const {sendFunnelEvent,sendLandingOnce}=await import('./part2FunnelClient')
  sendLandingOnce();sendLandingOnce();sendFunnelEvent('school_result_selected','00000000-0000-4000-8000-000000000002')
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls.map(c=>JSON.parse(c[1].body))).toEqual([{event:'landing_view',source:'threads'},{event:'school_result_selected',source:'threads',schoolId:'00000000-0000-4000-8000-000000000002'}])
  const text=JSON.stringify([...storage.values()]);expect(text).not.toContain('discard');expect(text).not.toContain('example.invalid')
 })
 it('keeps the source for 30 minutes, then starts a new visit',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-11T00:00:00Z'))
  const {sendLandingOnce,sendFunnelEvent}=await import('./part2FunnelClient')
  sendLandingOnce();window.location.href='https://example.invalid/?ref=ig';sendFunnelEvent('home_viewed')
  expect(JSON.parse(send.mock.calls[1][1].body).source).toBe('threads')
  vi.advanceTimersByTime(30*60000);sendLandingOnce()
  expect(JSON.parse(send.mock.calls[2][1].body).source).toBe('instagram')
 })
 it('storage/network failure never throws or blocks the caller',async()=>{
  Object.defineProperty(window,'sessionStorage',{get(){throw new Error('blocked')}})
  send.mockRejectedValue(new Error('offline'))
  const {sendLandingOnce,sendFunnelEvent}=await import('./part2FunnelClient')
  expect(()=>{sendLandingOnce();sendFunnelEvent('home_viewed')}).not.toThrow()
  await Promise.resolve()
 })
 it('drops malformed school IDs and recovers from corrupt stored context',async()=>{
  storage.set('sl_p2_visit','{"source":"person","until":1}')
  const {sendFunnelEvent}=await import('./part2FunnelClient')
  sendFunnelEvent('school_result_selected','not-a-school-id');expect(send).not.toHaveBeenCalled()
  sendFunnelEvent('home_viewed');expect(JSON.parse(send.mock.calls[0][1].body).source).toBe('threads')
 })
})
