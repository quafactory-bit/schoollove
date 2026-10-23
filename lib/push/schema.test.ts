import { describe, expect, it } from 'vitest'
import { PushSubscriptionSchema, PushUnsubscribeSchema } from './schema'

const valid = {
  endpoint: 'https://push.example.test/subscription',
  keys: { p256dh: 'public-encryption-key', auth: 'auth-secret' },
}

describe('push subscription input', () => {
  it('브라우저 구독의 endpoint와 두 암호화 키만 허용한다', () => {
    expect(PushSubscriptionSchema.safeParse(valid).success).toBe(true)
    expect(PushSubscriptionSchema.safeParse({ ...valid, user_id: 'forged' }).success).toBe(false)
    expect(PushSubscriptionSchema.safeParse({ endpoint: valid.endpoint, keys: { p256dh: 'only-one' } }).success).toBe(false)
    expect(PushSubscriptionSchema.safeParse({ ...valid, endpoint: 'http://push.example.test/subscription' }).success).toBe(false)
  })

  it('해지 요청은 endpoint 외 필드를 거부한다', () => {
    expect(PushUnsubscribeSchema.safeParse({ endpoint: valid.endpoint }).success).toBe(true)
    expect(PushUnsubscribeSchema.safeParse({ endpoint: valid.endpoint, user_id: 'forged' }).success).toBe(false)
    expect(PushUnsubscribeSchema.safeParse({ endpoint: 'http://push.example.test/subscription' }).success).toBe(false)
  })
})
