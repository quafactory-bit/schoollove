import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimSchoolIntent, clearSchoolIntent, parseSchoolIntent, readSchoolIntent, recallSchoolQuery, rememberSchoolQuery, saveSchoolIntent, SCHOOL_INTENT_KEY, SCHOOL_INTENT_TTL, validSchoolSlug } from './schoolJourney'
afterEach(() => { clearSchoolIntent(); vi.unstubAllGlobals() })
function storage() { const values = new Map<string,string>(); vi.stubGlobal('sessionStorage', { getItem: (k:string) => values.get(k) ?? null, setItem: (k:string,v:string) => values.set(k,v), removeItem:(k:string) => values.delete(k) }); return values }
describe('public school hint: never registration authority', () => {
  it.each(['../private','https://evil.test','a?owner=1','a#token','a/b','', 'a'.repeat(201)])('rejects unsafe slug %s', v => expect(validSchoolSlug(v)).toBe(false))
  it('allows exactly slug/expiry and a bounded TTL', () => {
    const base={slug:'example-school',expiresAt:1000+SCHOOL_INTENT_TTL}
    expect(parseSchoolIntent(JSON.stringify(base),1000)).toEqual(base)
    expect(parseSchoolIntent(JSON.stringify({...base,owner:'x'}),1000)).toBeNull()
    expect(parseSchoolIntent(JSON.stringify({...base,expiresAt:1000}),1000)).toBeNull()
    expect(parseSchoolIntent(JSON.stringify({...base,expiresAt:1001+SCHOOL_INTENT_TTL}),1000)).toBeNull()
    expect(parseSchoolIntent('broken',1000)).toBeNull()
  })
  it('survives same-tab return but consumes storage on auth arrival; switching clears', () => {
    const values=storage();expect(saveSchoolIntent('example-school')).toBe(true)
    expect(Object.keys(JSON.parse(values.get(SCHOOL_INTENT_KEY)!)).sort()).toEqual(['expiresAt','slug'])
    expect(readSchoolIntent()?.slug).toBe('example-school')
    expect(claimSchoolIntent('a')?.slug).toBe('example-school');expect(values.has(SCHOOL_INTENT_KEY)).toBe(false)
    expect(claimSchoolIntent('b')).toBeNull();expect(readSchoolIntent()).toBeNull()
  })
  it('does not throw when storage is blocked and preserves public search in memory', () => {
    vi.stubGlobal('sessionStorage',{setItem(){throw Error('blocked')},getItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}})
    expect(saveSchoolIntent('example-school')).toBe(false);expect(readSchoolIntent()).toBeNull()
    rememberSchoolQuery('예시학교');expect(recallSchoolQuery()).toBe('예시학교')
  })
})
