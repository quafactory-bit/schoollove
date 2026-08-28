import 'server-only'
import type { GoogleCallbackDiagnosticReason } from './errors'

const SAFE_ATTEMPT_ID = /^(?:att_[A-Za-z0-9_-]{16,64}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
const VERCEL_DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]{20,64}$/
const GIT_SHA = /^[0-9a-f]{40}$/i

export type GoogleCallbackDiagnosticEvent = Readonly<{
  event: 'google_callback_verification_failed'
  provider: 'google'
  attemptId?: string
  reason: GoogleCallbackDiagnosticReason
  at: number
  upstreamStatus?: number
  deploymentId?: string
  gitCommitSha?: string
}>

export function createGoogleCallbackDiagnosticEvent(input: Readonly<{
  attemptId: string
  reason: GoogleCallbackDiagnosticReason
  at: number
  upstreamStatus?: number
  env?: Readonly<Record<string, string | undefined>>
}>): GoogleCallbackDiagnosticEvent {
  const env = input.env ?? process.env
  const upstreamStatus = Number.isInteger(input.upstreamStatus) && input.upstreamStatus! >= 100 && input.upstreamStatus! <= 599
    ? input.upstreamStatus
    : undefined
  const deploymentId = env.VERCEL_DEPLOYMENT_ID
  const gitCommitSha = env.VERCEL_GIT_COMMIT_SHA
  return Object.freeze({
    event: 'google_callback_verification_failed',
    provider: 'google',
    ...(SAFE_ATTEMPT_ID.test(input.attemptId) ? { attemptId: input.attemptId } : {}),
    reason: input.reason,
    at: Number.isSafeInteger(input.at) && input.at >= 0 ? Math.floor(input.at / 60) * 60 : 0,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
    ...(deploymentId && VERCEL_DEPLOYMENT_ID.test(deploymentId) ? { deploymentId } : {}),
    ...(gitCommitSha && GIT_SHA.test(gitCommitSha) ? { gitCommitSha: gitCommitSha.toLowerCase() } : {}),
  })
}

export function serializeGoogleCallbackDiagnosticEvent(event: GoogleCallbackDiagnosticEvent): string {
  return JSON.stringify(event)
}

export function writeGoogleCallbackDiagnostic(input: Parameters<typeof createGoogleCallbackDiagnosticEvent>[0]): void {
  console.error(serializeGoogleCallbackDiagnosticEvent(createGoogleCallbackDiagnosticEvent(input)))
}
