import { z } from 'zod'

export const CONNECTION_RELATIONSHIPS = [
  'same_class',
  'same_school',
  'senior_junior',
  'club',
  'other',
] as const

export type ConnectionRelationship = (typeof CONNECTION_RELATIONSHIPS)[number]

const urlPattern = /(?:https?:\/\/|www\.)\S+|(?:\b[A-Za-z0-9-]+\.)+(?:com|net|org|kr|io|me|co|app|dev)\b(?:\/\S*)?/iu
const emailPattern = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[A-Za-z]{2,}/iu
const phonePattern = /(?:\+?82[- .]?)?(?:0\d{1,2}[- .]?)?\d{3,4}[- .]?\d{4}/u
const bareHandlePattern = /(^|\s)@[A-Za-z0-9._-]{2,30}(?=\s|$)/u
const externalIdPattern = /(?:카카오(?:톡)?|카톡|kakao|인스타(?:그램)?|instagram|텔레그램|telegram|라인|line)\s*(?:아이디|id)?\s*[:：]?\s*[A-Za-z0-9@._-]{2,}/iu

export function containsExternalContact(value: string): boolean {
  return [urlPattern, emailPattern, phonePattern, bareHandlePattern, externalIdPattern]
    .some((pattern) => pattern.test(value))
}

export function normalizeConnectionText(value: string): string {
  return value.normalize('NFKC').replace(/\r\n?/g, '\n').trim()
}

function safeText(max: number) {
  return z.string().transform(normalizeConnectionText).pipe(
    z.string().min(1).max(max).refine((value) => !containsExternalContact(value), {
      message: '외부 연락처는 연결 안에서 공유할 수 없습니다.',
    })
  )
}

export const ExactPersonSearchSchema = z.object({
  school_id: z.string().uuid(),
  graduation_year: z.number().int().min(1900).max(2200),
  exact_name: z.string().transform((value) => value.normalize('NFKC').trim()).pipe(
    z.string().min(2).max(50).refine((value) => !/^[\u1100-\u11FF\u3130-\u318F\s]+$/u.test(value), {
      message: '초성 검색은 지원하지 않습니다.',
    })
  ),
}).strict()

export const ConnectionRequestSchema = z.object({
  match_token: z.string().uuid(),
  relationship_type: z.enum(CONNECTION_RELATIONSHIPS),
  message: safeText(200),
}).strict()

export const ConnectionMessageSchema = z.object({
  message: safeText(500),
}).strict()

export const RequestActionSchema = z.object({
  action: z.enum(['accept', 'decline', 'not_the_person', 'block', 'report']),
  reason_code: z.enum(['wrong_person', 'harassment', 'spam', 'privacy', 'other']).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'report' && !value.reason_code) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason_code'], message: '신고 사유가 필요합니다.' })
  }
})

export const SafetyReportSchema = z.object({
  reason_code: z.enum(['wrong_person', 'harassment', 'spam', 'privacy', 'other']),
  message_id: z.string().uuid().optional(),
}).strict()

export function maskDisplayName(value: string): string {
  const chars = Array.from(value.trim())
  if (chars.length <= 1) return '*'
  if (chars.length === 2) return `${chars[0]}*`
  return `${chars[0]}${'*'.repeat(Math.min(3, chars.length - 2))}${chars.at(-1)}`
}
