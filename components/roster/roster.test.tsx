import React from 'react'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
import NewMembersStrip from '@/components/NewMembersStrip'
import RosterRowButton from './RosterRowButton'

const member = (name: string) => ({ display_name: name, graduation_year: 2005, class_history: [] })

describe('v2-06 new members strip', () => {
  it('0명이면 띠 대신 친구 부르기 버튼만', () => {
    const html = renderToStaticMarkup(<NewMembersStrip members={[]} year={2005} />)
    expect(html).toContain('친구 부르기 — 2005년 링크 복사')
    expect(html).not.toContain('새로 들어온 동문')
  })
  it('1명이면 띠와 아바타 1개', () => {
    const html = renderToStaticMarkup(<NewMembersStrip members={[member('최유진')]} year={2005} />)
    expect(html).toContain('이번 주 새로 들어온 동문 1명')
    expect((html.match(/<li/g) || []).length).toBe(1)
    expect(html).toContain('전체 보기 ›')
  })
  it('6명이면 수는 6, 아바타는 최대 5개', () => {
    const html = renderToStaticMarkup(<NewMembersStrip members={Array.from({ length: 6 }, (_, index) => member(`동문${index}`))} year={2005} />)
    expect(html).toContain('이번 주 새로 들어온 동문 6명')
    expect((html.match(/<li/g) || []).length).toBe(5)
  })
})

describe('v2-06 row button 4 states', () => {
  it.each([
    ['request', '인스타 요청', 'btn-pill'],
    ['sent', '요청 보냄', 'btn-pill-muted'],
    ['accept', '수락하기', 'btn-pill-dark'],
    ['me', '숨기기', 'text-sl-ink3'],
  ] as const)('%s', (action, label, style) => {
    const html = renderToStaticMarkup(<RosterRowButton action={action} />)
    expect(html).toContain(label)
    expect(html).toContain(style)
  })
  it('수락하기는 알림 탭으로 보낸다(수락은 기존 요청 처리 화면에서)', () => {
    expect(renderToStaticMarkup(<RosterRowButton action="accept" />)).toContain('href="/notifications"')
  })
})

describe('v2-06 roster rules stay enforced by existing DB functions (no schema change)', () => {
  const roster = readFileSync('supabase/migrations/20260928090000_school_roster_and_direct_discovery.sql', 'utf8')
  const view = readFileSync('components/roster/RosterView.tsx', 'utf8')
  it('숨긴 사람·같은 학교가 아닌 사람은 명단을 못 본다', () => {
    const fn = roster.slice(roster.indexOf('FUNCTION public.get_school_member_roster'))
    expect(fn).toContain("THEN RAISE EXCEPTION 'SCHOOL_ROSTER_ACCESS_REQUIRED'")
    expect(fn).toContain('own_consent.withdrawn_at IS NULL')
    expect(fn).toContain('own_membership.school_id = requested_school_id')
  })
  it('명단은 이름·졸업연도·반만 받고, 인스타는 명단·요청 화면에 없다', () => {
    expect(readFileSync('lib/schoolRoster.ts', 'utf8')).toContain('}).strict()).max(500)')
    expect(view).not.toMatch(/instagram_handle|instagramHandle/)
  })
  it('인스타 요청은 기존 정확 검색 → 연결 요청 API를 고정 문구로 부르고, 이미 보낸 요청(409)은 다시 보내지 않는다', () => {
    expect(view).toContain("fetch('/api/connections/search'")
    expect(view).toContain("fetch('/api/connections/requests'")
    expect(view).toContain('message: ROSTER_REQUEST_MESSAGE')
    expect(view).toContain('response.status === 409')
    expect(view).not.toMatch(/textarea/)
  })
})
