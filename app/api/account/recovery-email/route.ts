import type { NextRequest } from 'next/server'
import { getAuthenticatedRequestContext } from '@/lib/user-auth'
import { accountRecoveryGet, accountRecoveryPost, type AccountRecoveryHttpDependencies } from '@/lib/auth/social-account/account-recovery-http'
import { activeBrokerRecoveryServices } from '@/lib/auth/social-broker/preview-recovery-http'
import { createAccountRecoveryDatabase } from '@/lib/auth/social-broker/preview-persistence'
import { ResendRecoveryOtpDeliveryTransport } from '@/lib/auth/social-account/resend-recovery-transport'

export const dynamic = 'force-dynamic'

// Part 2 P2b: register the 8-digit custom recovery email later, from /account.
const deps: AccountRecoveryHttpDependencies = {
  async owner(request) {
    const auth = await getAuthenticatedRequestContext(request as NextRequest)
    return auth ? { userId: auth.user.id, client: auth.client } : null
  },
  async services(request) {
    const active = await activeBrokerRecoveryServices(request)
    if (!active) return null
    const recovery = active.config.recovery
    return {
      keys: { recoveryHmacKey: recovery.hmacKey, recoveryEncryptionKey: recovery.encryptionKey, otpMacKey: recovery.otpMacKey },
      database: createAccountRecoveryDatabase(active.client),
      transport: new ResendRecoveryOtpDeliveryTransport({ apiKey: recovery.resendApiKey, from: recovery.emailFrom }),
    }
  },
}

export const GET = (request: NextRequest) => accountRecoveryGet(request, deps)
export const POST = (request: NextRequest) => accountRecoveryPost(request, deps)
