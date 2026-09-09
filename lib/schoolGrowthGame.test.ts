import { describe, expect, it, vi } from 'vitest'
import { calculateLevelState, threshold } from '@/lib/policy/levelPolicy'
import { buildGrowthShareUrl, isSameOriginGrowthRequest } from '@/lib/growthReferral'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/user-auth', () => ({ createPublicAuthClient: () => ({ rpc: (...args: unknown[]) => ({ abortSignal: () => rpc(...args) }) }) }))
import { getSchoolGrowth } from './schoolGrowthGame'

describe('school growth authority', () => {
  it.each([[1,1],[2,2],[3,3],[5,4],[10,7]])('%i first memberships use the existing level curve', (people,level) => {
    expect(calculateLevelState(people*100).level).toBe(level)
    expect(threshold(level)).toBeLessThanOrEqual(people*100)
  })
  it('distinguishes actual empty ranking from unavailable data', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await getSchoolGrowth()).toEqual({ status: 'ok', schools: [] })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'internal' } })
    expect(await getSchoolGrowth()).toEqual({ status: 'unavailable', schools: [] })
  })
  it('strips unexpected private fields at the server output boundary', async () => {
    rpc.mockResolvedValueOnce({ error: null, data: [{ schoolId:'ee000001-0000-4000-8000-000000000001',schoolName:'Fixture',slug:'fixture',level:1,progress:0,weeklyXp:0,rank:null,lastLevelUp:null,email:'PRIVATE',user_id:'PRIVATE' }] })
    const result = await getSchoolGrowth()
    expect(result.status).toBe('ok')
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })
  it('does not emit referral tokens in the HTTP path or query', () => {
    const token = 'a'.repeat(64)
    const url = new URL(buildGrowthShareUrl('https://www.schoollove.kr','school name',token))
    expect(url.search).toBe('')
    expect(url.pathname).not.toContain(token)
    expect(url.hash).toBe(`#grow=${token}`)
  })
  it('rejects missing and cross-origin mutation origins', () => {
    expect(isSameOriginGrowthRequest(new Request('https://www.schoollove.kr/api/growth/visit'))).toBe(false)
    expect(isSameOriginGrowthRequest(new Request('https://www.schoollove.kr/api/growth/visit',{headers:{origin:'https://evil.invalid'}}))).toBe(false)
    expect(isSameOriginGrowthRequest(new Request('https://www.schoollove.kr/api/growth/visit',{headers:{origin:'https://www.schoollove.kr'}}))).toBe(true)
  })
  it('new Home and Hub never call legacy ranking/growth helpers', () => {
    for (const file of ['app/page.tsx','app/school/[slug]/page.tsx','lib/schoolGrowthGame.ts']) {
      const source=readFileSync(resolve(file),'utf8')
      for(const legacy of ['getSchoolGrowthSnapshot','getWeeklySchoolGrowthRanking','getPopularSchools','school_growth_ranking_v1']) expect(source).not.toContain(legacy)
    }
  })
})
