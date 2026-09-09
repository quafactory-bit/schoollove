import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { calculateLevelState } from './policy/levelPolicy'
import { getOwnSchoolGrowth } from './ownerSchoolGrowth'

const mocks = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock('@/lib/user-auth', () => ({ getAuthenticatedRequestContext: mocks.auth }))
import { GET } from '@/app/api/account/growth/route'
const schoolId = 'ee000001-0000-4000-8000-000000000001'
const read = vi.fn()
const rpc = vi.fn(() => ({ abortSignal: read }))
const client = { rpc } as unknown as SupabaseClient
const base = {schoolId,schoolName:'Fixture',slug:'fixture',level:1,progress:0,nearLevelUp:false,lastLevelUp:null,ownContributionXp:0}
const request = (id=schoolId) => new NextRequest(`https://www.schoollove.kr/api/account/growth?school=${id}`)
beforeEach(() => { vi.clearAllMocks(); read.mockResolvedValue({error:null,data:base}); mocks.auth.mockResolvedValue({client}) })

describe('private growth snapshot', () => {
  it.each([0,100,150])('returns own %i XP with the existing level curve', async xp => {
    const state = calculateLevelState(xp)
    const progress = Math.floor(100 * state.xpIntoLevel / state.xpForNextLevel)
    const value = {...base,ownContributionXp:xp,level:state.level,progress,nearLevelUp:progress>=80}
    read.mockResolvedValue({error:null,data:value})
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(await response.json()).toEqual({contribution:{contributed:xp>0,xp},growth:value})
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_own_school_growth_live',{requested_school_id:schoolId})
  })
  it('denies anonymous requests before database access', async () => {
    mocks.auth.mockResolvedValue(null)
    expect((await GET(request())).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects invalid school input before database access', async () => {
    expect((await GET(request('not-uuid'))).status).toBe(400)
    expect(await getOwnSchoolGrowth(client,'bad')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([null,{...base,schoolId:'ee000001-0000-4000-8000-000000000002'},{...base,progress:101},{...base,ownContributionXp:200},{...base,nearLevelUp:true}])('fails closed on nonmember/cross-school/malformed snapshots', async data => {
    read.mockResolvedValue({error:null,data})
    const response=await GET(request())
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).not.toContain('Fixture')
  })
  it('strips fields outside the narrow allowlist', async () => {
    read.mockResolvedValue({error:null,data:{...base,email:'PRIVATE',memberCount:1,userId:'PRIVATE',graduationYear:2010,instagram:'PRIVATE',referrer:'PRIVATE',xp:150}})
    expect(await getOwnSchoolGrowth(client,schoolId)).toEqual(base)
  })
  it.each(['error','throw'])('does not leak errors or return a public fallback: %s', async kind => {
    if(kind==='throw') read.mockRejectedValue(new Error('PRIVATE'))
    else read.mockResolvedValue({error:{message:'PRIVATE'},data:base})
    const response=await GET(request())
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('PRIVATE')
  })
  it('preserves exact applied migration46 and anonymous authority', () => {
    const sql=readFileSync('supabase/migrations/20260909013012_school_growth_game_loop.sql','utf8').replace(/\r\n/g,'\n')
    expect(createHash('sha256').update(sql).digest('hex')).toBe('0963e46d9293e3335ebe6beb66be8d9a9e7e62ec8924659b5a0e7e307bfca359')
    for(const path of ['app/page.tsx','app/school/[slug]/page.tsx','lib/schoolGrowthGame.ts']) {
      expect(readFileSync(path,'utf8')).not.toContain('getOwnSchoolGrowth')
    }
  })
  it('the additive RPC has explicit ownership/privileges and no writes or batching changes', () => {
    const sql=readFileSync('supabase/migrations/20260909041329_owner_live_school_growth_projection.sql','utf8')
    expect(sql).toContain("STABLE SECURITY DEFINER SET search_path=''")
    expect(sql).toContain('auth.uid() IS NOT NULL')
    expect(sql).toContain('m.owner_user_id=auth.uid() AND m.school_id=s.id')
    expect(sql).toContain('FROM PUBLIC,anon,service_role')
    expect(sql).toContain('TO authenticated')
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER TABLE|CREATE TABLE)\b/)
    expect(sql).not.toContain('school_growth_batches')
  })
})
