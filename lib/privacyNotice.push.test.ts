import { describe, expect, it } from 'vitest'
import { OPTIONAL_COLLECTION_REFUSAL, OPTIONAL_PROFILE_COLLECTION } from './privacyNotice'

describe('동창 알림 개인정보 안내', () => {
  it('선택 수집 항목·목적·즉시 삭제와 선택 거부권을 명시한다', () => {
    const notice = OPTIONAL_PROFILE_COLLECTION.find((item) => item.title === '동창 알림 · 선택')

    expect(notice).toEqual({
      title: '동창 알림 · 선택',
      items: '푸시 알림 구독 정보(브라우저 푸시 주소와 암호화 키), 브라우저 정보',
      purpose: '같은 학교·졸업연도 동창 등록 알림 발송',
      retention: '알림 해지 또는 회원 탈퇴 시 즉시 삭제',
    })
    expect(OPTIONAL_COLLECTION_REFUSAL).toContain('동창 알림')
    expect(OPTIONAL_COLLECTION_REFUSAL).toContain('이용하지 않아도')
  })
})
