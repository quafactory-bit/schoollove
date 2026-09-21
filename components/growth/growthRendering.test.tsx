import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SchoolGrowth } from '@/lib/schoolGrowthGame'
const mocks = vi.hoisted(() => ({ growth: vi.fn(), launch: vi.fn(), auth: vi.fn(), beta: vi.fn(), school: vi.fn() }))
vi.mock('@/lib/schoolGrowthGame', () => ({ getSchoolGrowth: mocks.growth }))
vi.mock('@/lib/publicAccountLaunch', () => ({ getPublicAccountLaunchState: mocks.launch, recordPublicAccountActivity: vi.fn() }))
vi.mock('@/lib/user-auth', () => ({ getAuthenticatedServerContext: mocks.auth }))
vi.mock('@/lib/beta', () => ({ hasBetaFeatureAccess: mocks.beta }))
vi.mock('@/lib/api/schools', () => ({ getSchoolBySlug: mocks.school }))
vi.mock('@/lib/promotions', () => ({ getPublicPromotion: vi.fn().mockResolvedValue(null) }))
vi.mock('@/components/SearchBar', () => ({ default: () => <input aria-label="학교 이름 찾기" /> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), notFound: vi.fn() }))
vi.mock('@/components/growth/MyGrowthSchools', () => ({ default: () => null }))
import Home from '@/app/page'
import Hub from '@/app/school/[slug]/page'
import GrowthMeter from './GrowthMeter'

const school: SchoolGrowth = { schoolId: 'ee000001-0000-4000-8000-000000000001', schoolName: '매우 긴 이름을 가진 안전한 테스트 고등학교', slug: 'fixture', level: 1, progress: 0, totalXp: 0, rank: null, lastLevelUp: null }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.growth.mockResolvedValue({ status: 'ok', schools: [] })
  mocks.launch.mockResolvedValue({ state: 'open', emergencyStopped: false })
  mocks.auth.mockResolvedValue(null)
  mocks.beta.mockResolvedValue(false)
  mocks.school.mockResolvedValue({ id: school.schoolId, slug: 'fixture', school_name: school.schoolName, school_type: 'high', sido: '서울', sigungu: '양천구' })
})
describe('growth Home states', () => {
  it('renders honest empty state and preserves search/login/privacy', async () => {
    const html = renderToStaticMarkup(await Home())
    expect(html).toContain('아직 공개할 학교 순위가 없어요.')
    expect(html).toContain('내 학교의 최신 레벨과 XP는 내 계정에서 확인해요.')
    expect(html).toContain('href="/search"')
    expect(html).toContain('내 학교 찾기')
    expect(html).toContain('내 학교로 들어가기')
    expect(html).toContain('/privacy')
    expect(html).not.toContain('Lv.2 달성')
  })
  it.each([1, 5])('renders exactly %i real ranking rows, no people fields', async count => {
    // Unique privacy sentinel: 1000 is also the legitimate image intrinsic width.
    mocks.growth.mockResolvedValue({ status: 'ok', schools: Array.from({ length: count }, (_, i) => ({ ...school, schoolId: `${i}`, rank: i + 1, totalXp: 987654, level: 7 })) })
    const html = renderToStaticMarkup(await Home())
    const ranking = html.split('aria-labelledby="total-ranking"')[1].split('aria-labelledby="growth-how"')[0]
    expect((ranking.match(/<li\b/g) || []).length).toBe(count)
    expect(html).toContain('<ol')
    expect(html).toContain(school.schoolName)
    expect(html).not.toContain('weeklyXp')
    expect(html).toContain('987,654 XP')
    expect(html).toContain('총 학교 순위')
    expect(html).toContain('누적 경험치')
    expect(html.indexOf('총 학교 순위')).toBeLessThan(html.indexOf('ALL-TIME SCHOOL RANKING'))
  })
  it('only shows a milestone when an actual published event exists', async () => {
    mocks.growth.mockResolvedValue({ status: 'ok', schools: [{ ...school, level: 7, lastLevelUp: '2026-09-09T00:00:00Z' }] })
    expect(renderToStaticMarkup(await Home())).toContain('Lv.7 달성')
  })
  it('keeps the page usable when optional growth is unavailable', async () => {
    mocks.growth.mockResolvedValue({ status: 'unavailable', schools: [] })
    const html = renderToStaticMarkup(await Home())
    expect(html).toContain('학교 찾기는 계속 이용할 수 있어요.')
    expect(html).toContain('href="/search"')
    expect(html).toContain('내 학교 찾기')
  })
  it('shows today growth only from a real published level-up today', async () => {
    mocks.growth.mockResolvedValue({ status: 'ok', schools: [{ ...school, level: 7, lastLevelUp: new Date().toISOString() }] })
    expect(renderToStaticMarkup(await Home())).toContain('오늘 레벨이 오른 학교')
    mocks.growth.mockResolvedValue({ status: 'ok', schools: [school] })
    expect(renderToStaticMarkup(await Home())).not.toContain('오늘 레벨이 오른 학교')
  })
  it.each(['closed', 'emergency_stopped'])('does not offer signup when %s', async state => {
    mocks.launch.mockResolvedValue({ state })
    expect(renderToStaticMarkup(await Home())).not.toContain('내 학교로 들어가기')
  })
})
describe('School Hub capability and display states', () => {
  it.each([0, 85])('renders public level/progress %i accessibly', progress => {
    const html = renderToStaticMarkup(<GrowthMeter growth={{ ...school, progress }} />)
    expect(html).toContain(`aria-valuenow="${progress}"`)
    expect(html).toContain('aria-valuemax="100"')
    expect(html).toContain('motion-reduce:transition-none')
    if (progress === 85) expect(html).toContain('다음 레벨이 가까워졌어요.')
  })
  it('shows nonmember registration without people discovery', async () => {
    mocks.growth.mockResolvedValue({ status: 'ok', schools: [school] })
    const html = renderToStaticMarkup(await Hub({ params: Promise.resolve({ slug: 'fixture' }) }))
    expect(html).toContain('내 학교로 등록하고 키우기')
    expect(html).not.toContain('기억나는 사람 찾아보기')
  })
  it.each([false, true])('keeps beta permission separate from growth: %s', async access => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ id: 'owner-only-not-rendered' }] }) }
    mocks.auth.mockResolvedValue({ user: { id: 'secret-owner' }, client: { from: () => query } })
    mocks.beta.mockResolvedValue(access)
    mocks.growth.mockResolvedValue({ status: 'ok', schools: [{ ...school, level: 7, progress: 90 }] })
    const html = renderToStaticMarkup(await Hub({ params: Promise.resolve({ slug: 'fixture' }) }))
    expect(html).toContain('친구 불러서 학교 키우기')
    expect(html.includes('기억나는 사람 찾아보기')).toBe(access)
    expect(html).not.toContain('secret-owner')
    expect(html).not.toContain('owner-only-not-rendered')
  })
})
