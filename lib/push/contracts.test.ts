import { describe, expect, it } from 'vitest'
import {
  buildAcceptedPayload, buildNewMemberPayload, buildRequestPayload, chunkPushSubscriptions, isQuietHourKst,
  newMemberBundleKey, newMemberDailyKey, shortSchoolName,
} from './contracts'

describe('v2-09a push copy', () => {
  it('new member: school short name, year, visible name and total', () => {
    expect(shortSchoolName('서초고등학교')).toBe('서초고')
    expect(buildNewMemberPayload({ schoolName: '서초고등학교', graduationYear: 2005, memberName: '최유진', total: 5 })).toEqual({
      title: '서초고 2005년에 새 동문이 들어왔어요',
      body: '최유진님이 출석부에 등록했어요. 이제 5명이에요.',
      url: '/account',
      tag: 'schoollove-new-member',
    })
  })

  it('omits the name when the recipient cannot see it', () => {
    expect(buildNewMemberPayload({ schoolName: '대치중학교', graduationYear: 2001, memberName: null, total: 2 }).body).toBe('새 동문 1명이 출석부에 등록했어요. 이제 2명이에요.')
    expect(buildRequestPayload(null).title).toBe('인스타 주소 요청이 왔어요')
    expect(buildAcceptedPayload(null).title).toBe('보낸 요청이 수락됐어요')
  })

  it('request and accepted go to the notifications tab and never carry contacts', () => {
    const request = buildRequestPayload('김민수')
    const accepted = buildAcceptedPayload('김민수')
    expect(request).toMatchObject({ title: '김민수님이 인스타 주소를 요청했어요', url: '/notifications' })
    expect(accepted).toMatchObject({ title: '김민수님이 수락했어요', url: '/notifications' })
    for (const payload of [request, accepted]) expect(JSON.stringify(payload)).not.toMatch(/@|instagram\.com|http/)
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
