import { describe, expect, it } from 'vitest'
import { LEGACY_SITE_HOSTS, legacyDomainRedirects } from '../next.config'

describe('v2-10 legacy domain redirect (prepared, off until NEXT_PUBLIC_SITE_DOMAIN is set)', () => {
  it('does nothing without a valid new domain', () => {
    expect(legacyDomainRedirects('')).toEqual([])
    expect(legacyDomainRedirects('not a domain')).toEqual([])
    expect(legacyDomainRedirects('schoollove.kr')).toEqual([])
  })

  it('301s both legacy hosts to the same path on the new domain, leaving preview.schoollove.kr alone', () => {
    const rules = legacyDomainRedirects('chulseokbu.kr')
    expect(LEGACY_SITE_HOSTS).toEqual(['schoollove.kr', 'www.schoollove.kr'])
    expect(rules).toEqual(LEGACY_SITE_HOSTS.map(host => ({
      source: '/:path*', has: [{ type: 'host', value: host }], destination: 'https://chulseokbu.kr/:path*', permanent: true,
    })))
    expect(JSON.stringify(rules)).not.toContain('preview.schoollove.kr')
  })

  it.each(['/', '/school/seoul-high', '/school/seoul-high/2005', '/account', '/privacy'])('keeps the path: %s', path => {
    const rule = legacyDomainRedirects('chulseokbu.kr')[0]
    expect(rule.destination.replace('/:path*', path === '/' ? '' : path)).toBe(`https://chulseokbu.kr${path === '/' ? '' : path}`)
  })
})
