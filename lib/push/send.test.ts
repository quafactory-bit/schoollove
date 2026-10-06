import { describe, expect, it } from 'vitest'
import {
  buildPushRateLimitKey,
  buildSchoolmatePushPayload,
  chunkPushSubscriptions,
} from './contracts'

describe('schoolmate push boundaries', () => {
  it('알림에는 학교·졸업연도와 안전한 추적 URL만 넣는다', () => {
    const payload = buildSchoolmatePushPayload('테스트고등학교', 'test-school', 2014)
    expect(payload).toEqual({
      title: '스쿨러브아이',
      body: '테스트고등학교 2014년 졸업 동창이 새로 들어왔어요. 누군지 확인해보세요',
      url: '/school/test-school/2014?utm_source=push',
    })
    expect(JSON.stringify(payload)).not.toMatch(/instagram|user_id|display_name|class_number/i)
  })

  it('구독 endpoint를 Redis 키에 직접 넣지 않는다', () => {
    const endpoint = 'https://push.example.test/private-endpoint'
    const key = buildPushRateLimitKey(endpoint)
    expect(key).toMatch(/^schoollove:push:schoolmate:24h:[a-f0-9]{64}$/)
    expect(key).not.toContain(endpoint)
  })

  it('발송 대상을 50건씩 나눈다', () => {
    const chunks = chunkPushSubscriptions(Array.from({ length: 121 }, (_, index) => index))
    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 21])
  })
})
