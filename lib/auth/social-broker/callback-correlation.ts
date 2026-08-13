import 'server-only'
import { parseDurableUpstreamCallback, upstreamClientBindingDigest, upstreamStateDigest, type DurableUpstreamCallback } from './durable-upstream-leg'
import type { SocialProvider } from './types'

export type UpstreamCallbackRegistry = Readonly<Record<SocialProvider, Readonly<{ clientId: string; redirectUri: string }>>>
export type ParsedUpstreamCallback = DurableUpstreamCallback
export type StateClaimResult = Readonly<{
  outcome: string; attemptId: string | null; legId: string | null; provider: SocialProvider | null; nonceDigest: Uint8Array | null
  pkceS256Challenge: string | null; pkceVerifierCiphertext: Uint8Array | null; pkceVerifierIv: Uint8Array | null; pkceVerifierKeyVersion: number | null
}>
export type ClaimByState = (input: Readonly<{ provider: SocialProvider; clientBindingDigest: Uint8Array; stateDigest: Uint8Array }>) => Promise<StateClaimResult>
export type ClaimedUpstreamCallbackContext = Readonly<{
  provider: SocialProvider; authorizationCode: string; rawState: string; attemptId: string; legId: string; nonceDigest: Uint8Array | null
  pkce: Readonly<{ challenge: string; ciphertext: Uint8Array; iv: Uint8Array; keyVersion: number }> | null
}>

/** Parses untrusted provider input, then converts its opaque state proof into DB-resolved trusted IDs. */
export async function correlateUpstreamCallback(input: Readonly<{ provider: SocialProvider; callbackUrl: string; registry: UpstreamCallbackRegistry; claimByState: ClaimByState }>): Promise<Readonly<{ parsed: ParsedUpstreamCallback; claim: StateClaimResult; context: ClaimedUpstreamCallbackContext | null }>> {
  const registered = input.registry[input.provider]
  const parsed = parseDurableUpstreamCallback({ provider: input.provider, callbackUrl: input.callbackUrl, redirectUri: registered.redirectUri })
  const claim = await input.claimByState({ provider: input.provider, clientBindingDigest: upstreamClientBindingDigest({ provider: input.provider, ...registered }), stateDigest: upstreamStateDigest(parsed.rawState) })
  if (claim.outcome !== 'CALLBACK_CLAIMED') return Object.freeze({ parsed, claim, context: null })
  const { attemptId, legId, provider } = claim
  if (!attemptId || !legId || !provider) throw new Error('UPSTREAM_CALLBACK_CLAIM_REJECTED')
  const hasPkce = claim.pkceS256Challenge !== null || claim.pkceVerifierCiphertext !== null || claim.pkceVerifierIv !== null || claim.pkceVerifierKeyVersion !== null
  if (hasPkce && (!claim.pkceS256Challenge || !claim.pkceVerifierCiphertext || !claim.pkceVerifierIv || !claim.pkceVerifierKeyVersion)) throw new Error('UPSTREAM_CALLBACK_CLAIM_REJECTED')
  return Object.freeze({ parsed, claim, context: Object.freeze({
    provider, authorizationCode: parsed.authorizationCode, rawState: parsed.rawState, attemptId, legId, nonceDigest: claim.nonceDigest,
    pkce: hasPkce ? Object.freeze({ challenge: claim.pkceS256Challenge!, ciphertext: claim.pkceVerifierCiphertext!, iv: claim.pkceVerifierIv!, keyVersion: claim.pkceVerifierKeyVersion! }) : null,
  }) })
}
