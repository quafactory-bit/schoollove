import { z } from 'zod'

export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith('https://').max(4096),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256),
  }).strict(),
}).strict()

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url().startsWith('https://').max(4096),
}).strict()

export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>
