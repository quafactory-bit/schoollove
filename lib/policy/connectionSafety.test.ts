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
    '@school_friend',
    '카톡 아이디 friend123',
    'Kakao ID friend123',
    'Instagram: friend.name',
  ])('외부 연락처 패턴을 거부한다: %s', (value) => {
    expect(containsExternalContact(value)).toBe(true)
    expect(ConnectionMessageSchema.safeParse({ message: `안녕 ${value}` }).success).toBe(false)
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
