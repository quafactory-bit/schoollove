import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadConnectionFeed } from './connectionFeed'
import { BetaAdminActionSchema } from '@/lib/policy/betaOperations'

afterEach(() => vi.unstubAllGlobals())
describe('public launch connection failure states', () => {
  it('distinguishes a successful empty feed from a failed request', async () => {
    const fetch = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetch)
    expect(await loadConnectionFeed()).toEqual({ received: [], sent: [], connections: [], notifications: [] })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it.each([401, 403, 429, 500])('does not present HTTP %s as an empty feed', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('notifications') ? Response.json({ error: 'SAFE_ERROR' }, { status }) : Response.json({})))
    await expect(loadConnectionFeed()).rejects.toThrow('CONNECTION_LOAD_FAILED')
  })
  it('surfaces transport and JSON failure without inventing empty data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(loadConnectionFeed()).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not JSON')))
    await expect(loadConnectionFeed()).rejects.toThrow()
  })
  it('only renders feed after a successful load, and names connections rather than disabled messages', () => {
    const source=readFileSync('app/connections/ConnectionsClient.tsx','utf8')
    expect(source).toContain("loadState === 'loaded'")
    expect(source).toContain("setLoadState('error')")
    expect(source).toContain('다시 불러오기')
    expect(source).not.toContain('수락하고 답장')
    expect(source).not.toContain('대화 열기')
    expect(source).toContain('peopleSearchEnabled ?')
  })
})
describe('operational cap schema', () => {
  const action={action:'set_operational_cap',programId:'10000000-0000-4000-8000-000000000001',reason:'OPERATOR_APPROVED_CAP'}
  it.each([1,3,5,10,20])('accepts explicit integer cap %s', maxUsers => {
    expect(BetaAdminActionSchema.safeParse({...action,maxUsers}).success).toBe(true)
  })
  it.each([0,21,1.5,null,'5'])('rejects invalid cap %s', maxUsers => {
    expect(BetaAdminActionSchema.safeParse({...action,maxUsers}).success).toBe(false)
  })
})
