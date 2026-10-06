import { createHash } from 'node:crypto'

export type PushPayload = {
  title: string
  body: string
  url: string
}

export function buildPushRateLimitKey(endpoint: string): string {
  const digest = createHash('sha256').update(endpoint).digest('hex')
  return `schoollove:push:schoolmate:24h:${digest}`
}

export function buildSchoolmatePushPayload(
  schoolName: string,
  schoolSlug: string,
  graduationYear: number,
): PushPayload {
  return {
    title: '스쿨러브아이',
    body: `${schoolName} ${graduationYear}년 졸업 동창이 새로 들어왔어요. 누군지 확인해보세요`,
    url: `/school/${encodeURIComponent(schoolSlug)}/${graduationYear}?utm_source=push`,
  }
}

export function chunkPushSubscriptions<T>(subscriptions: T[], size = 50): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < subscriptions.length; index += size) {
    chunks.push(subscriptions.slice(index, index + size))
  }
  return chunks
}
