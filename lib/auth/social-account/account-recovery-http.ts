import 'server-only'
import { sendAccountRecoveryOtp, verifyAccountRecoveryOtp, type AccountRecoveryDatabase, type AccountRecoveryKeys } from './account-recovery'
import type { RecoveryOtpDeliveryTransport } from './recovery-delivery'
import type { VersionedKey } from './recovery'

const headers = { 'cache-control': 'private, no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => Response.json(body, { status, headers })

type OwnerRpc = Readonly<{ rpc(name: string, args?: Record<string, unknown>): PromiseLike<Readonly<{ data: unknown; error: unknown }>> }>
export type AccountRecoveryOwner = Readonly<{ userId: string; client: OwnerRpc }>
export type AccountRecoveryHttpDependencies = Readonly<{
  owner(request: Request): Promise<AccountRecoveryOwner | null>
  /** Null when the broker/recovery configuration is not active on this origin. */
  services(request: Request): Promise<Readonly<{
    keys: AccountRecoveryKeys & Readonly<{ otpMacKey: VersionedKey }>
    database: AccountRecoveryDatabase
    transport: RecoveryOtpDeliveryTransport
  }> | null>
}>

type OwnerAccount = Readonly<{ accountId: string; status: string; recoveryVerified: boolean }>
async function ownerAccount(owner: AccountRecoveryOwner): Promise<OwnerAccount | null> {
  const { data, error } = await Promise.resolve(owner.client.rpc('get_social_account_state_for_owner'))
  if (error) return null
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  if (!row || typeof row.account_id !== 'string' || typeof row.status !== 'string' || typeof row.recovery_verified !== 'boolean') return null
  return { accountId: row.account_id, status: row.status, recoveryVerified: row.recovery_verified }
}

/** GET: owner-only "is a recovery email registered" flag. Never returns the address. */
export async function accountRecoveryGet(request: Request, deps: AccountRecoveryHttpDependencies): Promise<Response> {
  const owner = await deps.owner(request)
  if (!owner) return json({ error: 'AUTH_REQUIRED' }, 401)
  const account = await ownerAccount(owner)
  if (!account) return json({ registered: null, available: false })
  const available = account.status === 'active' && !account.recoveryVerified && (await deps.services(request)) !== null
  return json({ registered: account.recoveryVerified, available })
}

/** POST {action:'send', email} or {action:'verify', challenge, otp}. Same-origin only. */
export async function accountRecoveryPost(request: Request, deps: AccountRecoveryHttpDependencies): Promise<Response> {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) return json({ error: 'INVALID_ORIGIN' }, 403)
  const owner = await deps.owner(request)
  if (!owner) return json({ error: 'AUTH_REQUIRED' }, 401)
  const services = await deps.services(request)
  if (!services) return json({ error: 'RECOVERY_UNAVAILABLE' }, 503)
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return json({ error: 'INVALID_INPUT' }, 400) }
  if (!body || typeof body !== 'object') return json({ error: 'INVALID_INPUT' }, 400)

  if (body.action === 'send') {
    if (typeof body.email !== 'string' || body.email.length > 254) return json({ error: 'EMAIL_INVALID' }, 400)
    const account = await ownerAccount(owner)
    if (!account || account.status !== 'active') return json({ error: 'RECOVERY_UNAVAILABLE' }, 409)
    if (account.recoveryVerified) return json({ error: 'ALREADY_REGISTERED' }, 409)
    let result
    try {
      result = await sendAccountRecoveryOtp({ authUserId: owner.userId, accountId: account.accountId, recoveryEmail: body.email, keys: services.keys, database: services.database, transport: services.transport })
    } catch (error) {
      if (error instanceof Error && error.message === 'RECOVERY_EMAIL_INVALID') return json({ error: 'EMAIL_INVALID' }, 400)
      return json({ error: 'RECOVERY_UNAVAILABLE' }, 503)
    }
    if (result.state === 'sent') return json({ state: 'sent', challenge: result.verificationId })
    if (result.state === 'limited') return json({ error: 'LIMITED' }, 429)
    if (result.state === 'already_registered') return json({ error: 'ALREADY_REGISTERED' }, 409)
    return json({ error: result.state === 'failed' ? 'SEND_FAILED' : 'RECOVERY_UNAVAILABLE' }, 503)
  }

  if (body.action === 'verify') {
    if (typeof body.challenge !== 'string' || !UUID.test(body.challenge) || typeof body.otp !== 'string') return json({ error: 'INVALID_INPUT' }, 400)
    let outcome
    try {
      outcome = await verifyAccountRecoveryOtp({ authUserId: owner.userId, verificationId: body.challenge, otp: body.otp, otpMacKey: services.keys.otpMacKey, database: services.database })
    } catch { return json({ error: 'RECOVERY_UNAVAILABLE' }, 503) }
    const status = outcome === 'registered' ? 200 : outcome === 'otp_rejected' ? 401 : outcome === 'locked' ? 423 : outcome === 'expired' ? 410 : 409
    return json(outcome === 'registered' ? { state: 'registered' } : { error: outcome.toUpperCase() }, status)
  }
  return json({ error: 'INVALID_INPUT' }, 400)
}
