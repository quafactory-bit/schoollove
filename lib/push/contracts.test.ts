import { describe, expect, it } from 'vitest'
import {
  buildAcceptedPayload, buildNewMemberPayload, buildRequestPayload, chunkPushSubscriptions, isQuietHourKst,
  newMemberBundleKey, newMemberDailyKey, shortSchoolName,
} from './contracts'

describe('v2-09a push copy (운영자 결정 10/23: 이름 없음)', () => {
  it('new member: school short name, year and total only', () => {
    expect(shortSchoolName('서초고등학교')).toBe('서초고')
    expect(buildNewMemberPayload({ schoolName: '서초고등학교', graduationYear: 2005, total: 5 })).toEqual({
      title: '서초고 2005년에 새 동문이 들어왔어요',
      body: '출석부에 새 이름이 올라왔어요. 이제 5명이에요.',
      url: '/account',
      tag: 'schoollove-new-member',
    })
  })

  it('request and accepted: fixed copy to the notifications tab', () => {
    expect(buildRequestPayload()).toEqual({ title: '같은 학교 동문이 인스타 주소를 요청했어요', body: '수락하면 연결돼요.', url: '/notifications', tag: 'schoollove-request' })
    expect(buildAcceptedPayload()).toEqual({ title: '요청이 수락됐어요', body: '상대가 허용한 인스타 주소는 알림 탭에서.', url: '/notifications', tag: 'schoollove-accepted' })
  })

  it('never carries names, contacts or links outside the app', () => {
    for (const payload of [buildNewMemberPayload({ schoolName: '서초고등학교', graduationYear: 2005, total: 2 }), buildRequestPayload(), buildAcceptedPayload()]) {
      expect(JSON.stringify(payload)).not.toMatch(/님이|@|instagram\.com|http/)
    }
  })
})

describe('v2-09a push rules', () => {
  it.each([
    ['2026-10-23T13:59:00Z', false], // 22:59 KST
    ['2026-10-23T14:00:00Z', true], // 23:00 KST
    ['2026-10-23T21:59:00Z', true], // 06:59 KST
    ['2026-10-23T22:00:00Z', false], // 07:00 KST
  ])('quiet hours 23:00~07:00 KST: %s → %s', (iso, quiet) => {
    expect(isQuietHourKst(new Date(iso))).toBe(quiet)
  })

  it('keys use KST date and hashes, never raw ids', () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const daily = newMemberDailyKey(userId, new Date('2026-10-23T15:30:00Z'))
    expect(daily).toContain(':2026-10-24:')
    expect(daily).not.toContain(userId)
    const bundle = newMemberBundleKey(userId, 'school-id', 2005)
    expect(bundle).not.toContain(userId)
    expect(bundle).toBe(newMemberBundleKey(userId, 'school-id', 2005))
    expect(bundle).not.toBe(newMemberBundleKey(userId, 'school-id', 2006))
  })

  it('chunks deliveries by 50', () => {
    expect(chunkPushSubscriptions(Array.from({ length: 120 }, (_, index) => index)).map(chunk => chunk.length)).toEqual([50, 50, 20])
  })
})
