import { describe, expect, it } from 'vitest'
import manifest from './manifest'

describe('PWA manifest', () => {
  it('설치 경로와 세 가지 아이콘 목적을 고정한다', () => {
    const value = manifest()

    expect(value.id).toBe('/')
    expect(value.start_url).toBe('/?source=pwa')
    expect(value.scope).toBe('/')
    expect(value.display).toBe('standalone')
    expect(value.theme_color).toBe('#FFFFFF')
    expect(value.icons).toEqual([
      expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
    ])
  })
})
