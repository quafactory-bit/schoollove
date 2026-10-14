import { describe, expect, it, vi } from 'vitest'
import { analyticsUrl, captureFirstTouch, FIRST_TOUCH_TTL, newFirstTouch, parseFirstTouch, referrerSource, serverAttribution, validAttributionValue } from './signupAttribution'

const now = 1_800_000_000_000
const href = 'https://www.schoollove.kr/?utm_source=threads&utm_medium=post_body&utm_campaign=devlog&utm_content=1020-08'
describe('anonymous signup attribution', () => {
  it.each(['threads', 'post_body', '1020-08'])('accepts %s', value => expect(validAttributionValue(value)).toBe(true))
  it.each(['', '한글', 'a b', 'A', 'a'.repeat(41), 'name@email.com'])('rejects %s', value => expect(validAttributionValue(value)).toBe(false))
  it.each([
    ['https://threads.net/a?private=1', 'threads'], ['https://www.threads.com/a', 'threads'],
    ['https://l.instagram.com/', 'instagram'], ['https://instagram.com/', 'instagram'],
    ['https://www.google.com/search?q=name', 'search'], ['https://search.naver.com/', 'search'],
    ['https://search.daum.net/', 'search'], ['https://www.schoollove.kr/account', 'direct'],
    ['', 'direct'], ['https://instagram.com.evil.test/', 'other'], ['garbage', 'other'],
    ['https://schoollove.kr/account', 'direct'],
  ])('classifies domain %s', (referrer, source) => expect(referrerSource(referrer, 'https://www.schoollove.kr')).toBe(source))
  it('retains only allowed codes without any landing path', () => {
    const row = newFirstTouch(href + '&email=private#token', '', now)
    expect(row).toEqual({source:'threads',medium:'post_body',campaign:'devlog',content:'1020-08',ts:now})
    expect(newFirstTouch('https://www.schoollove.kr/school/name/2000/1?q=name', '', now)).not.toHaveProperty('landing_path')
    expect(newFirstTouch('https://www.schoollove.kr/auth/token', '', now)).not.toHaveProperty('landing_path')
    expect(newFirstTouch('https://www.schoollove.kr/', 'https://instagram.com', now).medium).toBe('referral')
  })
  it('validates server payload, expiry, future time and extra private fields', () => {
    const row = newFirstTouch(href, '', now)
    expect(parseFirstTouch(row, now + FIRST_TOUCH_TTL - 1)).not.toBeNull()
    for (const input of [null, {...row,ts:now+1}, {...row,source:'한글'}, {...row,email:'private'}, {...row,content:42}]) {
      expect(serverAttribution(input, now).source).toBe('unknown')
    }
    expect(serverAttribution(row,now+FIRST_TOUCH_TTL).source).toBe('unknown')
    expect(Object.keys(serverAttribution(row,now))).toEqual(['source','medium','campaign','content'])
  })
  it('preserves first touch for seven days and replaces expired/corrupt storage', () => {
    let value: string | null = null
    const storage = {getItem:()=>value,setItem:(_key:string,next:string)=>{value=next}} as unknown as Storage
    captureFirstTouch(storage,href,'',now)
    captureFirstTouch(storage,'https://www.schoollove.kr/?utm_source=instagram','',now+1)
    expect(JSON.parse(value!).source).toBe('threads')
    captureFirstTouch(storage,'https://www.schoollove.kr/?utm_source=instagram','',now+FIRST_TOUCH_TTL)
    expect(JSON.parse(value!).source).toBe('instagram')
    value='broken'; captureFirstTouch(storage,href,'',now)
    expect(JSON.parse(value!).source).toBe('threads')
    expect(()=>captureFirstTouch({getItem:vi.fn(()=>{throw Error('blocked')})} as unknown as Storage,href,'',now)).not.toThrow()
  })
  it('discards old stored paths while preserving original codes and timestamp', () => {
    const row = newFirstTouch(href, '', now)
    let value = JSON.stringify({...row, landing_path:'/school/[redacted]'})
    const storage = {getItem:()=>value,setItem:(_key:string,next:string)=>{value=next}} as unknown as Storage
    captureFirstTouch(storage,'https://www.schoollove.kr/?utm_source=instagram','',now+1)
    expect(JSON.parse(value)).toEqual(row)
    expect(serverAttribution({...row,landing_path:'/private-name'},now)).toEqual({
      source:'threads',medium:'post_body',campaign:'devlog',content:'1020-08',
    })
  })
  it('analytics only sends four valid UTM keys and preserves blocked routes', () => {
    const url = new URL(analyticsUrl(href+'&email=private&code=secret#token')!)
    expect([...url.searchParams.keys()]).toEqual(['utm_source','utm_medium','utm_campaign','utm_content'])
    expect(url.hash).toBe('')
    expect(analyticsUrl('https://www.schoollove.kr/?utm_source=한글&utm_content='+ 'a'.repeat(41))).toBe('https://www.schoollove.kr/')
    expect(analyticsUrl(href+'&utm_source=instagram')).not.toContain('utm_source=')
    expect(analyticsUrl('https://www.schoollove.kr/auth/callback?utm_source=threads')).toBeNull()
    expect(analyticsUrl('https://www.schoollove.kr/api/growth/test?utm_source=threads')).toBeNull()
  })
})
