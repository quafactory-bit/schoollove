import { createHash } from 'node:crypto'

// v2-09a: 푸시 알림은 2종(새 동문 / 인스타 요청·수락)만 보낸다. 마케팅·공지·요약 없음.
// 이름은 받는 사람이 출석부에서 볼 수 있는 사람의 이름만 넣고, 아니면 이름 없이 보낸다.
// 인스타 주소·연락처·계정 식별자는 알림에 넣지 않는다.
export type PushKind = 'new_member' | 'request' | 'accepted'

export type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
}

export const NEW_MEMBER_DAILY_CAP = 3
export const NEW_MEMBER_BUNDLE_SECONDS = 60 * 60

export function shortSchoolName(schoolName: string): string {
  return schoolName.trim()
    .replace(/고등학교$/, '고')
    .replace(/중학교$/, '중')
    .replace(/초등학교$/, '초')
}

export function buildNewMemberPayload(input: { schoolName: string; graduationYear: number; memberName: string | null; total: number }): PushPayload {
  const school = shortSchoolName(input.schoolName)
  const total = Math.max(1, Math.trunc(input.total))
  return {
    title: `${school} ${input.graduationYear}년에 새 동문이 들어왔어요`,
    body: input.memberName
      ? `${input.memberName}님이 출석부에 등록했어요. 이제 ${total}명이에요.`
      : `새 동문 1명이 출석부에 등록했어요. 이제 ${total}명이에요.`,
    url: '/account',
    tag: 'schoollove-new-member',
  }
}

export function buildRequestPayload(senderName: string | null): PushPayload {
  return {
    title: senderName ? `${senderName}님이 인스타 주소를 요청했어요` : '인스타 주소 요청이 왔어요',
    body: '수락하면 연결돼요. 무시해도 상대는 몰라요.',
    url: '/notifications',
    tag: 'schoollove-request',
  }
}

export function buildAcceptedPayload(accepterName: string | null): PushPayload {
  return {
    title: accepterName ? `${accepterName}님이 수락했어요` : '보낸 요청이 수락됐어요',
    body: '이제 연결됐어요. 상대가 허용한 인스타 주소는 알림 탭에서 볼 수 있어요.',
    url: '/notifications',
    tag: 'schoollove-accepted',
  }
}

export function kstParts(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) }
}

// 23:00~07:00 KST에는 보내지 않는다(앱 알림 탭에는 그대로 남는다).
export function isQuietHourKst(now: Date): boolean {
  const { hour } = kstParts(now)
  return hour >= 23 || hour < 7
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

// Redis 키에는 계정 ID·endpoint 원문 대신 해시만 쓴다.
export function newMemberBundleKey(recipientUserId: string, schoolId: string, graduationYear: number): string {
  return `schoollove:push:v2:new-member:1h:${digest(`${recipientUserId}|${schoolId}|${graduationYear}`)}`
}

export function newMemberDailyKey(recipientUserId: string, now: Date): string {
  return `schoollove:push:v2:new-member:day:${kstParts(now).date}:${digest(recipientUserId)}`
}

export function chunkPushSubscriptions<T>(subscriptions: T[], size = 50): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < subscriptions.length; index += size) {
    chunks.push(subscriptions.slice(index, index + size))
  }
  return chunks
}
