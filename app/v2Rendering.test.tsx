import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const mocks = vi.hoisted(() => ({ launch: vi.fn(), auth: vi.fn(), school: vi.fn(), counts: vi.fn(), roster: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/publicAccountLaunch', () => ({ getPublicAccountLaunchState: mocks.launch, recordPublicAccountActivity: vi.fn() }))
vi.mock('@/lib/user-auth', () => ({ getAuthenticatedServerContext: mocks.auth }))
vi.mock('@/lib/api/schools', () => ({ getSchoolBySlug: mocks.school }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('@/lib/schoolRoster', () => ({ getSchoolRoster: mocks.roster }))
vi.mock('@/lib/schoolYearCounts', async () => ({ ...(await vi.importActual<object>('@/lib/schoolYearCounts')), getSchoolYearCounts: mocks.counts }))
vi.mock('@/components/SearchBar', () => ({ default: () => <input aria-label="학교 이름 찾기" /> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), redirect: mocks.redirect, notFound: mocks.notFound }))
import Home from '@/app/page'
import Hub from '@/app/school/[slug]/page'
import YearPage from '@/app/school/[slug]/[year]/page'

const fixture = { id: 'ee000001-0000-4000-8000-000000000001', slug: 'fixture-high', school_name: '서초고등학교', school_type: 'high', sido: '서울', sigungu: '서초구' }
const hub = () => Hub({ params: Promise.resolve({ slug: 'fixture-high' }) })
const year = (value: string) => YearPage({ params: Promise.resolve({ slug: 'fixture-high', year: value }) })
function signedIn(member: boolean) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: member ? [{ id: 'owner-only-membership' }] : [] }) }
  mocks.auth.mockResolvedValue({ user: { id: 'secret-owner' }, client: { from: () => query } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.launch.mockResolvedValue({ state: 'open', emergencyStopped: false })
  mocks.auth.mockResolvedValue(null)
  mocks.school.mockResolvedValue(fixture)
  mocks.counts.mockResolvedValue({ status: 'ok', total: 7, years: [{ graduationYear: 2012, count: 1 }, { graduationYear: 2009, count: 2 }, { graduationYear: 2005, count: 4 }] })
  mocks.roster.mockResolvedValue({ status: 'ok', entries: [] })
  mocks.redirect.mockImplementation((href: string) => { throw new Error(`REDIRECT:${href}`) })
  mocks.notFound.mockImplementation(() => { throw new Error('NOT_FOUND') })
})

describe('v2 logged-out home', () => {
  it('shows the v2 copy, search, how-it-works strip and policy links without game/ranking UI', async () => {
    const html = renderToStaticMarkup(await Home())
    expect(html).toContain('그때 그 친구, 지금 뭐 하는지 궁금하지 않아요?')
    expect(html).toContain('학교와 졸업연도로 같은 기수 출석부를 보고, 서로 수락하면 인스타그램 주소를 교환해요.')
    expect(html).toContain('학교 이름 찾기')
    expect(html).toContain('인스타')
    expect(html).toContain('href="/privacy"')
    expect(html).not.toMatch(/총 학교 순위|XP|Lv\.|레벨/)
  })
  it('sends a signed-in visitor to /account', async () => {
    signedIn(false)
    await expect(Home()).rejects.toThrow('REDIRECT:/account')
  })
  it.each(['closed', 'emergency_stopped'])('does not offer account entry when %s', async state => {
    mocks.launch.mockResolvedValue({ state })
    expect(renderToStaticMarkup(await Home())).not.toContain('내 학교로 들어가기')
  })
})

describe('v2 school page — per-year counts', () => {
  it('shows school header, total, year rows with links and the logged-out Google CTA', async () => {
    const html = renderToStaticMarkup(await hub())
    expect(html).toContain('서울</span> 서초구 · 고등학교')
    expect(html).toContain('서초고등학교')
    expect(html).toContain('7명</b>이 등록했어요.')
    expect(html).toContain('href="/school/fixture-high/2005"')
    expect(html.indexOf('2012년 졸업')).toBeLessThan(html.indexOf('2005년 졸업'))
    expect(html).toContain('그 외 연도')
    expect(html).toContain('Google로 시작하고 출석부 보기')
    expect(html).toContain('인스타 주소는 서로 수락할 때만. 만 19세 이상.')
    expect(html).not.toMatch(/XP|Lv\.|레벨|학교 키우는 세 걸음/)
  })
  it('shows the honest empty state when nobody registered', async () => {
    mocks.counts.mockResolvedValue({ status: 'ok', total: 0, years: [] })
    const html = renderToStaticMarkup(await hub())
    expect(html).toContain('아직 등록한 사람이 없어요. 첫 번째가 되어 주세요.')
    expect(html).toContain('아직 없음')
  })
  it('switches the CTA for signed-in non-members and members without leaking owner data', async () => {
    signedIn(false)
    expect(renderToStaticMarkup(await hub())).toContain('이 학교 등록하기')
    signedIn(true)
    const html = renderToStaticMarkup(await hub())
    expect(html).toContain('내 출석부 보기')
    expect(html).not.toContain('secret-owner')
    expect(html).not.toContain('owner-only-membership')
  })
  it('does not start new accounts while the public launch is closed', async () => {
    mocks.launch.mockResolvedValue({ state: 'closed' })
    const html = renderToStaticMarkup(await hub())
    expect(html).toContain('신규 계정 시작은 현재 준비 중입니다.')
    expect(html).not.toContain('Google로 시작하고 출석부 보기')
  })
})

describe('v2 year page — logged out', () => {
  it('shows count and nameless placeholders only', async () => {
    const html = renderToStaticMarkup(await year('2005'))
    expect(html).toContain('2005년 졸업 · <span class="text-sl-brand">4명</span>')
    expect((html.match(/>\?</g) || []).length).toBe(4)
    expect(html).toContain('Google로 시작하고 출석부 보기')
  })
  it('rejects malformed years', async () => {
    await expect(year('20x5')).rejects.toThrow('NOT_FOUND')
  })
})
