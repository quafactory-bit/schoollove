import 'server-only'
import { resumeDurableUpstreamLoginLeg, upstreamClientBindingDigest, type UpstreamPkceVerifierKey } from './durable-upstream-leg'
import { verifyResumedNaverIdentity, verifyResumedOidcIdentity, type UpstreamHttpTransport } from './upstream-adapters'
import type { DurableProviderVerifier, TrustedUpstreamClient } from './dark-orchestrator'
import type { SocialProvider } from './types'

/** Adapts the existing stateless durable verifier APIs to the Q callback port. */
export function createDurableProviderVerifier(input: Readonly<{ upstream: Readonly<Record<SocialProvider, TrustedUpstreamClient>>; pkceKey: UpstreamPkceVerifierKey; transport: UpstreamHttpTransport; now: () => number }>): DurableProviderVerifier {
  return Object.freeze({
    async verify(context) {
      const client = input.upstream[context.provider]
      if (context.provider === 'naver') {
        const verified = await verifyResumedNaverIdentity({ authorizationCode: context.authorizationCode, rawState: context.rawState, clientId: client.clientId, redirectUri: client.redirectUri, transport: input.transport })
        return { provider: 'naver', upstreamSubject: verified.upstreamSubject, authenticationTime: input.now() }
      }
      if (!context.pkce || !context.nonceDigest) throw new Error('DARK_CALLBACK_REJECTED')
      const clientBindingDigest = upstreamClientBindingDigest({ provider: context.provider, clientId: client.clientId, redirectUri: client.redirectUri })
      const codeVerifier = resumeDurableUpstreamLoginLeg({ encrypted: { challenge: context.pkce.challenge, ciphertext: context.pkce.ciphertext, iv: context.pkce.iv, keyVersion: context.pkce.keyVersion }, key: input.pkceKey, attemptId: context.attemptId, legId: context.legId, provider: context.provider, clientBindingDigest })
      const verified = await verifyResumedOidcIdentity({ provider: context.provider, authorizationCode: context.authorizationCode, clientId: client.clientId, redirectUri: client.redirectUri, codeVerifier, nonceDigest: context.nonceDigest, transport: input.transport, now: input.now() })
      return { provider: context.provider, upstreamSubject: verified.upstreamSubject, authenticationTime: verified.authenticationTime ?? input.now() }
    },
  })
}
