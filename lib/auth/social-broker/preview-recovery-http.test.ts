import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { activePreviewRecoveryServices, recoveryGet } from './preview-recovery-http'

const recoverySource = readFileSync(new URL('./preview-recovery-http.ts', import.meta.url), 'utf8')
const completeSource = readFileSync(new URL('../../../app/auth/social/complete/SocialCompleteClient.tsx', import.meta.url), 'utf8')

describe('Preview first-login HTTP boundary', () => {
  it('keeps recovery unavailable off Preview and on foreign origins', async () => {
    vi.stubEnv('SCHOOLLOVE_SOCIAL_BROKER_EXPOSURE', 'off')
    await expect(activePreviewRecoveryServices(new Request('https://evil.example/auth/social/recovery'))).resolves.toBeNull()
    await expect(recoveryGet(new Request('https://preview.schoollove.kr/auth/social/recovery'))).resolves.toMatchObject({ status: 404 })
    vi.unstubAllEnvs()
  })

  it('accepts no browser durable identity fields and has no secret logging path', () => {
    expect(recoverySource).not.toMatch(/form\.get\(['"](?:attempt_id|account_id|transaction_id|provider|broker_subject)['"]\)/)
    expect(recoverySource).not.toMatch(/console\.|localStorage|sessionStorage/)
    expect(recoverySource).toContain("request.headers.get('origin') !== PREVIEW_BROKER_ISSUER")
    expect(recoverySource).toContain("identity.identity_data?.sub === continuity.brokerSubject")
  })

  it('removes Supabase URL-fragment credentials before session completion and never stores them', () => {
    expect(completeSource.indexOf("window.history.replaceState(null, '', '/auth/social/complete')")).toBeLessThan(completeSource.indexOf("fetch('/auth/social/complete/session'"))
    expect(completeSource).not.toMatch(/localStorage|sessionStorage|console\./)
    expect(completeSource).not.toMatch(/attempt_id|account_id|transaction_id|broker_subject/)
  })
})
