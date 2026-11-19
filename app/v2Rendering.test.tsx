import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const mocks = vi.hoisted(() => ({ launch: vi.fn(), auth: vi.fn(), school: vi.fn(), counts: vi.fn(), roster: vi.fn(), redirect: vi.fn(), notFound: vi.fn(), masked: vi.fn(), home: vi.fn() }))
vi.mock('@/lib/publicAccountLaunch', () => ({ getPublicAccountLaunchState: mocks.launch, recordPublicAccountActivity: vi.fn() }))
vi.mock('@/lib/user-auth', () => ({ getAuthenticatedServerContext: mocks.auth }))
vi.mock('@/lib/api/schools', () => ({ getSchoolBySlug: mocks.school }))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('@/lib/schoolRoster', () => ({ getSchoolRoster: mocks.roster }))
vi.mock('@/lib/part2Public', () => ({ getYearMaskedPreview: mocks.masked, getHomeAttendance: mocks.home }))
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
  mocks.masked.mockResolvedValue([{ masked_name: '김O수', tags: ['직장인'], note: '반가워!' }, { masked_name: '이O', tags: [], note: null }, { masked_name: '박O진', tags: [], note: null }])
  mocks.home.mockResolvedValue({ visible: false })
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
  it('Part 2 P1: hides the LIVE ticker and TOP 5 entirely when the DB says not visible', async () => {
    const html = renderToStaticMarkup(await Home())
    expect(html).not.toContain('LIVE')
    expect(html).not.toContain('TOP')
    expect(html).not.toContain('학교 찾기 화면으로 가기')
  })
  it('Part 2 P1: shows the LIVE ticker and TOP 5 with school, year and counts only', async () => {
    mocks.home.mockResolvedValue({ visible: true, recent_total: 6, ticker: [{ school_name: '서초고등학교', slug: 'fixture-high', graduation_year: 2005, count: 1 }], top: [{ school_name: '서초고등학교', slug: 'fixture-high', count: 7 }] })
    const html = renderToStaticMarkup(await Home())
    expect(html).toContain('최근 7일 출석 6명')
    expect(html).toContain('서초고 2005년 졸업 <b class="text-[#fbbf24]">1명</b> 출석')
    expect(html).toContain('출석부가 많이 열린 학교 TOP 1')
    expect(html).not.toMatch(/XP|Lv\.|레벨|점/)
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
    expect(html).toContain('7명</b>이 출석했어요.')
    expect(html).toContain('href="/school/fixture-high/2005"')
    // Part 2 P1: 졸업연도 칩이 먼저, 최신 연도부터.
    expect(html).toContain('내 졸업연도 고르기')
    expect(html.indexOf('2012년 <b')).toBeLessThan(html.indexOf('2005년 <b'))
    expect(html.indexOf('내 졸업연도 고르기')).toBeLessThan(html.indexOf('Google로 시작하고 출석부 보기'))
    expect(html).toContain('다른 졸업연도')
    expect(html).toContain('Google로 시작하고 출석부 보기')
    expect(html).toContain('인스타 주소는 서로 수락할 때만. 만 19세 이상.')
    expect(html).not.toMatch(/XP|Lv\.|레벨|학교 키우는 세 걸음/)
  })
  it('Part 2 P1: shows year selection first instead of the empty-state sentence when nobody registered', async () => {
    mocks.counts.mockResolvedValue({ status: 'ok', total: 0, years: [] })
    const html = renderToStaticMarkup(await hub())
    expect(html).not.toContain('아직 등록한 사람이 없어요')
    expect(html).toContain('졸업연도를 고르면 우리 학년 칠판이 열려요')
    expect(html).toContain('졸업연도 선택')
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
  it('Part 2 P1: shows the count and only DB-masked names (no full names, no Instagram)', async () => {
    const html = renderToStaticMarkup(await year('2005'))
    expect(html).toContain('2005년 졸업 · <span class="text-sl-brand">4명</span>')
    expect(mocks.masked).toHaveBeenCalledWith(fixture.id, 2005)
    expect(html).toContain('>김O수<')
    expect(html).toContain('(직장인 · &#x27;반가워!&#x27;)')
    expect(html).toContain('>이O<')
    expect(html).toContain('외 1명')
    expect(html).not.toMatch(/instagram|인스타그램주소|@/i)
    expect(html).not.toContain('칠판에 적기')
    expect(html).toContain('Google로 시작하고 출석부 보기')
  })
  it('Part 2 P1: shows the logged-out chalkboard for a year with 0 people and never asks for masked names', async () => {
    const html = renderToStaticMarkup(await year('1999'))
    expect(mocks.masked).not.toHaveBeenCalled()
    expect(html).toContain('우리 학년 1대 반장(첫 출석자) 자리가 비어 있어요!')
    expect(html).toContain('찾는 친구 초성(예: 김ㅇ수)과 한마디를 칠판에 먼저 적어두세요.')
    expect(html).toContain('칠판에 적기')
  })
  it('Part 2 P1: does not request masked names for signed-in visitors', async () => {
    signedIn(false)
    const html = renderToStaticMarkup(await year('2005'))
    expect(mocks.masked).not.toHaveBeenCalled()
    expect(html).not.toContain('칠판에 적기')
  })
  it('rejects malformed years', async () => {
    await expect(year('20x5')).rejects.toThrow('NOT_FOUND')
  })
})
