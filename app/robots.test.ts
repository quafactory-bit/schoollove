import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from './robots'
import config from '../next.config'

afterEach(() => vi.unstubAllEnvs())
describe('Preview-only search blocking', () => {
  it('blocks every Preview path and omits sitemap', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(robots()).toEqual({rules:{userAgent:'*',disallow:'/'}})
    expect(await config.headers!()).toContainEqual({source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'}]})
  })
  it.each(['production','development',''])('preserves public SEO for %s', async environment => {
    vi.stubEnv('VERCEL_ENV',environment)
    expect(robots().rules).toEqual([{userAgent:'*',allow:'/',disallow:['/admin','/admin/']}])
    expect(robots().sitemap).toBeTruthy()
    expect(await config.headers!()).not.toContainEqual(expect.objectContaining({source:'/:path*'}))
    expect(await config.headers!()).toContainEqual(expect.objectContaining({source:'/sw.js'}))
  })
})
