import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from './manifest'

describe('PWA manifest', () => {
  it('설치 경로와 세 가지 아이콘 목적을 고정한다 (v2-08: 출석부로 바로 열림, 초록 아이콘)', () => {
    const value = manifest()

    expect(value.id).toBe('/')
    expect(value.start_url).toBe('/account')
    expect(value.scope).toBe('/')
    expect(value.display).toBe('standalone')
    expect(value.theme_color).toBe('#0f7b5f')
    expect(value.background_color).toBe('#ffffff')
    expect(Array.from(value.short_name ?? '')).toHaveLength(3)
    expect(value.icons).toEqual([
      expect.objectContaining({ src: '/icons/icon-v2-192.png', sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ src: '/icons/icon-v2-512.png', sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ src: '/icons/icon-v2-maskable-512.png', sizes: '512x512', purpose: 'maskable' }),
    ])
  })

  it('기존 아이콘 파일은 덮어쓰지 않고 v2 파일을 새 이름으로 둔다', () => {
    for (const file of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'icon-v2.svg', 'icon-v2-192.png', 'icon-v2-512.png', 'icon-v2-maskable-512.png', 'apple-touch-icon-v2.png']) {
      expect(existsSync(join(process.cwd(), 'public/icons', file))).toBe(true)
    }
  })
})
