import { describe, expect, it } from 'vitest'
import {
  ConnectionMessageSchema,
  ConnectionRequestSchema,
  ExactPersonSearchSchema,
  containsExternalContact,
  maskDisplayName,
} from './connectionSafety'

describe('PHASE 10C connection safety policy', () => {
  it('학교·졸업연도·정확한 이름만 받고 한 글자·초성·추가 필드를 거부한다', () => {
    const base = { school_id: '11111111-1111-4111-8111-111111111111', graduation_year: 2005 }
    expect(ExactPersonSearchSchema.safeParse({ ...base, exact_name: '김하늘' }).success).toBe(true)
    expect(ExactPersonSearchSchema.safeParse({ ...base, exact_name: '김' }).success).toBe(false)
    expect(ExactPersonSearchSchema.safeParse({ ...base, exact_name: 'ㄱㅎㄴ' }).success).toBe(false)
    expect(ExactPersonSearchSchema.safeParse({ ...base, exact_name: '김하늘', page: 2 }).success).toBe(false)
  })

  it.each([
    'https://example.com',
    'example.kr/profile',
    'hello@example.com',
    '010-1234-5678',
    '010 1234 5678',
    '0 1 0 1 2 3 4 5 6 7 8',
    '@friend',
    '@school_friend',
    '@friend,',
    '@friend.',
    '@friend!',
    '@friend?',
    '(@friend_name)',
    '[@friend_name]',
    '{@friend_name}',
    '카카오 아이디 friend12',
    '카톡 아이디 friend123',
    'Kakao ID friend123',
    'k a k a o id friend12',
    '인스타 아이디 friend12',
    'Instagram: friend.name',
    'Ｉｎｓｔａｇｒａｍ： friend12',
    'example dot kr',
    'https:\u200b//example.com',
  ])('외부 연락처 패턴을 거부한다: %s', (value) => {
    expect(containsExternalContact(value)).toBe(true)
    expect(ConnectionRequestSchema.safeParse({
      match_token: '11111111-1111-4111-8111-111111111111',
      relationship_type: 'same_school',
      message: `안녕 ${value}`,
    }).success).toBe(false)
    expect(ConnectionMessageSchema.safeParse({ message: `안녕 ${value}` }).success).toBe(false)
  })

  it('자연스러운 자기소개와 일반 숫자·문장부호는 허용한다', () => {
    const input = {
      match_token: '11111111-1111-4111-8111-111111111111',
      relationship_type: 'same_school',
      message: '나 완이야. 오랜만이야.',
    }
    expect(ConnectionRequestSchema.safeParse(input).success).toBe(true)
    expect(ConnectionMessageSchema.safeParse({ message: '우리 3학년 2반이었지?' }).success).toBe(true)
    expect(ConnectionMessageSchema.safeParse({ message: '정말 반가워! 잘 지냈어?' }).success).toBe(true)
    expect(ConnectionMessageSchema.safeParse({ message: '우리 @ 기호도 썼었지.' }).success).toBe(true)
  })

  it('최초 안부 200자와 연결 후 메시지 500자 경계를 분리한다', () => {
    const token = '11111111-1111-4111-8111-111111111111'
    expect(ConnectionRequestSchema.safeParse({ match_token: token, relationship_type: 'same_school', message: '가'.repeat(200) }).success).toBe(true)
    expect(ConnectionRequestSchema.safeParse({ match_token: token, relationship_type: 'same_school', message: '가'.repeat(201) }).success).toBe(false)
    expect(ConnectionMessageSchema.safeParse({ message: '가'.repeat(500) }).success).toBe(true)
    expect(ConnectionMessageSchema.safeParse({ message: '가'.repeat(501) }).success).toBe(false)
  })

  it('수신자에게 요청자 이름을 최소 마스킹한다', () => {
    expect(maskDisplayName('김하늘')).toBe('김*늘')
    expect(maskDisplayName('민수')).toBe('민*')
  })
})
