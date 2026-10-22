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
})
