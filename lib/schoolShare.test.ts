import { describe, expect, it, vi } from 'vitest'
import {
  buildSchoolSharePayload,
  executeSchoolShare,
  formatSchoolShareClipboard,
} from './schoolShare'

const origin = 'https://preview.schoollove.kr'

describe('privacy-safe school share payload', () => {
  it('현재 origin과 승인된 학교 path로만 절대 URL을 만든다', () => {
    expect(buildSchoolSharePayload({ schoolName: '테스트고등학교', href: '/school/test-school', origin })).toEqual({
      title: '스쿨러브아이',
      text: '스쿨러브아이에서 테스트고등학교 학교 정보를 확인해 보세요.',
      url: 'https://preview.schoollove.kr/school/test-school',
    })
  })

  it.each([
    '/school/test-school?from=user',
    '/school/test-school#member',
    '/school/test-school/2020',
    '//example.com/school/test-school',
    'https://example.com/school/test-school',
    '/account',
  ])('승인된 단일 학교 segment가 아닌 path %s를 거부한다', (href) => {
    expect(buildSchoolSharePayload({ schoolName: '테스트고등학교', href, origin })).toBeNull()
  })

  it('Preview에서 Production 또는 외부 origin을 하드코딩하지 않는다', () => {
    const payload = buildSchoolSharePayload({ schoolName: '테스트고등학교', href: '/school/test-school', origin })
    expect(payload?.url).toMatch(/^https:\/\/preview\.schoollove\.kr\/school\//)
    expect(payload?.url).not.toContain('www.schoollove.kr')
  })

  it('전체 membership 대신 학교명과 href만 받아 private 필드를 payload에 포함하지 않는다', () => {
    const privateSentinels = {
      graduationYear: '2099-private-year',
      classNumber: 'private-class',
      instagram: 'private-instagram',
      displayName: 'private-display-name',
      membershipId: 'private-membership-id',
      schoolId: 'private-school-id',
      userId: 'private-user-id',
      authUuid: 'private-auth-uuid',
    }
    const payload = buildSchoolSharePayload({ schoolName: '테스트고등학교', href: '/school/test-school', origin })
    const serialized = JSON.stringify(payload)
    for (const value of Object.values(privateSentinels)) expect(serialized).not.toContain(value)
  })

  it('native share 성공 시 clipboard를 호출하지 않는다', async () => {
    const payload = buildSchoolSharePayload({ schoolName: '테스트고등학교', href: '/school/test-school', origin })!
    const writeClipboard = vi.fn(async () => undefined)
    await expect(executeSchoolShare(payload, { share: vi.fn(async () => undefined), writeClipboard })).resolves.toBe('shared')
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('native share AbortError는 사용자 취소로 유지하고 clipboard fallback을 실행하지 않는다', async () => {
    const payload = buildSchoolSharePayload({ schoolName: '테스트고등학교', href: '/school/test-school', origin })!
    const writeClipboard = vi.fn(async () => undefined)
    const share = vi.fn(async () => { throw { name: 'AbortError' } })
    await expect(executeSchoolShare(payload, { share, writeClipboard })).resolves.toBe('cancelled')
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('native share 미지원이면 generic text와 같은-origin URL만 clipboard에 복사한다', async () => {
    const payload = buildSchoolSharePayload({ schoolName: '테스트고등학교', href: '/school/test-school', origin })!
    const writeClipboard = vi.fn(async () => undefined)
    await expect(executeSchoolShare(payload, { writeClipboard })).resolves.toBe('copied')
    expect(writeClipboard).toHaveBeenCalledWith('스쿨러브아이에서 테스트고등학교 학교 정보를 확인해 보세요.\nhttps://preview.schoollove.kr/school/test-school')
  })

  it('native share의 실제 실패는 safe clipboard fallback으로 전환한다', async () => {
    const payload = buildSchoolSharePayload({ schoolName: '테스트고등학교', href: '/school/test-school', origin })!
    const writeClipboard = vi.fn(async () => undefined)
    const share = vi.fn(async () => { throw new Error('platform unavailable') })
    await expect(executeSchoolShare(payload, { share, writeClipboard })).resolves.toBe('copied')
    expect(writeClipboard).toHaveBeenCalledWith(formatSchoolShareClipboard(payload))
  })

  it('공유와 clipboard가 모두 불가능하면 private fallback이나 저장을 만들지 않는다', async () => {
    const payload = buildSchoolSharePayload({ schoolName: '테스트고등학교', href: '/school/test-school', origin })!
    await expect(executeSchoolShare(payload, {})).resolves.toBe('unavailable')
    await expect(executeSchoolShare(payload, { writeClipboard: async () => { throw new Error('denied') } })).resolves.toBe('unavailable')
  })
})
