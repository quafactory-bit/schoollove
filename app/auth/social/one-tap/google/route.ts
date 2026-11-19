import { loadUserLoginBrokerConfig } from '@/lib/auth/social-broker/preview-config'
import { oneTapPost } from '@/lib/auth/social-broker/one-tap-http'
import { createServerUpstreamTransport } from '@/lib/auth/social-broker/server-transport'

export const dynamic = 'force-dynamic'

/** P2b: Google One Tap credential → short-lived account hint for the ordinary Google login. */
export async function POST(request: Request) {
  const config = loadUserLoginBrokerConfig()
  return oneTapPost(request, {
    issuer: config?.issuer ?? null,
    clientId: process.env.NEXT_PUBLIC_GOOGLE_ONE_TAP_CLIENT_ID,
    browserSessionKey: config?.browserSessionKey ?? null,
    transport: createServerUpstreamTransport({}),
    now: () => Math.floor(Date.now() / 1000),
  })
}
