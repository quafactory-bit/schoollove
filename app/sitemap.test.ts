import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { getAllSchoolSlugsMock } = vi.hoisted(() => ({ getAllSchoolSlugsMock: vi.fn() }))

vi.mock('@/lib/api/schools', () => ({ getAllSchoolSlugs: getAllSchoolSlugsMock }))

afterEach(() => {
  vi.clearAllMocks()
})

describe('PHASE 10A safe sitemap', () => {
  it('홈과 개인 데이터가 없는 학교 기본 URL만 포함하고 중복·빈 slug를 제거한다', async () => {
    getAllSchoolSlugsMock.mockResolvedValue(['safe-high', '', 'safe-high', 'safe-university'])
    const sitemap = (await import('./sitemap')).default
    const result = await sitemap()

    expect(result[0]?.url).toBe('https://www.schoollove.kr')
    expect(result.filter((entry) => entry.url.includes('/school/'))).toHaveLength(2)
    expect(result.some((entry) => entry.url.endsWith('/school/safe-high'))).toBe(true)
    expect(result.some((entry) => entry.url.endsWith('/school/safe-university'))).toBe(true)
  })

  it('year/class/search/submit/invite/admin 같은 민감 URL을 포함하지 않는다', async () => {
    getAllSchoolSlugsMock.mockResolvedValue(['safe-high'])
    const sitemap = (await import('./sitemap')).default
    const urls = (await sitemap()).map((entry) => entry.url)

    for (const url of urls) {
      expect(url).not.toMatch(/\/school\/[^/]+\/\d+/)
      expect(url).not.toMatch(/\/(?:search|submit|invite|admin)(?:\/|$)/)
    }
  })

  it('profiles 테이블이나 개인 필드를 조회하지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'app/sitemap.ts'), 'utf8')
    expect(source).not.toMatch(/from\(['"]profiles['"]\)|graduation_year|class_number|nickname|instagram_id/)
    expect(source).toContain('getAllSchoolSlugs()')
  })

  it('DB helper 오류 시 내부 오류를 노출하지 않고 Home만 반환한다', async () => {
    getAllSchoolSlugsMock.mockRejectedValue(new Error('private-database-detail'))
    const sitemap = (await import('./sitemap')).default
    const result = await sitemap()

    expect(result).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('private-database-detail')
  })

  it('동일 프로세스의 연속 호출마다 최신 학교 slug 목록을 사용한다', async () => {
    getAllSchoolSlugsMock
      .mockResolvedValueOnce(['first-school'])
      .mockResolvedValueOnce(['second-school'])
    const sitemap = (await import('./sitemap')).default

    expect((await sitemap()).some((entry) => entry.url.endsWith('/school/first-school'))).toBe(true)
    const second = await sitemap()
    expect(second.some((entry) => entry.url.endsWith('/school/first-school'))).toBe(false)
    expect(second.some((entry) => entry.url.endsWith('/school/second-school'))).toBe(true)
  })

  it("route segment가 dynamic='force-dynamic'으로 고정돼 빌드 결과를 캐시하지 않는다", () => {
    const source = readFileSync(join(process.cwd(), 'app/sitemap.ts'), 'utf8')
    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })
})
