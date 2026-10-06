import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8')

describe('PWA service worker boundary', () => {
  it('같은 도메인의 페이지 이동만 가로채고 오프라인 문서만 캐시한다', () => {
    expect(source).toContain("request.mode !== 'navigate'")
    expect(source).toContain('requestUrl.origin !== self.location.origin')
    expect(source).toContain("const OFFLINE_URL = '/offline.html'")
    expect(source).not.toContain('Content-Security-Policy')
    expect(source).not.toMatch(/cache\.put|caches\.match\(request/)
  })

  it('개인정보 없는 푸시를 표시하고 같은 origin 창만 재사용한다', () => {
    expect(source).toContain("CACHE_VERSION = `${CACHE_PREFIX}v2`")
    expect(source).toContain("self.addEventListener('push'")
    expect(source).toContain("icon: '/icons/icon-192.png'")
    expect(source).toContain("self.addEventListener('notificationclick'")
    expect(source).toContain("candidate.origin === self.location.origin")
    expect(source).toContain("clients.matchAll({ type: 'window', includeUncontrolled: true })")
    expect(source).toContain('await existing.navigate(targetUrl)')
    expect(source).toContain('await clients.openWindow(targetUrl)')
  })
})
