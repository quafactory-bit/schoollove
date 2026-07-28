import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const pages = [
  'app/people/search/page.tsx', 'app/connections/page.tsx', 'app/connections/requests/page.tsx',
  'app/connections/[id]/page.tsx', 'app/notifications/page.tsx', 'app/account/safety/page.tsx',
  'app/admin/safety/page.tsx',
]

describe('PHASE 10C private route SEO and auth boundaries', () => {
  it.each(pages)('%s는 noindex/nofollow/nocache다', (path) => {
    const source = readFileSync(join(process.cwd(), path), 'utf8')
    expect(source).toContain('robots: { index: false, follow: false, nocache: true }')
  })

  it.each(pages.filter((path) => !path.includes('/admin/')))('%s는 서버 인증 없이 렌더링하지 않는다', (path) => {
    const source = readFileSync(join(process.cwd(), path), 'utf8')
    expect(source).toContain('getAuthenticatedServerContext()')
    expect(source).toContain("redirect('/login')")
  })

  it('sitemap은 개인 연결 경로를 생성하지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'app/sitemap.ts'), 'utf8')
    expect(source).not.toMatch(/people|connections|notifications|account\/safety|admin\/safety/)
  })
})
